const fs = require('fs');
const execSync = require('child_process').execSync;
const path = require('path');

const files = execSync('grep -rl "import { db" src/').toString().trim().split('\n').filter(Boolean);
// Also include files importing auth along with db, or just db.

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // 1. Fix imports
  // Case A: import { db } from '.../firebase/config'
  // Case B: import { db, auth } from '.../firebase/config'
  // Case C: import { auth, db } from '.../firebase/config'
  
  // Replace import { db }
  if (content.match(/import\s*{\s*db\s*}\s*from\s*['"](.*)\/firebase\/config['"];?/)) {
     content = content.replace(/import\s*{\s*db\s*}\s*from\s*['"](.*)\/firebase\/config['"];?/, 
      "import { getActiveDbSync } from '$1/firebase/db_sync';");
  } else if (content.match(/import\s*{\s*db\s*,\s*auth\s*}\s*from\s*['"](.*)\/firebase\/config['"];?/)) {
     content = content.replace(/import\s*{\s*db\s*,\s*auth\s*}\s*from\s*['"](.*)\/firebase\/config['"];?/, 
      "import { auth } from '$1/firebase/config';\nimport { getActiveDbSync } from '$1/firebase/db_sync';");
  } else if (content.match(/import\s*{\s*auth\s*,\s*db\s*}\s*from\s*['"](.*)\/firebase\/config['"];?/)) {
     content = content.replace(/import\s*{\s*auth\s*,\s*db\s*}\s*from\s*['"](.*)\/firebase\/config['"];?/, 
      "import { auth } from '$1/firebase/config';\nimport { getActiveDbSync } from '$1/firebase/db_sync';");
  }

  // 2. Replace collection(db, with collection(getActiveDbSync(),
  content = content.replace(/collection\(\s*db\s*,/g, 'collection(getActiveDbSync(),');
  // 3. Replace doc(db, with doc(getActiveDbSync(),
  content = content.replace(/doc\(\s*db\s*,/g, 'doc(getActiveDbSync(),');

  fs.writeFileSync(file, content);
  console.log('Processed', file);
}

