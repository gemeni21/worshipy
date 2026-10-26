const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');

if (!fs.existsSync(standaloneDir)) {
  console.error('❌ Error: .next/standalone does not exist. Run "next build" first.');
  process.exit(1);
}

// 1. Copy public directory to .next/standalone/public
const publicSrc = path.join(rootDir, 'public');
const publicDest = path.join(standaloneDir, 'public');
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true });
  console.log('✓ Copied public assets to .next/standalone/public');
}

// 2. Copy .next/static to .next/standalone/.next/static
const staticSrc = path.join(rootDir, '.next', 'static');
const staticDest = path.join(standaloneDir, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  fs.cpSync(staticSrc, staticDest, { recursive: true });
  console.log('✓ Copied static assets to .next/standalone/.next/static');
}

console.log('🎉 Standalone build prepared successfully for desktop packaging!');
