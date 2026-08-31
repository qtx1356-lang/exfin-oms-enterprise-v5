import fs from 'fs';

// 1. Restore auth and app in config.ts
let config = fs.readFileSync('src/services/firebase/config.ts', 'utf8');
if (!config.includes('export const app =')) {
  config += `
export const app = new Proxy({}, {
  get(target, prop) {
    const activeApp = isAdminContext() ? getAdminApp() : getDefaultApp();
    if (!activeApp) return undefined;
    if (typeof activeApp[prop] === 'function') {
      return activeApp[prop].bind(activeApp);
    }
    return activeApp[prop];
  }
});
export const auth = new Proxy({}, {
  get(target, prop) {
    const activeAuth = getActiveAuth();
    if (!activeAuth) return undefined;
    if (typeof activeAuth[prop] === 'function') {
      return activeAuth[prop].bind(activeAuth);
    }
    return activeAuth[prop];
  }
});
`;
  fs.writeFileSync('src/services/firebase/config.ts', config);
}
