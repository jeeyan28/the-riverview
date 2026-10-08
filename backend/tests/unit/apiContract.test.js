const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');

function checkContract(lineEnding, drift = false) {
  return spawnSync(process.execPath, ['-'], {
    cwd: root, encoding: 'utf8', timeout: 20000,
    input: `
      const fs = require('node:fs');
      const path = require('node:path');
      const read = fs.readFileSync;
      fs.readFileSync = function (file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string') return value;
        const relative = path.relative(process.cwd(), path.resolve(file));
        if (relative.startsWith('..') || relative.startsWith('node_modules') || !relative.endsWith('.js')) return value;
        let source = value.toString().replace(/\\r\\n?/g, '\\n');
        if (${drift} && relative === path.join('routes', 'auth.js')) source += '\\n// contract drift\\n';
        if (${JSON.stringify(lineEnding)} === 'crlf') source = source.replace(/\\n/g, '\\r\\n');
        return Buffer.isBuffer(value) ? Buffer.from(source) : source;
      };
      require('./scripts/checkApiDocs');
    `,
  });
}

for (const lineEnding of ['lf', 'crlf']) test(`API contract matches ${lineEnding.toUpperCase()} source checkouts`, () => {
  const result = checkContract(lineEnding);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /API contract verified:/);
});

test('API contract still rejects source drift after normalizing line endings', () => {
  const result = checkContract('lf', true);
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /API contract drift/);
});
