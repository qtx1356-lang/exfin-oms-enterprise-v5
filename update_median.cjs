const fs = require('fs');
let content = fs.readFileSync('src/services/attendance/medianBackgroundLocation.ts', 'utf8');

content = content.replace(
    /window\.location\.href = `median:\/\/backgroundLocation\/start\?data=\$\{jsonParam\}`;/g,
    `const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = \`median://backgroundLocation/start?data=\${jsonParam}\`;
      document.body.appendChild(iframe);
      setTimeout(() => document.body.removeChild(iframe), 500);`
);

content = content.replace(
    /window\.location\.href = 'median:\/\/backgroundLocation\/stop';/g,
    `const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'median://backgroundLocation/stop';
      document.body.appendChild(iframe);
      setTimeout(() => document.body.removeChild(iframe), 500);`
);

fs.writeFileSync('src/services/attendance/medianBackgroundLocation.ts', content);
console.log('Fixed medianBackgroundLocation.ts');
