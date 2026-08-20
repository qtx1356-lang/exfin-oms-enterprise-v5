# Exfin OMS — Comprehensive Features Guide

This document lists and details every feature built into Exfin OMS.

---

## 1. Attendance & GPS Verification Engine
- **25m Geofence Radius**: Strict 25-meter boundary validation for office attendance check-ins.
- **Multiple Modes**: Office, Work From Home (WFH), Client Visit, Outdoor Work.
- **Precise GPS Address Formatting**: Standardized reverse-geocoding engine with coordinate-keyed memory/persistent caching and race-condition protection.
- **Office Exit Detection**: Automatic background exit detection when employee moves beyond 25m boundary.
- **Exit Checkout Prompt**: Manual confirmation workflow for exiting employees outside 25m.
- **State Machine**: Transitions through `CHECKED_IN`, `PENDING_FINAL_EXIT`, `FINALIZED_CHECKOUT`, and `UNRESOLVED`.

---

## 2. Administration & Workforce Control
- **Role-Based Access Control**: Super Admin, Admin, HR, Team Leader, Employee.
- **Hardware Device Binding**: Device ID matching, single-device enforcement, and admin device approval queue.
- **Attendance Correction**: Admin time adjustments with auto-calculated working hours and recursive payload sanitization.
- **Audit Logging**: Immutable logging of all admin operations with before/after state capture.

---

## 3. Operational Modules
- **Expense Claims**: Category management, receipt uploads, multi-stage approvals, and reimbursement tracking.
- **Leave Management**: Entitlement policies, balance calculation, leave applications, and approval history.
- **Work Planner & Tasks**: Priority tagging, due dates, proof submission, review/revision workflow.
- **Employee Efficiency**: Automated scoring metrics, daily performance snapshots, and activity logs.
- **Salary & Advances**: Salary configuration, advance tracking, attendance audits, and net pay calculation.
- **Messaging & Notifications**: Real-time group messaging, broadcast announcements, and targeted alerts.
- **Offline-First Engine**: Local cache operation with automatic queued sync when internet returns.
