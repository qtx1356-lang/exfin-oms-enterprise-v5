# EXFIN OMS — Protected Core Features Policy

The following three features are CORE and PROTECTED features of EXFIN OMS:

### 1. 25-meter office geofence
- The existing 25-meter radius must remain unchanged.
- Existing geofence behavior and enforcement must remain unchanged.
- Do not modify, weaken, bypass, disable, replace, or increase/decrease the radius.

### 2. Location system
- Existing location acquisition, location validation, distance-from-office calculation, location status, and location-related attendance protection are protected.
- Do not replace the location provider, alter location validation logic, change accuracy requirements, or bypass location checks.
- Do not modify the location behavior merely to fix unrelated UI, performance, networking, or background-processing issues.

### 3. Offline-first startup
- The application must remain capable of starting and functioning from its cached application shell when there is no internet connection.
- Offline startup must not depend on Firebase, APIs, Google services, or any network request.
- Do not re-enable a blocking offline page.
- Do not change the service-worker offline-first architecture in a way that can break offline startup.
- Existing offline storage, queued operations, and synchronization behavior must remain intact.

## ABSOLUTE CHANGE CONTROL
These three features must NOT be changed under any circumstances unless the user explicitly requests and authorizes the specific change.

Before making ANY code change anywhere in the project:
1. Check whether the change could affect any of these three protected features.
2. If it could affect them, DO NOT modify those parts of the code.
3. Do not silently refactor protected code.
4. Do not replace protected services with another library.
5. Do not change protected constants or configuration values.
6. Do not optimize, simplify, reorganize, or "clean up" protected logic.
7. Do not change their behavior as a side effect of another feature.

## REQUIRED DEVELOPMENT RULE
For every future feature request, preserve these three protected features exactly as they currently work.

If an implementation would require modifying one of them, STOP and report:
`"This change would affect one of EXFIN OMS's three protected core features. I will not modify it without explicit authorization."`

Do not proceed with that portion of the task.

## EXPLICIT AUTHORIZATION
Only the user can unlock a protected feature.
A general request such as "fix the app", "optimize performance", "refactor the code", "improve location", "fix attendance", "add a plugin", or "make it faster" does NOT constitute authorization to change the protected features.
Authorization must explicitly identify the protected feature and the requested change.
Until then, preserve the existing implementation exactly.
