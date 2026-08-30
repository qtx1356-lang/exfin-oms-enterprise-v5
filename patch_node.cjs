const fs = require('fs');
const file = 'server/services/emailService.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
/if \(\!isConfigured\) \{[\s\S]*?return \{[\s\S]*?success: true,[\s\S]*?simulated: true,[\s\S]*?messageId: [\s\S]*?accepted: [\s\S]*?\};[\s\S]*?\}/,
`if (!isConfigured) {
    throw new Error('Email provider configuration missing: SMTP credentials are not configured in environment.');
  }`
);

fs.writeFileSync(file, code);
