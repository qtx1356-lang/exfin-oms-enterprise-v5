const fs = require('fs');
const execSync = require('child_process').execSync;

const files = execSync('grep -rl "getActiveDbSync" src/').toString().trim().split('\n').filter(Boolean);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace `if (!db) return;` with `if (!getActiveDbSync()) return;`
  content = content.replace(/if\s*\(\s*!db\s*\)/g, 'if (!getActiveDbSync())');
  
  // What else? Let's replace any `db` variable usage with `getActiveDbSync()` where appropriate.
  // Actually, wait, it's safer to just re-export `db` as a getter in db_sync.ts so that `db` is still defined, or we can just find them manually since there are only a few.
  // Wait, `Cannot find name 'db'` is the main error.
  
  // Let's replace `const regsRef = collection(db, ` - wait, I already replaced it with getActiveDbSync().
  // Let's check IdentityDiagnosticScreen.tsx
  // IdentityDiagnosticScreen.tsx(54,11): error TS2304: Cannot find name 'db'.
  
  content = content.replace(/\bdb\b/g, (match, offset, string) => {
    // If it's part of `import { db }`, `collection(db)`, `doc(db)`, it's already gone.
    // If it's `db.`, we should not touch it (that's IndexedDB).
    if (string.substring(offset, offset + 3) === 'db.') return 'db';
    if (string.substring(offset - 1, offset) === '.') return 'db';
    if (string.substring(offset - 10, offset) === 'IndexedDB') return 'db';
    // If it's `getActiveDbSync`, don't touch
    if (string.substring(offset - 9, offset) === 'getActive') return 'db';
    
    // Otherwise it's likely a standalone `db`
    return 'getActiveDbSync()';
  });
  
  // Clean up any double getActiveDbSync()()
  content = content.replace(/getActiveDbSync\(\)\(\)/g, 'getActiveDbSync()');
  
  fs.writeFileSync(file, content);
}
