const fs = require('node:fs');
const path = require('node:path');

const seedDir = path.join(__dirname, '..', 'shared', 'seeds');
const files = fs.readdirSync(seedDir);

for (const file of files) {
  const fullPath = path.join(seedDir, file);
  const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  console.log(file, Array.isArray(content) ? content.length : 1);
}
