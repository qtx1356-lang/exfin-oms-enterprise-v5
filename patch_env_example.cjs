const fs = require('fs');

let env = fs.readFileSync('.env.example', 'utf8');

env = env.replace(
/SMTP_HOST="smtp\.example\.com"/,
'SMTP_HOST="smtp.gmail.com"'
);
env = env.replace(
/SMTP_PORT=587/,
'SMTP_PORT=465'
);
env = env.replace(
/SMTP_USER="notifications@example\.com"/,
'SMTP_USER="your-email@gmail.com"'
);
env = env.replace(
/SMTP_PASS="your_secure_password_here"/,
'SMTP_PASS="your-16-character-app-password"'
);
env = env.replace(
/SMTP_FROM='"EXFIN OMS Operations" <notifications@example\.com>'/,
'SMTP_FROM=\'"EXFIN OMS Operations" <your-email@gmail.com>\''
);

fs.writeFileSync('.env.example', env);
