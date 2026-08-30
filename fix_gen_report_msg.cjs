const fs = require('fs');
let code = fs.readFileSync('server/services/dailyAdminReportService.ts', 'utf8');

code = code.replace(
  /message: hasRejections\s*\?\s*\`Daily Admin Report partially sent to \$\{accepted\.length\} recipients, but failed for \$\{rejected\.length\} recipients\.\`\s*:\s*'Daily Admin Report generated and sent successfully\.',/g,
  "message: hasRejections ? `Email accepted by Gmail SMTP. Message ID: ${emailRes.messageId}. Failed for ${rejected.length} recipients.` : `Email accepted by provider. Message ID: ${emailRes.messageId}`,"
);

fs.writeFileSync('server/services/dailyAdminReportService.ts', code);
