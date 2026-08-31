const fs = require('fs');
const execSync = require('child_process').execSync;

const files = execSync('grep -rl "concrete" src/').toString().trim().split('\n').filter(Boolean);
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\.concrete/g, '');
  content = content.replace(/\._concrete/g, '');
  fs.writeFileSync(file, content);
}
