/*
 * 高级开发链接脚本：支持以下能力
 * 1. 初始复制必要文件到思源插件目录
 * 2. 可选使用目录符号链接（--link-mode=symlink）实现真正“零复制”实时更新
 * 3. 使用 chokidar 稳健监视文件/目录（含新增/删除）并增量同步
 * 4. 内容哈希对比，避免无效重复复制，减少 I/O 及闪烁
 * 5. 可联动 webpack watch（--with-webpack），统一一个进程内输出日志
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

// 尝试加载 chokidar（若未安装给出提示）
let chokidar;
try { chokidar = require('chokidar'); } catch (e) {
  console.error('✗ 未安装 chokidar，请先执行: npm i -D chokidar');
  process.exit(1);
}

// 配置：思源笔记工作空间目录（优先环境变量）
const SIYUAN_WORKSPACE = process.env.SIYUAN_WORKSPACE || 'C:\\Users\\zero\\Documents\\zeroDocs';
const PLUGIN_NAME = 'siyuan-share';

// 所需核心文件/目录（开发模式）
const FILES_TO_COPY = [
  'plugin.json',
  'index.js',
  'index.css',
  'icon.png',
  'preview.png',
  'README.md',
  'README_zh_CN.md',
  'i18n'
];

const args = process.argv.slice(2);
const useWatch = args.includes('--watch');
const withWebpack = args.includes('--with-webpack');
const linkModeArg = args.find(a => a.startsWith('--link-mode='));
const linkMode = linkModeArg ? linkModeArg.split('=')[1] : 'copy'; // copy | symlink

const sourceDir = path.resolve(__dirname, '..');
const targetDir = path.join(SIYUAN_WORKSPACE, 'data', 'plugins', PLUGIN_NAME);

console.log('📋 准备链接插件');
console.log(`   源目录:    ${sourceDir}`);
console.log(`   目标目录:  ${targetDir}`);
console.log(`   模式:      ${linkMode}${useWatch ? ' + watch' : ''}${withWebpack ? ' + webpack' : ''}`);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(targetDir);

// 哈希缓存，避免重复复制
const hashCache = new Map();

function fileHash(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buf).digest('hex');
  } catch { return ''; }
}

function relativeFromSource(fullPath) {
  return path.relative(sourceDir, fullPath).replace(/\\/g, '/');
}

function copyEntry(srcFull) {
  const rel = relativeFromSource(srcFull).split(/\#/)[0];
  if (!rel || rel.startsWith('..')) return;
  const destFull = path.join(targetDir, rel);
  const stat = fs.existsSync(srcFull) ? fs.statSync(srcFull) : null;
  if (!stat) return;
  if (stat.isDirectory()) {
    ensureDir(destFull);
    return;
  }
  const newHash = fileHash(srcFull);
  const oldHash = hashCache.get(rel);
  if (newHash === oldHash) return; // 内容未变
  ensureDir(path.dirname(destFull));
  fs.copyFileSync(srcFull, destFull);
  hashCache.set(rel, newHash);
  console.log(`✓ 同步文件: ${rel}`);
}

function removeEntry(srcFull) {
  const rel = relativeFromSource(srcFull);
  const destFull = path.join(targetDir, rel);
  if (fs.existsSync(destFull)) {
    fs.rmSync(destFull, { recursive: true, force: true });
    hashCache.delete(rel);
    console.log(`– 删除文件: ${rel}`);
  }
}

function initialSync() {
  console.log('🚀 初始同步开始 ...');
  let count = 0;
  for (const item of FILES_TO_COPY) {
    const src = path.join(sourceDir, item);
    if (!fs.existsSync(src)) {
      console.log(`⚠ 缺失: ${item}`);
      continue;
    }
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      // 目录递归
      const stack = [src];
      while (stack.length) {
        const cur = stack.pop();
        const entries = fs.readdirSync(cur);
        for (const e of entries) {
          const full = path.join(cur, e);
          const s = fs.statSync(full);
          if (s.isDirectory()) stack.push(full);
          else copyEntry(full);
        }
      }
      ensureDir(path.join(targetDir, item));
    } else {
      copyEntry(src);
    }
    count++;
  }
  console.log(`🎉 初始同步完成（处理对象 ${count}/${FILES_TO_COPY.length}）`);
}

function createSymlinkMode() {
  console.log('🔗 使用符号链接模式 (开发建议)。');
  // 尝试对单文件建立硬链接/符号链接，对目录使用符号链接
  for (const item of FILES_TO_COPY) {
    const src = path.join(sourceDir, item);
    const dest = path.join(targetDir, item);
    if (!fs.existsSync(src)) {
      console.log(`⚠ 跳过不存在: ${item}`);
      continue;
    }
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    try {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.symlinkSync(src, dest, 'junction');
      } else {
        // 文件用硬链接，避免 Windows 某些权限问题
        fs.linkSync(src, dest);
      }
      console.log(`✓ 链接: ${item}`);
    } catch (e) {
      console.error(`✗ 链接失败 ${item}: ${e.message}`);
    }
  }
  console.log('💡 链接模式下无需复制，修改后即时反映。必要时重载思源插件即可。');
}

function startWatch() {
  console.log('👀 启动监视（chokidar）...');
  const watchTargets = FILES_TO_COPY.map(f => path.join(sourceDir, f));
  const watcher = chokidar.watch(watchTargets, {
    ignoreInitial: true,
    persistent: true,
    depth: 99,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 50,
    },
  });

  watcher
    .on('add', p => copyEntry(p))
    .on('change', p => copyEntry(p))
    .on('unlink', p => removeEntry(p))
    .on('addDir', p => {
      const rel = relativeFromSource(p);
      if (rel && !rel.startsWith('..')) ensureDir(path.join(targetDir, rel));
    })
    .on('unlinkDir', p => removeEntry(p))
    .on('error', err => console.error('✗ 监视错误:', err.message))
    .on('ready', () => console.log('✅ 监视就绪，等待变更...'));
}

function startWebpack(mode) {
  const args = [require.resolve('webpack/bin/webpack.js'), '--mode', 'development'];
  if (mode === 'watch') args.push('--watch');
  console.log(`🧩 启动 webpack (${mode === 'watch' ? 'watch' : 'once'}) ...`);
  const proc = spawn(process.execPath, args, { cwd: sourceDir, stdio: 'inherit' });
  proc.on('exit', code => console.log(`⚙ webpack 退出，代码: ${code}`));
}

// 主流程
if (linkMode === 'symlink') {
  createSymlinkMode();
  if (withWebpack) startWebpack(useWatch ? 'watch' : 'once');
} else {
  initialSync();
  if (useWatch) startWatch();
  if (withWebpack) startWebpack(useWatch ? 'watch' : 'once');
}

if (!useWatch && !withWebpack) {
  console.log('💡 可使用参数 --watch 进行增量同步，--with-webpack 启动编译，--link-mode=symlink 获取更快体验。');
  console.log('💡 示例: node scripts/link-plugin.js --watch --with-webpack');
}
