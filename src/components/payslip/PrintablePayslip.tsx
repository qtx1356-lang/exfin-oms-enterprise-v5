import React from 'react';
import { SalaryRecord } from '../../services/salary/salaryService';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface PrintablePayslipsProps {
  payslips: SalaryRecord[];
  getAdditionalInfo?: (empCode: string) => { department?: string; designation?: string };
}

export const PrintablePayslips: React.FC<PrintablePayslipsProps> = ({
  payslips,
  getAdditionalInfo,
}) => {
  if (!payslips || payslips.length === 0) return null;

  return (
    <div id="printable-payslip-root" className="print-only">
      {payslips.map((slip, index) => {
        const monthName = MONTH_NAMES[slip.month - 1] || `Month ${slip.month}`;
        const info = getAdditionalInfo ? getAdditionalInfo(slip.employeeCode) : undefined;
        const department = info?.department || 'Operations';
        const designation = info?.designation || 'Staff Associate';
        const isLast = index === payslips.length - 1;

        return (
          <div
            key={slip.id || `${slip.employeeCode}_${slip.year}_${slip.month}_${index}`}
            className={`payslip-print-sheet ${!isLast ? 'page-break' : ''}`}
            style={{
              padding: '24px 28px',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              color: '#0f172a',
              backgroundColor: '#ffffff',
              boxSizing: 'border-box',
              minHeight: '1000px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div>
              {/* HEADER SECTION */}
              <div style={{
                borderBottom: '2px solid #0f172a',
                paddingBottom: '16px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start'
              }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, letterSpacing: '0.05em', color: '#0f172a', textTransform: 'uppercase' }}>
                    Office Management System
                  </h1>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginTop: '2px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Enterprise Operations & Workforce Management
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                    Official Computer-Generated Salary Slip
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    display: 'inline-block',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '13px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase'
                  }}>
                    {monthName} {slip.year}
                  </div>
                  <div style={{ fontSize: '9px', color: '#64748b', marginTop: '6px' }}>
                    Generated: {slip.generationTimestamp ? new Date(slip.generationTimestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN')}
                  </div>
                </div>
              </div>

              {/* EMPLOYEE IDENTITY GRID */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px 18px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Employee Name</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{slip.employeeName || 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Designation</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{designation}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Employee Code / ID</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#4338ca', marginTop: '2px', fontFamily: 'monospace' }}>{slip.employeeCode}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Department</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{department}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Days in Month</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{slip.daysInMonth} Days</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Calculation Cut-Off</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{slip.attendanceCutOffDate || `${slip.daysInMonth} ${monthName.substring(0, 3)} ${slip.year}`}</div>
                  </div>
                </div>
              </div>

              {/* ATTENDANCE SUMMARY SECTION */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155', marginBottom: '8px' }}>
                  Attendance Breakdown
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px'
                }}>
                  {[
                    { label: 'Office Present', val: slip.officePresentDays },
                    { label: 'Work From Home', val: slip.wfhDays },
                    { label: 'Client Visit', val: slip.clientVisitDays },
                    { label: 'Outdoor Work', val: slip.outdoorDays },
                    { label: 'Paid Leaves Converted', val: slip.paidLeaveDays, highlight: true },
                    { label: 'Sunday / Holiday', val: slip.sundayHolidayDays },
                    { label: 'Total Present Days', val: slip.totalPresentDays, bold: true },
                    { label: 'Late Days (≥ 10:31 AM)', val: slip.lateDays || 0, isLate: true }
                  ].map((item, i) => (
                    <div
                      key={i}
                      style={{
                        backgroundColor: item.highlight ? '#fef3c7' : item.bold ? '#e0e7ff' : item.isLate ? '#fee2e2' : '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '9px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{item.label}</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{item.val} <span style={{ fontSize: '10px', fontWeight: 600 }}>Days</span></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* FINANCIAL BREAKDOWN TABLE */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155', marginBottom: '8px' }}>
                  Financial Statement & Disbursal Computation
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '10px' }}>Salary Component & Formula</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '10px' }}>Amount (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600 }}>Gross Monthly Base Salary</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>Configured base compensation</div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                        ₹{Number(slip.baseSalary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#faf5ff' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 700, color: '#4c1d95' }}>Calculated Pro-Rata Earnings</div>
                        <div style={{ fontSize: '10px', color: '#6b21a8' }}>
                          (₹{Number(slip.baseSalary || 0).toLocaleString('en-IN')} ÷ {slip.daysInMonth}) × {slip.totalPresentDays} present days
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#4c1d95' }}>
                        ₹{Number(slip.salaryBeforeDeductions || slip.salaryBeforeAdvance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: '#fff1f2', borderBottom: '1px solid #fecdd3' }}>
                      <td colSpan={2} style={{ padding: '6px 12px', fontSize: '10px', fontWeight: 800, color: '#9f1239', textTransform: 'uppercase' }}>
                        Deductions & Adjustments
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600 }}>Advance Claim Deductions</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>Repayment of approved advance claims</div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#be123c' }}>
                        - ₹{Number(slip.advance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600 }}>Late Check-in Fine</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>{slip.lateDays || 0} late check-ins (10:31 AM or later)</div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#be123c' }}>
                        - ₹{Number(slip.lateFine || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#eef2ff', borderTop: '2px solid #6366f1', borderBottom: '2px solid #6366f1' }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e1b4b', textTransform: 'uppercase' }}>Net Final Disbursal</div>
                        <div style={{ fontSize: '10px', color: '#4338ca' }}>Total pro-rata earnings minus advances and late fines</div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontSize: '16px', fontWeight: 900, color: '#1e1b4b' }}>
                        ₹{Number(slip.finalSalary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ANNUAL PAID LEAVE AUDIT */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155', marginBottom: '8px' }}>
                  Annual Paid Leave Audit Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', backgroundColor: '#f8fafc', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Annual Allocation</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{slip.allocatedPaidLeaves ?? 22} <span style={{ fontSize: '10px', fontWeight: 600 }}>Days</span></div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', backgroundColor: '#f8fafc', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Consumed to Date</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#d97706', marginTop: '2px' }}>{slip.usedPaidLeaves ?? 0} <span style={{ fontSize: '10px', fontWeight: 600 }}>Days</span></div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', backgroundColor: '#f8fafc', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Current Balance</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>{slip.remainingPaidLeaves ?? 22} <span style={{ fontSize: '10px', fontWeight: 600 }}>Days</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* FOOTER & LEGAL SIGN-OFF */}
            <div style={{
              borderTop: '1px solid #cbd5e1',
              paddingTop: '12px',
              marginTop: '16px',
              fontSize: '9px',
              color: '#64748b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div>Confidential Document — Office Management System Enterprise</div>
                <div>This is a secure, computer-generated salary slip and does not require a physical signature.</div>
              </div>
              <div style={{ textAlign: 'right', fontWeight: 600 }}>
                Page {index + 1} of {payslips.length}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
