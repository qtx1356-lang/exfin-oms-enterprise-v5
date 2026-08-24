# Office Management System — Complete Feature Documentation

Office Management System delivers a complete suit of operational tools designed for enterprise workforce management.

---

## 1. Employee Mobile & Web Portal

### 📍 GPS & Geofenced Attendance
- **25-Meter Office Geofence Enforcement:** Hardware-backed Google Play Location geofencing enforced around the office location.
- **Dual Automatic Check-In:** Automatic check-in triggered upon entering office radius or opening app within bounds.
- **Authoritative Physical Exit Timestamping:** Captures exact hardware exit timestamp (`triggerLocation.getTime()`) even if app is closed or screen is locked.
- **Interactive Checkout Confirmation Modal:** Displays exact exit time (e.g. 06:02 PM) with options to Confirm Final Checkout or indicate "Returning to Office".
- **My Day Timeline:** Visual chronological feed of daily check-in, breaks, exits, and activity logs.

### 💼 Expense Management & AI Receipt OCR
- **Receipt Scanner:** High-accuracy AI OCR powered by Gemini API to extract merchant, date, total amount, tax, and line items automatically.
- **Category Management:** Travel, meals, supplies, client entertainment, utility expenses.
- **Status Tracker:** Live tracking of expense approvals (Pending, Approved, Rejected) with reimbursement history.

### 📅 Work Planner & Task Management
- **Interactive Task Kanban:** View assigned tasks, due dates, priority levels, and completion status.
- **Task Deadline Warnings:** Automatic notifications when tasks near deadline.

### 🌴 Leave Management
- **Leave Request System:** Apply for Annual, Sick, Casual, or Unpaid Leave with balance tracking.
- **Approval Workflow:** Manager notification and approval status tracking.

### 📊 Efficiency & Work Hours Engine
- **Productivity Score Calculation:** Automated algorithmic calculation of daily efficiency score based on active office hours, task completions, and punctual attendance.
- **Work Hours Progress:** Real-time progress bar towards daily targeted work hours (e.g., 8h requirement).

### 💬 Internal Team Chat
- **Department & Company Channels:** All-employee announcements, team channels, and direct messaging.
- **Security & Privacy Isolation:** Super Admin accounts are isolated from employee chat visibility.

---

## 2. Admin Portal & HR Management

### 🏢 Real-Time Office Pulse
- **Live Presence Dashboard:** Instant count of Currently Present, On Break, On Leave, and Pending Exit.
- **Live Attendance Feed:** Stream of real-time employee check-ins and check-outs with location verification badge.

### 👥 HR Employee Profiles & Management
- **Employee Directory:** Searchable directory with designations, departments, contact info, and status.
- **Device Registration Control:** Approve or reject new mobile device registration requests to prevent proxy attendance logging.
- **Salary & Payslip Generation:** Automated monthly salary calculation and downloadable PDF payslip generator (`jspdf`).

### 📑 Reports & Analytics
- **Export Formats:** One-click CSV and PDF export for monthly attendance summaries, work hours, expenses, and audit logs.
- **Attendance Intelligence:** AI-generated summary of attendance patterns, frequent tardiness, and overtime trends.

### 🔒 Role-Based Access Control (RBAC) & Audit Trail
- **Granular Roles:** Super Admin, HR Manager, Department Leader, Auditor, Employee.
- **Immutable Audit Log:** Tamper-evident logging of all admin actions, attendance overrides, profile edits, and approvals.
