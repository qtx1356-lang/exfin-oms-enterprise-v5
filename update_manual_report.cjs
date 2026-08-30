const fs = require('fs');

let code = fs.readFileSync('server/services/dailyAdminReportService.ts', 'utf8');

// In generateAndSendDailyReport, let's make sure it handles errors properly.
// The current code does:
// const emailRes = await sendMail({...});
// if (emailRes.success) { ... } else { throw new Error(...) }
// That looks correct.

// One thing to change is the message format in Test Email:
code = code.replace(
  /\? \`Test email sent to \$\{accepted\.length\} recipients, but failed for \$\{rejected\.length\} recipients\.\`/g,
  "? `Email accepted by Gmail SMTP. Message ID: ${emailRes.messageId}. Failed for ${rejected.length} recipients.`"
);

code = code.replace(
  /: \`Test email sent to \$\{recipients\.length\} recipients\.\`,/g,
  ": `Email accepted by provider. Message ID: ${emailRes.messageId}`,"
);

fs.writeFileSync('server/services/dailyAdminReportService.ts', code);
