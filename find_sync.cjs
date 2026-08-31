const fs = require('fs');
const execSync = require('child_process').execSync;

const files = execSync('grep -rl "collection(db" src/').toString().trim().split('\n').filter(Boolean);
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  // Check if it's inside an async function. This is a heuristic.
  // Let's just output the file to see if we can manually fix them or write a better script.
  console.log(file);
}
