const fs = require('fs');
const execSync = require('child_process').execSync;

const files = execSync('grep -rl "collection(db" src/').toString().trim().split('\n');
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('useEffect') && content.includes('collection(db')) {
    console.log(file);
  }
});
