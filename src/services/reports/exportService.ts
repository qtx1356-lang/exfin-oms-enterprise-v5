/**
 * EXFIN OMS ENTERPRISE v6.0
 * CENTRALIZED EXPORT SERVICE
 * 
 * Reusable reporting utility for generating CSV exports, formatted Excel (XLSX) workbooks,
 * and high-fidelity printable reports (perfectly styled as PDF printouts matching Deep Purple).
 */

/**
 * Cleanly escape value for CSV output following RFC 4180
 */
function escapeCSVCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export data to a standard CSV file
 */
export function exportToCSV(filename: string, headers: string[], rows: any[][]) {
  const csvContent = [
    headers.map(escapeCSVCell).join(','),
    ...rows.map(row => row.map(escapeCSVCell).join(','))
  ].join('\n');

  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export data to a beautiful, styled Excel workbook using Excel XML format
 */
export function exportToXLSX(
  filename: string,
  title: string,
  period: string,
  filters: Record<string, string>,
  summary: { label: string; value: string | number }[],
  headers: string[],
  rows: any[][]
) {
  const filterRows = Object.entries(filters)
    .map(([k, v]) => `<tr><td style="font-weight:bold;color:#4B5563;padding:4px;">${k}:</td><td style="padding:4px;">${v}</td></tr>`)
    .join('');

  const summaryCells = summary
    .map(
      (s) => `
      <div style="display:inline-block;margin-right:15px;margin-bottom:10px;padding:12px;background-color:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;min-width:130px;text-align:center;">
        <div style="font-size:10px;color:#6D28D9;text-transform:uppercase;font-weight:bold;letter-spacing:0.5px;">${s.label}</div>
        <div style="font-size:18px;font-weight:900;color:#1E1B4B;margin-top:4px;">${s.value}</div>
      </div>
    `
    )
    .join('');

  const headerCells = headers
    .map((h) => `<th style="background-color:#5B21B6;color:#FFFFFF;padding:10px;border:1px solid #4C1D95;text-align:left;font-weight:bold;font-size:12px;">${h}</th>`)
    .join('');

  const bodyRows = rows
    .map(
      (row) => `
      <tr>
        ${row
          .map(
            (cell) =>
              `<td style="padding:8px;border:1px solid #E5E7EB;color:#374151;font-size:11px;">${
                cell === null || cell === undefined ? '' : String(cell)
              }</td>`
          )
          .join('')}
      </tr>
    `
    )
    .join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>${title.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 30)}</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        table { border-collapse: collapse; width: 100%; }
      </style>
    </head>
    <body>
      <div style="padding:24px;">
        <h1 style="color:#2D1B5A;font-size:22px;font-weight:900;margin:0 0 2px 0;letter-spacing:-0.5px;">EXFIN OMS ENTERPRISE</h1>
        <span style="color:#7C3AED;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:12px;">Enterprise Management System</span>
        
        <h2 style="color:#5B21B6;font-size:16px;font-weight:800;margin:0 0 4px 0;">${title}</h2>
        <p style="font-size:12px;color:#4B5563;margin:0 0 16px 0;"><strong>Reporting Period:</strong> ${period}</p>
        
        <table style="margin-bottom:20px;max-width:450px;font-size:11px;border-collapse:collapse;">
          ${filterRows}
        </table>

        <div style="margin-bottom:24px;">
          ${summaryCells}
        </div>

        <table style="border-collapse:collapse;">
          <thead>
            <tr>${headerCells}</tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.xls`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Render and trigger printable system dialog styled exactly like a secure PDF report
 */
export function printReport(
  title: string,
  period: string,
  filters: Record<string, string>,
  summary: { label: string; value: string | number }[],
  headers: string[],
  rows: any[][]
) {
  const filterList = Object.entries(filters)
    .map(([k, v]) => `<div style="margin-bottom:2px;"><strong>${k}:</strong> ${v}</div>`)
    .join('');

  const summaryCards = summary
    .map(
      (s) => `
      <div class="summary-card">
        <div class="summary-label">${s.label}</div>
        <div class="summary-value">${s.value}</div>
      </div>
    `
    )
    .join('');

  const headerCells = headers.map((h) => `<th>${h}</th>`).join('');

  const bodyRows = rows
    .map(
      (row) => `
      <tr>
        ${row.map((cell) => `<td>${cell === null || cell === undefined ? '' : String(cell)}</td>`).join('')}
      </tr>
    `
    )
    .join('');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Popup blocked! Please allow popups to open the print-ready report sheet.');
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>EXFIN OMS - ${title}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #1f2937;
            line-height: 1.5;
            margin: 0;
            padding: 0;
            font-size: 11px;
            background-color: #ffffff;
          }
          .header {
            border-bottom: 2px solid #5b21b6;
            padding-bottom: 12px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .logo-area h1 {
            color: #2d1b5a;
            font-size: 18px;
            font-weight: 900;
            margin: 0;
            letter-spacing: -0.5px;
          }
          .logo-area span {
            color: #7c3aed;
            font-size: 9px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .report-info {
            text-align: right;
          }
          .report-title {
            color: #5b21b6;
            font-size: 14px;
            font-weight: 800;
            margin: 0 0 4px 0;
          }
          .report-period {
            font-size: 10px;
            color: #4b5563;
          }
          .meta-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            background-color: #f9fafb;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
          }
          .filters {
            font-size: 10px;
            color: #4b5563;
          }
          .filters strong {
            color: #1f2937;
          }
          .gen-date {
            font-size: 10px;
            color: #6b7280;
            text-align: right;
          }
          .summary-section {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 24px;
          }
          .summary-card {
            flex: 1;
            background-color: #f5f3ff;
            border: 1px solid #ddd6fe;
            padding: 12px;
            border-radius: 8px;
            text-align: center;
            min-width: 110px;
          }
          .summary-label {
            font-size: 8px;
            color: #6d28d9;
            text-transform: uppercase;
            font-weight: 800;
            letter-spacing: 0.5px;
          }
          .summary-value {
            font-size: 16px;
            font-weight: 900;
            color: #1e1b4b;
            margin-top: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          tr {
            page-break-inside: avoid;
          }
          th {
            background-color: #5b21b6;
            color: white;
            font-weight: bold;
            text-align: left;
            padding: 8px 10px;
            font-size: 10px;
            border: 1px solid #5b21b6;
          }
          td {
            padding: 7px 10px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 9.5px;
            color: #374151;
          }
          tr:nth-child(even) {
            background-color: #fcfbfe;
          }
          .footer-section {
            margin-top: 40px;
            border-top: 1px solid #e5e7eb;
            padding-top: 10px;
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #9ca3af;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-area">
            <h1>EXFIN OMS</h1>
            <span>Enterprise System v6.0</span>
          </div>
          <div class="report-info">
            <h2 class="report-title">${title}</h2>
            <div class="report-period">Period: ${period}</div>
          </div>
        </div>

        <div class="meta-section">
          <div class="filters">
            <div style="font-weight: bold; margin-bottom: 4px; color: #1f2937;">Applied Filters:</div>
            ${filterList || 'None'}
          </div>
          <div class="gen-date">
            <div>Generated: ${new Date().toLocaleString()}</div>
            <div>Classification: SECURE SYSTEM REPORT</div>
          </div>
        </div>

        <div class="summary-section">
          ${summaryCards}
        </div>

        <table>
          <thead>
            <tr>${headerCells}</tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>

        <div class="footer-section">
          <div>© ${new Date().getFullYear()} EXFIN OMS ENTERPRISE. All Rights Reserved.</div>
          <div>Page 1 of 1 (Secure Print)</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
