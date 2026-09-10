const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, 'dist');

const include = [
  'index.html',
  'diagnostics.html',
  'status.html',
  'test-website-pro.zip',
  'test-zip',
];

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

for (const item of include) {
  const src = path.resolve(__dirname, item);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(OUT, item);
  if (fs.statSync(src).isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('Build output written to dist/');
