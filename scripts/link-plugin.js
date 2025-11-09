const fs = require('fs');
const path = require('path');

// 配置：思源笔记工作空间目录
const SIYUAN_WORKSPACE = process.env.SIYUAN_WORKSPACE || 'C:\\Users\\zero\\Documents\\zeroDocs';
const PLUGIN_NAME = 'siyuan-share';

// 需要链接的文件
const FILES_TO_LINK = [
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

console.log('🔗 开始链接插件到思源笔记...');
console.log(`   源目录: ${sourceDir}`);
console.log(`   目标目录: ${targetDir}`);

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log('✓ 创建插件目录');
}

// 创建符号链接
let successCount = 0;
let skipCount = 0;

FILES_TO_LINK.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  // 检查源文件是否存在
  if (!fs.existsSync(sourcePath)) {
    console.log(`⚠ 跳过不存在的文件: ${file}`);
    return;
  }

  try {
    // 如果目标已存在，先删除
    if (fs.existsSync(targetPath)) {
      const stats = fs.lstatSync(targetPath);
      if (stats.isSymbolicLink()) {
        fs.unlinkSync(targetPath);
      } else {
        // 如果是真实文件/目录，先备份
        const backupPath = targetPath + '.backup';
        if (fs.existsSync(backupPath)) {
          fs.rmSync(backupPath, { recursive: true, force: true });
        }
        fs.renameSync(targetPath, backupPath);
        console.log(`  备份已存在的文件: ${file} -> ${file}.backup`);
      }
    }

    // 创建符号链接
    const type = fs.statSync(sourcePath).isDirectory() ? 'junction' : 'file';
    fs.symlinkSync(sourcePath, targetPath, type);
    console.log(`✓ 链接: ${file}`);
    successCount++;
  } catch (error) {
    console.error(`✗ 链接失败 ${file}:`, error.message);
  }
});

console.log(`\n🎉 链接完成！成功: ${successCount}, 跳过: ${skipCount}`);
console.log('💡 提示: 现在可以重启思源笔记来加载插件');
console.log('💡 如果需要修改工作空间路径，请设置环境变量 SIYUAN_WORKSPACE');
