const fs = require('fs');

let code = fs.readFileSync('server/services/dailyAdminReportService.ts', 'utf8');

// In sendDailyReportTestEmail error response:
code = code.replace(
  /success: false,\s*message: emailRes\.error \|\| 'Failed to dispatch verification email',/g,
  "success: false,\n      error: emailRes.error || 'Failed to dispatch verification email',"
);

// In generateAndSendDailyReport error response:
code = code.replace(
  /success: false,\s*message: err\.message \|\| 'Failed to generate and dispatch daily report\.',/g,
  "success: false,\n      error: err.message || 'Failed to generate and dispatch daily report.',"
);

fs.writeFileSync('server/services/dailyAdminReportService.ts', code);
