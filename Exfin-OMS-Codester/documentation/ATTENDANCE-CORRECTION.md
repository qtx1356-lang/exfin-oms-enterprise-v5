# Exfin OMS — Attendance Correction Technical Architecture

This document details the admin attendance correction flow, state resolution logic, and Firestore payload sanitization rules.

---

## 1. Overview & Workflow

When an employee forgets to check out, leaves early, or experiences a device error, administrators can manually rectify their attendance record via the Admin Dashboard.

```
[Admin UI Correction Form]
         |
         v
[Evaluate Previous Status] (checkoutStatus || currentState || status)
         |
         v
[Build Correction Payload]
         |
         v
[sanitizeFirestorePayload()] (Recursively strips undefined keys/items)
         |
         v
[updateDoc(docRef, cleanPayload)]
         |
         v
[Write Immutable Audit Log]
```

---

## 2. Status Resolution Rules

When applying an admin correction, the system automatically preserves the record's prior status:

1. **`checkoutStatus`**: Checked first (e.g. `COMPLETED`, `UNRESOLVED`).
2. **`currentState`**: Checked if `checkoutStatus` is missing (e.g. `PENDING_FINAL_EXIT`, `CHECKED_IN`).
3. **`status`**: Checked if both newer fields are missing (e.g. `present`, `completed`).
4. **All Missing**: If all three fields are missing, `previousStatus` is omitted from the update payload.

---

## 3. Recursive Payload Sanitization

Firestore's `updateDoc()` and `setDoc()` strictly throw an error when receiving any object or nested array element containing `undefined`.

To guarantee error-free writes, Exfin OMS passes all update payloads through `sanitizeFirestorePayload()`:

- **Objects**: Recursively removes keys with `undefined` values.
- **Arrays**: Filters out `undefined` items and recursively cleans nested objects within arrays (such as `correctionHistory` entries).
- **Preserved Types**: Preserves `null`, primitives, `Date` instances, and Firestore `serverTimestamp()` references.

---

## 4. Audit Trail Entry

Every correction generates an audit entry in `correctionHistory` and writes an immutable record to `audit_logs`:
- Performed by Admin name, UID, and role.
- Prior check-in and check-out timestamps.
- Corrected check-in and check-out timestamps.
- Resolution source (`ADMIN_CORRECTION` or `EMPLOYEE_PROPOSED`).
- Exact timestamp of correction.
