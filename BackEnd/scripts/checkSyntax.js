const { readdirSync } = require('node:fs');
const { join, relative, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '..');
const excluded = new Set(['node_modules', '.git', 'dist', 'coverage']);
let checked = 0;
let failed = false;

function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name)) checkDirectory(file);
    else if (entry.isFile() && /\.(?:c?js|mjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      checked++;
      if (result.status !== 0) {
        failed = true;
        console.error(`Syntax check failed: ${relative(root, file)}`);
        console.error(result.stderr || result.error?.message || 'Node could not check the file.');
      }
    }
  }
}

checkDirectory(root);
console.log(`Checked ${checked} backend source files.`);
process.exitCode = failed ? 1 : 0;
