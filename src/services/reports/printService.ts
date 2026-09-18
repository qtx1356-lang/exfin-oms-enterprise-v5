/**
 * OMS ENTERPRISE v6.0
 * CENTRALIZED PRINT SERVICE
 * 
 * Production-ready isolated print service for payslips and workforce reports.
 * Uses a sandboxed hidden iframe with inline A4 styles to guarantee pristine,
 * searchable print output on desktop and mobile browsers, completely isolated
 * from the application shell, navigation, and sidebar components.
 */

import { SalaryRecord } from '../salary/salaryService';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface EmployeeAdditionalInfo {
  department?: string;
  designation?: string;
}

/**
 * Format currency in Indian Rupees format (₹ xx,xxx.xx)
 */
function formatINR(amount: number | undefined | null): string {
  return Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Generate clean, self-contained HTML for an individual payslip sheet (A4 formatted)
 */
export function generateSinglePayslipHTML(
  slip: SalaryRecord,
  pageIndex: number,
  totalPages: number,
  info?: EmployeeAdditionalInfo
): string {
  const monthName = MONTH_NAMES[slip.month - 1] || `Month ${slip.month}`;
  const department = info?.department || 'Raniganj';
  const designation = info?.designation || 'Staff Associate';
  const isLast = pageIndex === totalPages - 1;

  const generatedDateStr = slip.generationTimestamp
    ? new Date(slip.generationTimestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const cutOffStr = slip.attendanceCutOffDate || `${slip.daysInMonth} ${monthName.substring(0, 3)} ${slip.year}`;

  return `
    <div class="payslip-print-sheet ${!isLast ? 'page-break' : ''}" style="
      padding: 24px 28px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      box-sizing: border-box;
      min-height: 1000px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    ">
      <div>
        <!-- HEADER SECTION -->
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; color: #0f172a; text-transform: uppercase;">
              Office Management System
            </h1>
            <div style="font-size: 11px; font-weight: 600; color: #475569; margin-top: 2px; letter-spacing: 0.04em; text-transform: uppercase;">
              Enterprise Operations &amp; Workforce Management
            </div>
            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
              Official Computer-Generated Salary Slip
            </div>
          </div>

          <div style="text-align: right;">
            <div style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase;">
              ${monthName} ${slip.year}
            </div>
            <div style="font-size: 9px; color: #64748b; margin-top: 6px;">
              Generated: ${generatedDateStr}
            </div>
          </div>
        </div>

        <!-- EMPLOYEE IDENTITY GRID -->
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 12px;">
            <div>
              <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600;">Employee Name</div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${slip.employeeName || 'N/A'}</div>
            </div>
            <div>
              <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600;">Designation</div>
              <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">${designation}</div>
            </div>
            <div>
              <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600;">Employee Code / ID</div>
              <div style="font-size: 13px; font-weight: 700; color: #4338ca; margin-top: 2px; font-family: monospace;">${slip.employeeCode}</div>
            </div>
            <div>
              <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600;">Department / Office</div>
              <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">${department}</div>
            </div>
            <div>
              <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600;">Days in Month</div>
              <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">${slip.daysInMonth} Days</div>
            </div>
            <div>
              <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600;">Calculation Cut-Off</div>
              <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">${cutOffStr}</div>
            </div>
          </div>
        </div>

        <!-- ATTENDANCE SUMMARY SECTION -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #334155; margin-bottom: 8px;">
            Attendance Breakdown
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Office Present</div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${slip.officePresentDays} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Work From Home</div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${slip.wfhDays} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Client Visit</div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${slip.clientVisitDays} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Outdoor Work</div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${slip.outdoorDays} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
            <div style="background-color: #fef3c7; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Paid Leaves Converted</div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${slip.paidLeaveDays} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Sunday / Holiday</div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${slip.sundayHolidayDays} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
            <div style="background-color: #e0e7ff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Total Present Days</div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${slip.totalPresentDays} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
            <div style="background-color: #fee2e2; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Late Days (&ge; 10:31 AM)</div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${slip.lateDays || 0} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
          </div>
        </div>

        <!-- FINANCIAL BREAKDOWN TABLE -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #334155; margin-bottom: 8px;">
            Financial Statement &amp; Disbursal Computation
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background-color: #f1f5f9; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">
                <th style="text-align: left; padding: 8px 12px; font-weight: 700; color: #334155; text-transform: uppercase; font-size: 10px;">Salary Component &amp; Formula</th>
                <th style="text-align: right; padding: 8px 12px; font-weight: 700; color: #334155; text-transform: uppercase; font-size: 10px;">Amount (INR)</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 12px;">
                  <div style="font-weight: 600;">Gross Monthly Base Salary</div>
                  <div style="font-size: 10px; color: #64748b;">Configured base compensation</div>
                </td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 600;">
                  &#8377;${formatINR(slip.baseSalary)}
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0; background-color: #faf5ff;">
                <td style="padding: 8px 12px;">
                  <div style="font-weight: 700; color: #4c1d95;">Calculated Pro-Rata Earnings</div>
                  <div style="font-size: 10px; color: #6b21a8;">
                    (&#8377;${Number(slip.baseSalary || 0).toLocaleString('en-IN')} &divide; ${slip.daysInMonth}) &times; ${slip.totalPresentDays} present days
                  </div>
                </td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #4c1d95;">
                  &#8377;${formatINR(slip.salaryBeforeDeductions || slip.salaryBeforeAdvance)}
                </td>
              </tr>
              <tr style="background-color: #fff1f2; border-bottom: 1px solid #fecdd3;">
                <td colspan="2" style="padding: 6px 12px; font-size: 10px; font-weight: 800; color: #9f1239; text-transform: uppercase;">
                  Deductions &amp; Adjustments
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 12px;">
                  <div style="font-weight: 600;">Advance Claim Deductions</div>
                  <div style="font-size: 10px; color: #64748b;">Repayment of approved advance claims</div>
                </td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #be123c;">
                  - &#8377;${formatINR(slip.advance)}
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 12px;">
                  <div style="font-weight: 600;">Late Check-in Fine</div>
                  <div style="font-size: 10px; color: #64748b;">${slip.lateDays || 0} late check-ins (10:31 AM or later)</div>
                </td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #be123c;">
                  - &#8377;${formatINR(slip.lateFine)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style="background-color: #eef2ff; border-top: 2px solid #6366f1; border-bottom: 2px solid #6366f1;">
                <td style="padding: 12px;">
                  <div style="font-size: 13px; font-weight: 800; color: #1e1b4b; text-transform: uppercase;">Net Final Disbursal</div>
                  <div style="font-size: 10px; color: #4338ca;">Total pro-rata earnings minus advances and late fines</div>
                </td>
                <td style="padding: 12px; text-align: right; font-size: 16px; font-weight: 900; color: #1e1b4b;">
                  &#8377;${formatINR(slip.finalSalary)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- ANNUAL PAID LEAVE AUDIT -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #334155; margin-bottom: 8px;">
            Annual Paid Leave Audit Summary
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; background-color: #f8fafc; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Annual Allocation</div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${slip.allocatedPaidLeaves ?? 22} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; background-color: #f8fafc; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Consumed to Date</div>
              <div style="font-size: 14px; font-weight: 800; color: #d97706; margin-top: 2px;">${slip.usedPaidLeaves ?? 0} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; background-color: #f8fafc; text-align: center;">
              <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Current Balance</div>
              <div style="font-size: 14px; font-weight: 800; color: #059669; margin-top: 2px;">${slip.remainingPaidLeaves ?? 22} <span style="font-size: 10px; font-weight: 600;">Days</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- FOOTER & LEGAL SIGN-OFF -->
      <div style="border-top: 1px solid #cbd5e1; paddingTop: 12px; margin-top: 16px; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div>Confidential Document &mdash; Office Management System Enterprise</div>
          <div>This is a secure, computer-generated salary slip and does not require a physical signature.</div>
        </div>
        <div style="text-align: right; font-weight: 600;">
          Page ${pageIndex + 1} of ${totalPages}
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate a complete standalone HTML document containing one or more payslips ready for printing
 */
export function generateFullPrintDocument(
  payslips: SalaryRecord[],
  getAdditionalInfo?: (empCode: string) => EmployeeAdditionalInfo
): string {
  const payslipHtmlArray = payslips.map((slip, i) => {
    const info = getAdditionalInfo ? getAdditionalInfo(slip.employeeCode) : undefined;
    return generateSinglePayslipHTML(slip, i, payslips.length, info);
  });

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payslips Printout</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm;
    }
    *, *:before, *:after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      background-color: #ffffff !important;
      color: #0f172a !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .page-break {
      page-break-after: always !important;
      break-after: page !important;
    }
    .page-break:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .payslip-print-sheet {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  </style>
</head>
<body>
  ${payslipHtmlArray.join('')}
</body>
</html>`;
}

/**
 * Executes a clean, isolated print flow.
 * Uses a temporary hidden iframe containing ONLY the payslip content,
 * ensuring no app shell, sidebars, buttons, or navigation appear in the print dialog.
 */
export async function printPayslips(
  payslips: SalaryRecord[],
  getAdditionalInfo?: (empCode: string) => EmployeeAdditionalInfo
): Promise<void> {
  if (!payslips || payslips.length === 0) {
    throw new Error('No payslip available to print.');
  }

  if (typeof window === 'undefined') {
    throw new Error('Printing is only available in a browser environment.');
  }

  const fullHtml = generateFullPrintDocument(payslips, getAdditionalInfo);

  return new Promise<void>((resolve, reject) => {
    let iframe: HTMLIFrameElement | null = null;
    let cleanupTimeout: any = null;

    const cleanup = () => {
      if (cleanupTimeout) clearTimeout(cleanupTimeout);
      if (iframe && iframe.parentNode) {
        try {
          iframe.parentNode.removeChild(iframe);
        } catch (e) {
          // ignore error on removal
        }
      }
    };

    try {
      iframe = document.createElement('iframe');
      iframe.id = 'oms-print-frame';
      iframe.setAttribute(
        'style',
        'position:fixed;top:-10000px;left:-10000px;width:1024px;height:1400px;border:none;opacity:0;pointer-events:none;z-index:-9999;'
      );
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc) {
        cleanup();
        throw new Error('Unable to initialize printing container.');
      }

      frameDoc.open();
      frameDoc.write(fullHtml);
      frameDoc.close();

      const runPrint = () => {
        try {
          const win = iframe?.contentWindow;
          if (!win) {
            cleanup();
            throw new Error('Print window is not accessible.');
          }

          if (typeof win.print !== 'function') {
            cleanup();
            throw new Error('System printing is not supported on this browser or device. Please use "Export" to download a PDF.');
          }

          let hasResolved = false;
          const finish = () => {
            if (!hasResolved) {
              hasResolved = true;
              cleanup();
              resolve();
            }
          };

          win.addEventListener('afterprint', finish);
          // Safety fallback timeout in case afterprint does not fire on some browsers
          cleanupTimeout = setTimeout(finish, 10000);

          win.focus();
          win.print();
        } catch (printErr: any) {
          cleanup();
          const errMsg = printErr?.message || '';
          if (errMsg.includes('sandboxed') || errMsg.includes('allow-modals') || errMsg.includes('cross-origin')) {
            reject(new Error('Print is restricted in this preview frame. Please open the app in a new tab or use "Export" to download the PDF.'));
          } else {
            reject(new Error(printErr?.message || 'Print dialog could not be opened. Please use "Export" to download the PDF.'));
          }
        }
      };

      // Brief delay to ensure styles and font rendering complete inside the iframe
      setTimeout(runPrint, 250);
    } catch (err: any) {
      cleanup();
      reject(err);
    }
  });
}
