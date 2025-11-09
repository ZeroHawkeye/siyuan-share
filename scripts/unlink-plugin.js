const fs = require('fs');
const path = require('path');

// 配置：思源笔记工作空间目录
const SIYUAN_WORKSPACE = process.env.SIYUAN_WORKSPACE || 'C:\\Users\\zero\\Documents\\zeroDocs';
const PLUGIN_NAME = 'siyuan-share';

const targetDir = path.join(SIYUAN_WORKSPACE, 'data', 'plugins', PLUGIN_NAME);

console.log('🔓 开始取消链接插件...');
console.log(`   目标目录: ${targetDir}`);

if (!fs.existsSync(targetDir)) {
  console.log('⚠ 插件目录不存在，无需取消链接');
  process.exit(0);
}

try {
  // 删除整个插件目录（包含所有符号链接）
  fs.rmSync(targetDir, { recursive: true, force: true });
  console.log('✓ 已删除插件目录及所有链接');
  
  // 恢复备份文件（如果存在）
  const pluginsDir = path.dirname(targetDir);
  const backupFiles = fs.readdirSync(pluginsDir).filter(f => f.includes('.backup'));
  
  if (backupFiles.length > 0) {
    console.log('\n发现备份文件:');
    backupFiles.forEach(backup => {
      const backupPath = path.join(pluginsDir, backup);
      const originalPath = backupPath.replace('.backup', '');
      fs.renameSync(backupPath, originalPath);
      console.log(`✓ 恢复: ${backup} -> ${path.basename(originalPath)}`);
    });
  }
  
  console.log('\n🎉 取消链接完成！');
} catch (error) {
  console.error('✗ 取消链接失败:', error.message);
  process.exit(1);
}
