# Exfin OMS — Firestore Database Structure & Schema Reference

This document provides a comprehensive reference of all Firestore collections, documents, field definitions, and relationships utilized by Exfin OMS.

---

## Collections Overview

| Collection Name | Purpose |
| :--- | :--- |
| `admin_users` | Authorized administrative accounts and roles (`SUPER_ADMIN`, `ADMIN`, `HR`). |
| `registrations` | Registered workforce accounts, employee details, role, status, and device IDs. |
| `attendance` | Daily employee check-in, checkout, GPS coordinates, geofence exit states, and audit trails. |
| `live_locations` | Real-time GPS location updates and heartbeat timestamps for active field staff. |
| `expenses` | Expense claims, category details, receipt storage URLs, and approval statuses. |
| `tasks` | Work Planner task assignments, subtasks, due dates, revisions, and status progression. |
| `leaves` | Leave requests, date ranges, leave types, reasons, and approval histories. |
| `leave_config` | System-wide leave policies and entitlement rules. |
| `employee_allowances` | Individual employee leave balance allocations. |
| `salaries` | Monthly salary calculations, advances, deductions, and attendance audits. |
| `salary_employee_configs` | Base salary structures and pay rates per employee. |
| `notifications` | System alerts, approval notifications, and announcements. |
| `announcements` | Company-wide broadcast announcements. |
| `efficiency_snapshots` | Automated daily employee efficiency scores and task metrics. |
| `audit_logs` | Immutable audit trail for admin actions, corrections, and profile modifications. |
| `chat_conversations` | In-app group chats and direct messaging conversations. |
| `chat_attachments` | Base64 and chunked file attachments for messaging. |

---

## 1. Collection: `attendance`
**Document ID**: `{employeeCode}_{YYYY-MM-DD}` (Canonical) or auto ID.

| Field Name | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Record unique identifier. |
| `employeeId` | `string` | Yes | Employee code (e.g. `EXFRNG001`). |
| `employeeName` | `string` | Yes | Full employee display name. |
| `date` | `string` | Yes | ISO date string (`YYYY-MM-DD`). |
| `checkInTime` | `string` | Yes | Time of check-in (`hh:mm AM/PM`). |
| `checkOutTime` | `string \| null` | No | Time of checkout (`hh:mm AM/PM` or `null` if active). |
| `checkInMode` | `string` | Yes | Mode: `OFFICE`, `WFH`, `CLIENT_VISIT`, `OUTDOOR`. |
| `checkInLatitude` | `number` | Yes | GPS latitude at check-in. |
| `checkInLongitude` | `number` | Yes | GPS longitude at check-in. |
| `checkInAddress` | `string` | Yes | Reverse-geocoded check-in address. |
| `checkInDistance` | `number` | Yes | Distance in meters from office center at check-in. |
| `checkoutLatitude` | `number \| null` | No | GPS latitude at checkout. |
| `checkoutLongitude` | `number \| null` | No | GPS longitude at checkout. |
| `checkoutAddress` | `string \| null` | No | Reverse-geocoded checkout address. |
| `checkoutDistance` | `number \| null` | No | Distance in meters from office center at checkout. |
| `currentState` | `string` | Yes | `CHECKED_IN`, `PENDING_FINAL_EXIT`, `FINALIZED_CHECKOUT`, `UNRESOLVED`. |
| `checkoutStatus` | `string` | Yes | `COMPLETED`, `UNRESOLVED`, `PENDING_ADMIN_REVIEW`. |
| `status` | `string` | Yes | `present`, `completed`, `UNRESOLVED`, `absent`. |
| `workingHours` | `string \| null` | No | Calculated working hours string (e.g., `8h 15m`). |
| `lastExitTime` | `string \| null` | No | Time when GPS exit detection recorded movement outside 25m. |
| `exitTime` | `string \| null` | No | Recorded exit timestamp. |
| `correctionHistory` | `array` | No | Audit history array of admin attendance corrections. |
| `previousStatus` | `string` | No | Status prior to admin correction. |

---

## 2. Collection: `registrations`
**Document ID**: `{firebaseAuthUid}`

| Field Name | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `uid` | `string` | Yes | Firebase Auth User ID. |
| `employeeCode` | `string` | Yes | Employee code (e.g., `EXFRNG001`). |
| `name` | `string` | Yes | Employee full name. |
| `email` | `string` | Yes | Employee email address. |
| `mobileNumber` | `string` | Yes | Contact phone number. |
| `role` | `string` | Yes | `EMPLOYEE`, `TEAM_LEADER`, `HR`, `ADMIN`, `SUPER_ADMIN`. |
| `office` | `string` | Yes | Department or office assignment (`ALL`, `Operations`, etc.). |
| `designation` | `string` | Yes | Job title or designation. |
| `status` | `string` | Yes | `Approved`, `Pending Approval`, `Rejected`, `Suspended`. |
| `deviceId` | `string` | Yes | Bound hardware device ID. |
| `deviceModel` | `string` | No | Device hardware model. |
| `isTeamLeader` | `boolean` | No | Flag indicating Team Leader authority. |
| `assignedTeamLeaderId` | `string \| null` | No | Assigned Team Leader employee ID. |

---

## 3. Collection: `expenses`
**Document ID**: `{expenseId}`

| Field Name | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Expense record ID. |
| `employeeCode` | `string` | Yes | Submitting employee code. |
| `employeeName` | `string` | Yes | Submitting employee name. |
| `category` | `string` | Yes | Category (`Travel`, `Food`, `Supplies`, etc.). |
| `amount` | `number` | Yes | Monetary amount. |
| `date` | `string` | Yes | Expense date (`YYYY-MM-DD`). |
| `description` | `string` | Yes | Justification / notes. |
| `receiptUrl` | `string \| null` | No | Uploaded receipt image URL. |
| `status` | `string` | Yes | `PENDING`, `APPROVED`, `REJECTED`. |
| `reviewedBy` | `string \| null` | No | Reviewer name / ID. |

---

## 4. Collection: `tasks` (Work Planner)
**Document ID**: `{taskId}`

| Field Name | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Unique task ID. |
| `title` | `string` | Yes | Task title. |
| `description` | `string` | Yes | Detailed task instructions. |
| `assignedToCode` | `string` | Yes | Assignee employee code. |
| `assignedToName` | `string` | Yes | Assignee name. |
| `assignedByCode` | `string` | Yes | Creator employee code. |
| `assignedByName` | `string` | Yes | Creator name. |
| `priority` | `string` | Yes | `LOW`, `MEDIUM`, `HIGH`, `URGENT`. |
| `status` | `string` | Yes | `PENDING`, `IN_PROGRESS`, `UNDER_REVIEW`, `COMPLETED`, `REVISION_REQUESTED`. |
| `dueDate` | `string` | Yes | Target completion date. |

---

## 5. Collection: `audit_logs`
**Document ID**: `{auditLogId}`

| Field Name | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Log entry ID. |
| `timestamp` | `string` | Yes | ISO execution timestamp. |
| `action` | `string` | Yes | Executed action name. |
| `actionCategory` | `string` | Yes | Category (`Attendance`, `User Management`, etc.). |
| `performedByUserId` | `string` | Yes | Actor user UID. |
| `performedByName` | `string` | Yes | Actor display name. |
| `employeeCode` | `string` | Yes | Target employee code. |
| `description` | `string` | Yes | Detailed description of change. |
| `oldValue` | `object \| null` | No | Pre-change record state. |
| `newValue` | `object \| null` | No | Post-change record state. |
