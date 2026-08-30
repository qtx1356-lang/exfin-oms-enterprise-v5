const fs = require('fs');
const file = 'functions/api/admin/daily-report/[[route]].ts';
let code = fs.readFileSync(file, 'utf8');

// Fix sendEmailViaResend
code = code.replace(
/if \(\!resendApiKey\) \{[\s\S]*?return \{ success: true, simulated: true, messageId: `sim_\$\{Date\.now\(\)\}` \};[\s\S]*?\}/,
`if (!resendApiKey) {
        throw new Error('Email provider configuration missing: RESEND_API_KEY environment variable is not set in Cloudflare Pages.');
      }`
);

// Fix Test Email success message
code = code.replace(
/message: sendRes\.simulated[\s\S]*?Test email sent to \$\{adminEmails\.length\} recipients\.`,/,
`message: \`Email accepted by provider. Message ID: \${sendRes.messageId}\`,`
);

// Fix Manual Report success message
code = code.replace(
/message: sendRes\.simulated[\s\S]*?Report sent successfully to \$\{adminEmails\.length\} recipients\.`,/,
`message: \`Email accepted by provider. Message ID: \${sendRes.messageId}\`,`
);

// Ensure the messageId is extracted from sendRes and placed back into the response payload explicitly if missing:
// Wait, the existing code has message: ... and messageId: ... we should just use what's there.

fs.writeFileSync(file, code);
