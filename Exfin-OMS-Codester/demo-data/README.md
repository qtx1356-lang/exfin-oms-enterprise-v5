# Exfin OMS — Fictional Demo Data Guide

This document provides sample JSON dataset structures for initializing fictional demo employees and test data in your new Firebase Firestore database.

---

## Fictional Demo Employees

When demonstrating Exfin OMS to clients or testing system features, use these fictional employee profiles:

### Employee 1: Alex Taylor (Operations)
- **Document Path**: `registrations/EXFRNG001`
- **JSON Structure**:
```json
{
  "uid": "demo_user_001",
  "employeeCode": "EXFRNG001",
  "name": "Alex Taylor",
  "email": "alex.taylor@example.com",
  "mobileNumber": "+1 555-0101",
  "department": "Operations",
  "designation": "Operations Associate",
  "office": "Operations",
  "role": "EMPLOYEE",
  "status": "Approved",
  "approved": true,
  "deviceId": "DEMO_DEVICE_001",
  "deviceModel": "Demo Smartphone A1",
  "createdAt": "2026-01-01T08:00:00.000Z"
}
```

### Employee 2: Morgan Reed (Team Leader)
- **Document Path**: `registrations/EXFRNG002`
- **JSON Structure**:
```json
{
  "uid": "demo_user_002",
  "employeeCode": "EXFRNG002",
  "name": "Morgan Reed",
  "email": "morgan.reed@example.com",
  "mobileNumber": "+1 555-0102",
  "department": "Operations",
  "designation": "Team Lead",
  "office": "Operations",
  "role": "TEAM_LEADER",
  "isTeamLeader": true,
  "status": "Approved",
  "approved": true,
  "deviceId": "DEMO_DEVICE_002",
  "deviceModel": "Demo Smartphone T1",
  "createdAt": "2026-01-01T08:00:00.000Z"
}
```

### Employee 3: Jordan Lee (Sales Executive)
- **Document Path**: `registrations/EXFRNG003`
- **JSON Structure**:
```json
{
  "uid": "demo_user_003",
  "employeeCode": "EXFRNG003",
  "name": "Jordan Lee",
  "email": "jordan.lee@example.com",
  "mobileNumber": "+1 555-0103",
  "department": "Sales",
  "designation": "Sales Executive",
  "office": "Sales",
  "role": "EMPLOYEE",
  "status": "Approved",
  "approved": true,
  "deviceId": "DEMO_DEVICE_003",
  "deviceModel": "Demo Smartphone S1",
  "createdAt": "2026-01-01T08:00:00.000Z"
}
```

### Employee 4: Sam Casey (Senior Engineer)
- **Document Path**: `registrations/EXFRNG004`
- **JSON Structure**:
```json
{
  "uid": "demo_user_004",
  "employeeCode": "EXFRNG004",
  "name": "Sam Casey",
  "email": "sam.casey@example.com",
  "mobileNumber": "+1 555-0104",
  "department": "Engineering",
  "designation": "Senior Engineer",
  "office": "Engineering",
  "role": "EMPLOYEE",
  "status": "Approved",
  "approved": true,
  "deviceId": "DEMO_DEVICE_004",
  "deviceModel": "Demo Smartphone E1",
  "createdAt": "2026-01-01T08:00:00.000Z"
}
```

---

## How to Import Demo Data

1. Log in to the [Firebase Console](https://console.firebase.google.com/).
2. Open **Firestore Database > Data**.
3. Create collection `registrations`.
4. Add documents using document IDs `EXFRNG001`, `EXFRNG002`, `EXFRNG003`, `EXFRNG004` and paste the JSON field values shown above.
5. Alternatively, employees can register directly through the application's register screen, and administrators can approve their devices from the Admin Dashboard!
