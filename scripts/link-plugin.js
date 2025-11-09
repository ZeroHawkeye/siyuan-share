const fs = require('fs');
const path = require('path');

// 配置：思源笔记工作空间目录
const SIYUAN_WORKSPACE = process.env.SIYUAN_WORKSPACE || 'C:\\Users\\zero\\Documents\\zeroDocs';
const PLUGIN_NAME = 'siyuan-share';

// 需要复制的文件
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

const sourceDir = path.resolve(__dirname, '..');
const targetDir = path.join(SIYUAN_WORKSPACE, 'data', 'plugins', PLUGIN_NAME);

console.log('📋 开始复制插件到思源笔记...');
console.log(`   源目录: ${sourceDir}`);
console.log(`   目标目录: ${targetDir}`);

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log('✓ 创建插件目录');
}

/**
 * 递归复制文件或目录
 */
function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  
  if (stats.isDirectory()) {
    // 创建目标目录
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    // 递归复制目录内容
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    // 复制文件
    fs.copyFileSync(src, dest);
  }
}

/**
 * 复制单个文件或目录
 */
function copyFile(file) {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  // 检查源文件是否存在
  if (!fs.existsSync(sourcePath)) {
    console.log(`⚠ 跳过不存在的文件: ${file}`);
    return false;
  }

  try {
    // 如果目标已存在，先删除
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }

    // 复制文件或目录
    copyRecursive(sourcePath, targetPath);
    console.log(`✓ 复制: ${file}`);
    return true;
  } catch (error) {
    console.error(`✗ 复制失败 ${file}:`, error.message);
    return false;
  }
}

// 执行初始复制
let successCount = 0;
FILES_TO_COPY.forEach(file => {
  if (copyFile(file)) {
    successCount++;
  }
});

console.log(`\n🎉 复制完成！成功: ${successCount}/${FILES_TO_COPY.length}`);

// 如果启用了监视模式
if (process.argv.includes('--watch')) {
  console.log('\n👀 开启文件监视模式...');
  console.log('💡 文件变更将自动同步到插件目录');
  console.log('💡 按 Ctrl+C 退出监视模式\n');

  // 监视文件变化
  FILES_TO_COPY.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    
    if (!fs.existsSync(sourcePath)) {
      return;
    }

    try {
      const watcher = fs.watch(sourcePath, { recursive: true }, (eventType, filename) => {
        console.log(`🔄 检测到变更: ${file}${filename ? '/' + filename : ''}`);
        if (copyFile(file)) {
          console.log(`✓ 已更新: ${file}`);
        }
      });

      // 处理错误
      watcher.on('error', (error) => {
        console.error(`✗ 监视错误 ${file}:`, error.message);
      });
    } catch (error) {
      console.error(`✗ 无法监视 ${file}:`, error.message);
    }
  });
} else {
  console.log('💡 提示: 现在可以重启思源笔记来加载插件');
  console.log('💡 如果需要修改工作空间路径，请设置环境变量 SIYUAN_WORKSPACE');
  console.log('💡 使用 --watch 参数启用文件监视模式');
}
