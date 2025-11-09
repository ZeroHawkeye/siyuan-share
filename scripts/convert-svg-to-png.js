const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function convertSvgToPng() {
  const rootDir = path.join(__dirname, '..');
  
  // 转换 icon.svg -> icon.png (160x160, <20KB)
  console.log('Converting icon.svg to icon.png...');
  try {
    await sharp(path.join(rootDir, 'icon.svg'))
      .resize(160, 160)
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(path.join(rootDir, 'icon.png'));
    
    const iconStats = fs.statSync(path.join(rootDir, 'icon.png'));
    console.log(`✓ icon.png created: ${iconStats.size} bytes (${(iconStats.size / 1024).toFixed(2)} KB)`);
    
    if (iconStats.size > 20 * 1024) {
      console.warn(`⚠ Warning: icon.png is ${(iconStats.size / 1024).toFixed(2)} KB, exceeds 20KB limit`);
    }
  } catch (error) {
    console.error('Error converting icon.svg:', error);
  }
  
  // 转换 preview.svg -> preview.png (1024x768, <200KB)
  console.log('\nConverting preview.svg to preview.png...');
  try {
    await sharp(path.join(rootDir, 'preview.svg'))
      .resize(1024, 768)
      .png({ quality: 85, compressionLevel: 9 })
      .toFile(path.join(rootDir, 'preview.png'));
    
    const previewStats = fs.statSync(path.join(rootDir, 'preview.png'));
    console.log(`✓ preview.png created: ${previewStats.size} bytes (${(previewStats.size / 1024).toFixed(2)} KB)`);
    
    if (previewStats.size > 200 * 1024) {
      console.warn(`⚠ Warning: preview.png is ${(previewStats.size / 1024).toFixed(2)} KB, exceeds 200KB limit`);
    }
  } catch (error) {
    console.error('Error converting preview.svg:', error);
  }
  
  console.log('\n✓ Conversion complete!');
}

convertSvgToPng().catch(console.error);
