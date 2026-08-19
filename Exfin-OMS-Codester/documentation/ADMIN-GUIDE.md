# Exfin OMS — Administrator Guide

This guide explains how administrators and HR managers operate Exfin OMS.

---

## 1. Accessing the Admin Dashboard

1. Open your browser and navigate to `/admin/login` or `/admin/dashboard`.
2. Enter your authorized Login ID (or Email) and Password.
3. Upon successful authentication, the Admin Dashboard presents navigation tabs based on your role:
   - **SUPER_ADMIN**: Complete system access, role management, settings, and deletion power.
   - **ADMIN**: Operations, approvals, corrections, expenses, leave, planner, efficiency, and reports.
   - **HR**: Employee onboarding, leave management, allowances, salary configs, and attendance monitoring.

---

## 2. Managing Employees & Device Approvals

### Pending Device Approvals
1. Navigate to **Pending Approvals** tab.
2. When a new employee registers or logs in from a new device, their request appears here along with their hardware Device ID and selfie photograph.
3. Review the request details and click **Approve Device** or **Reject Device**.

### User Management
1. Navigate to **User Management** tab.
2. View employee profiles, roles, designators, offices, and status.
3. Edit roles (`EMPLOYEE`, `TEAM_LEADER`, `HR`, `ADMIN`, `SUPER_ADMIN`), reassign Team Leaders, or modify personal details.

---

## 3. Attendance Management & Corrections

### Real-Time Attendance Monitoring
1. Open the **Attendance Dashboard** tab.
2. View real-time status of all staff (Present, Checked Out, Pending Exit, WFH, Client Visit, Outdoor Work, Absent).
3. View check-in times, checkout times, precise GPS addresses, and distance from office.

### Correcting Attendance Records
1. Locate the employee's attendance record and click **Edit / Correct Attendance**.
2. Select or enter the proposed Check-In and Check-Out times.
3. Select the resolution reason (`EMPLOYEE_PROPOSED` or `ADMIN_CORRECTION`).
4. Click **Confirm Correction**.
5. The system automatically recalculates working hours, updates checkout status to `COMPLETED`, records the audit entry, and sanitizes payload fields to prevent Firestore serialization errors.

---

## 4. Expenses & Leave Approvals

- **Expense Claims**: Review claims under **Expenses**, view receipt images, and approve/reject claims. Approved expenses feed into monthly financial summaries.
- **Leave Requests**: Review leave submissions under **Leave Management**. System displays remaining leave balance before approval.

---

## 5. Work Planner & Task Management

- Create tasks for individual employees or entire teams.
- Set priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`) and target due dates.
- Review submitted task proof/deliverables, request revisions, or mark tasks as completed.

---

## 6. Audit Logs & System Security

- All administrative actions (user edits, role changes, attendance corrections, employee deletions) are logged in the immutable **Audit Logs** tab.
- Filter logs by date range, actor name, target employee code, or action category.
