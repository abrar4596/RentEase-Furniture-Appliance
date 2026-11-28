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
        if (/^SET dp0=%~dp0$/m.test(content)) {
          content = content.replace(/^SET dp0=%~dp0$/gm, 'SET "dp0=%~dp0"');
          fs.writeFileSync(fullPath, content, 'utf8');
        }
      } catch (e) {
        // Ignore read/write errors on locked files
      }
    }
  }
}

const projectRoot = path.join(__dirname, '..');

/** Every `node_modules/.bin` directory that npm may create in this monorepo. */
function collectBinDirs() {
  const bins = [path.join(projectRoot, 'node_modules', '.bin')];
  for (const group of ['apps', 'packages']) {
    const groupDir = path.join(projectRoot, group);
    if (!fs.existsSync(groupDir)) continue;
    for (const entry of fs.readdirSync(groupDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        bins.push(path.join(groupDir, entry.name, 'node_modules', '.bin'));
      }
    }
  }
  return bins;
}

for (const bin of collectBinDirs()) {
  patchDirectory(bin);
}
// eslint-disable-next-line no-console
console.log('✔ Windows cmd-shims patched for paths containing special characters.');
