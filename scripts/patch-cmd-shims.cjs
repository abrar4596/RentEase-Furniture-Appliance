const fs = require('fs');
const path = require('path');

function patchDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      patchDirectory(fullPath);
    } else if (entry.name.endsWith('.cmd')) {
      try {
        let content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('SET dp0=%~dp0')) {
          content = content.replace(/SET dp0=%~dp0/g, 'SET "dp0=%~dp0"');
          fs.writeFileSync(fullPath, content, 'utf8');
        }
      } catch (e) {
        // Ignore read/write errors on locked files
      }
    }
  }
}

const rootBin = path.join(__dirname, '..', 'node_modules', '.bin');
patchDirectory(rootBin);
// eslint-disable-next-line no-console
console.log('✔ Windows cmd-shims patched for paths containing special characters.');
