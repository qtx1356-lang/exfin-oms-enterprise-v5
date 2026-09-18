/**
 * OMS ENTERPRISE v6.0
 * CENTRALIZED EXPORT SERVICE
 * 
 * Reusable reporting utility for generating CSV exports, formatted Excel (XLSX) workbooks,
 * and high-fidelity printable reports (perfectly styled as PDF printouts matching Deep Purple).
 */

import { jsPDF } from 'jspdf';
import { SalaryRecord } from '../salary/salaryService';

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
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:900;margin:0 0 2px 0;letter-spacing:-0.5px;">Office Management System</h1>
        <span style="color:#D4AF37;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:12px;">Enterprise Management System</span>
        
        <h2 style="color:#D4AF37;font-size:16px;font-weight:800;margin:0 0 4px 0;">${title}</h2>
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
        <title>Office Management System - ${title}</title>
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
            <h1>Office Management System</h1>
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
          <div>© ${new Date().getFullYear()} Office Management System. All Rights Reserved.</div>
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

/**
 * Month Names for Payslip Formatting
 */
const PAYSLIP_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatINR(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Draws a single payslip sheet on the provided jsPDF document page
 */
function renderPayslipPDFPage(
  doc: jsPDF,
  payslip: SalaryRecord,
  additionalInfo?: { department?: string; designation?: string },
  pageNumber?: number,
  totalPages?: number
) {
  const monthName = PAYSLIP_MONTH_NAMES[payslip.month - 1] || `Month ${payslip.month}`;

  // Outer Border / Container
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(12, 12, 186, 273, 3, 3, 'S');

  // Header Banner
  doc.setFillColor(26, 17, 56); // Deep Navy/Purple #1A1138
  doc.roundedRect(14, 14, 182, 24, 2, 2, 'F');

  // Brand Titles
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('OFFICE MANAGEMENT SYSTEM', 18, 22);

  doc.setFontSize(7.5);
  doc.setTextColor(212, 175, 55); // Gold
  doc.text('ENTERPRISE OPERATIONS & WORKFORCE MANAGEMENT', 18, 27);

  doc.setFontSize(6.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.setFont('helvetica', 'normal');
  doc.text('Official Computer-Generated Salary Slip', 18, 33);

  // Period Badge
  doc.setFillColor(55, 35, 95);
  doc.roundedRect(138, 17, 52, 9, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`${monthName.toUpperCase()} ${payslip.year}`, 164, 23, { align: 'center' });

  // Generation timestamp
  doc.setFontSize(6.5);
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  const genDateStr = payslip.generationTimestamp
    ? new Date(payslip.generationTimestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`Generated: ${genDateStr}`, 188, 33, { align: 'right' });

  // 1. Employee Identity Card (y: 41 to 71)
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(14, 41, 182, 30, 2, 2, 'FD');

  // Left column
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('EMPLOYEE NAME', 18, 46);
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont('helvetica', 'bold');
  doc.text(payslip.employeeName || 'N/A', 18, 51);

  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('EMPLOYEE ID / CODE', 18, 58);
  doc.setFontSize(8.5);
  doc.setTextColor(99, 102, 241); // indigo-500
  doc.setFont('helvetica', 'bold');
  doc.text(payslip.employeeCode || 'N/A', 18, 63);

  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('DEPARTMENT', 18, 68);
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(additionalInfo?.department || 'Operations', 42, 68);

  // Right column
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('DESIGNATION', 105, 46);
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(additionalInfo?.designation || 'Staff Associate', 105, 51);

  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('DAYS IN MONTH', 105, 58);
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`${payslip.daysInMonth} Days`, 105, 63);

  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('CALCULATION CUT-OFF', 150, 58);
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(payslip.attendanceCutOffDate || `${payslip.daysInMonth} ${monthName.substring(0, 3)} ${payslip.year}`, 150, 63);

  // 2. Attendance Breakdown (y: 75 to 110)
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.text('ATTENDANCE BREAKDOWN', 14, 76);

  const attCategories = [
    { label: 'OFFICE PRESENT', val: payslip.officePresentDays, color: [241, 245, 249] },
    { label: 'WORK FROM HOME', val: payslip.wfhDays, color: [241, 245, 249] },
    { label: 'CLIENT VISIT', val: payslip.clientVisitDays, color: [241, 245, 249] },
    { label: 'OUTDOOR WORK', val: payslip.outdoorDays, color: [241, 245, 249] },
    { label: 'PAID LEAVES', val: payslip.paidLeaveDays, color: [254, 243, 199] },
    { label: 'SUNDAY / HOLIDAY', val: payslip.sundayHolidayDays, color: [241, 245, 249] },
    { label: 'TOTAL PRESENT', val: payslip.totalPresentDays, color: [237, 233, 254] },
    { label: 'LATE DAYS', val: payslip.lateDays || 0, color: [254, 226, 226] }
  ];

  attCategories.forEach((cat, idx) => {
    const row = Math.floor(idx / 4);
    const col = idx % 4;
    const cardWidth = 43.5;
    const cardHeight = 13;
    const x = 14 + col * (cardWidth + 2.6);
    const y = 80 + row * (cardHeight + 2);

    doc.setFillColor(cat.color[0], cat.color[1], cat.color[2]);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(cat.label, x + cardWidth / 2, y + 4.5, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${cat.val} Days`, x + cardWidth / 2, y + 10.5, { align: 'center' });
  });

  // 3. Financial Statement & Calculations (y: 114 to 198)
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.text('FINANCIAL STATEMENT & DISBURSAL CALCULATION', 14, 115);

  // Table header
  doc.setFillColor(241, 245, 249);
  doc.rect(14, 118, 182, 7, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(14, 118, 196, 118);
  doc.line(14, 125, 196, 125);

  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('SALARY COMPONENT & FORMULA', 18, 122.5);
  doc.text('AMOUNT (INR)', 192, 122.5, { align: 'right' });

  let curY = 132;
  const drawRow = (title: string, desc: string, amountStr: string, isDeduction = false, isBold = false) => {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(title, 18, curY);

    if (desc) {
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(desc, 18, curY + 3.8);
    }

    doc.setFontSize(8);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setTextColor(isDeduction ? 220 : 15, isDeduction ? 38 : 23, isDeduction ? 38 : 42);
    doc.text(amountStr, 192, curY, { align: 'right' });

    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.15);
    doc.line(14, curY + 5.5, 196, curY + 5.5);
    curY += 9.5;
  };

  drawRow('Gross Monthly Base Salary', 'Configured base monthly CTC', `Rs. ${formatINR(payslip.baseSalary)}`);
  drawRow('Calculated Pro-Rata Earnings', `(${payslip.baseSalary} / ${payslip.daysInMonth} days) x ${payslip.totalPresentDays} present days`, `Rs. ${formatINR(payslip.salaryBeforeDeductions || payslip.salaryBeforeAdvance)}`, false, true);

  // Deductions Header
  doc.setFillColor(254, 242, 242);
  doc.rect(14, curY, 182, 6, 'F');
  doc.setFontSize(6.5);
  doc.setTextColor(185, 28, 28);
  doc.setFont('helvetica', 'bold');
  doc.text('DEDUCTIONS & ADJUSTMENTS', 18, curY + 4);
  curY += 8;

  drawRow('Advance Claim Deductions', 'Repayment of approved employee advances', `- Rs. ${formatINR(payslip.advance)}`, true);
  drawRow('Late Check-in Fine', `${payslip.lateDays || 0} late check-in days (>= 10:31 AM)`, `- Rs. ${formatINR(payslip.lateFine)}`, true);

  // Net Disbursed Box
  curY += 2;
  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(99, 102, 241);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, curY, 182, 16, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(49, 46, 129);
  doc.setFont('helvetica', 'bold');
  doc.text('NET FINAL DISBURSAL (TAKE HOME)', 20, curY + 7);
  doc.setFontSize(6.5);
  doc.setTextColor(99, 102, 241);
  doc.setFont('helvetica', 'normal');
  doc.text('Pro-Rata Earnings minus Advances and Late Fines', 20, curY + 12);

  doc.setFontSize(13);
  doc.setTextColor(30, 27, 75);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs. ${formatINR(payslip.finalSalary)}`, 190, curY + 10.5, { align: 'right' });

  // 4. Annual Paid Leave Summary
  curY += 22;
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.text('ANNUAL PAID LEAVE AUDIT SUMMARY', 14, curY);

  curY += 4;
  const leaveCards = [
    { label: 'ANNUAL ALLOCATION', val: payslip.allocatedPaidLeaves ?? 22, sub: 'Financial Year Allowance' },
    { label: 'CONSUMED TO DATE', val: payslip.usedPaidLeaves ?? 0, sub: 'Converted Days' },
    { label: 'CURRENT REMAINING', val: payslip.remainingPaidLeaves ?? 22, sub: 'Available Balance' }
  ];

  leaveCards.forEach((c, idx) => {
    const cardWidth = 58.5;
    const x = 14 + idx * (cardWidth + 3.25);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, curY, cardWidth, 16, 1.5, 1.5, 'FD');

    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(c.label, x + cardWidth / 2, curY + 4.5, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`${c.val} Days`, x + cardWidth / 2, curY + 10.5, { align: 'center' });

    doc.setFontSize(5.5);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.text(c.sub, x + cardWidth / 2, curY + 14, { align: 'center' });
  });

  // 5. Legal Footnote
  curY += 25;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(14, curY, 196, curY);

  curY += 5;
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  doc.text('Confidential Document — Strictly for employee verification and tax compliance records.', 14, curY);
  doc.text('This is a secure, computer-generated salary slip processed by Office Management System. No physical signature is required.', 14, curY + 4);

  if (pageNumber && totalPages) {
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${pageNumber} of ${totalPages}`, 196, curY + 4, { align: 'right' });
  }
}

/**
 * Export a single payslip to a high-fidelity PDF file
 */
export function exportSinglePayslipPDF(
  payslip: SalaryRecord,
  additionalInfo?: { department?: string; designation?: string }
) {
  if (!payslip) {
    throw new Error('No payslip data provided for export.');
  }
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  renderPayslipPDFPage(doc, payslip, additionalInfo, 1, 1);
  const padMonth = String(payslip.month).padStart(2, '0');
  const filename = `Payslip_${payslip.employeeCode}_${payslip.year}-${padMonth}.pdf`;
  doc.save(filename);
}

/**
 * Export multiple payslips into a single multi-page PDF document,
 * guaranteeing exactly one payslip per page.
 */
export function exportAllPayslipsPDF(
  payslips: SalaryRecord[],
  filename: string,
  getAdditionalInfo?: (empCode: string) => { department?: string; designation?: string }
) {
  if (!payslips || payslips.length === 0) {
    throw new Error('No payslips available to export.');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  payslips.forEach((slip, idx) => {
    if (idx > 0) {
      doc.addPage();
    }
    const info = getAdditionalInfo ? getAdditionalInfo(slip.employeeCode) : undefined;
    renderPayslipPDFPage(doc, slip, info, idx + 1, payslips.length);
  });

  const fullFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
  doc.save(fullFilename);
}

/**
 * Export payslips to structured RFC-compliant CSV
 */
export function exportPayslipsToCSV(filename: string, payslips: SalaryRecord[]) {
  if (!payslips || payslips.length === 0) {
    throw new Error('No payslips available to export.');
  }
  const headers = [
    'Employee Code',
    'Employee Name',
    'Month',
    'Year',
    'Gross Base Salary (INR)',
    'Days in Month',
    'Office Present Days',
    'WFH Days',
    'Client Visit Days',
    'Outdoor Work Days',
    'Paid Leave Days',
    'Sunday / Holiday Days',
    'Total PRESENT Days',
    'Late Check-in Days',
    'Late Fine (INR)',
    'Advance Deductions (INR)',
    'Salary Before Deductions (INR)',
    'Net Final Salary (INR)',
    'Allocated Paid Leaves',
    'Used Paid Leaves',
    'Remaining Paid Leaves',
    'Attendance Cut-off Date',
    'Generation Timestamp'
  ];

  const rows = payslips.map((s) => [
    s.employeeCode,
    s.employeeName,
    s.month,
    s.year,
    s.baseSalary,
    s.daysInMonth,
    s.officePresentDays,
    s.wfhDays,
    s.clientVisitDays,
    s.outdoorDays,
    s.paidLeaveDays,
    s.sundayHolidayDays,
    s.totalPresentDays,
    s.lateDays || 0,
    s.lateFine || 0,
    s.advance || 0,
    s.salaryBeforeDeductions || s.salaryBeforeAdvance || 0,
    s.finalSalary,
    s.allocatedPaidLeaves ?? '',
    s.usedPaidLeaves ?? '',
    s.remainingPaidLeaves ?? '',
    s.attendanceCutOffDate || '',
    s.generationTimestamp || ''
  ]);

  exportToCSV(filename, headers, rows);
}

