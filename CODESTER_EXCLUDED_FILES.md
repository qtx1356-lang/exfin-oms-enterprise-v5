# CODESTER EXCLUDED FILES MANIFEST

**Project:** Office Management System  
**Distribution:** Codester Commercial Source Package  
**Purpose:** Documents all development-only scripts, temporary diagnostic tools, local patch files, and staging credential files excluded from the commercial release bundle.

---

## Excluded Files Manifest

| # | File Name / Path | Exclusion Reason |
|---|---|---|
| **1** | `/cleanup.ts` | Development Firebase Admin SDK cleanup script containing staging project IDs. |
| **2** | `/delete_001.js` | Internal diagnostic script used to remove test registration records during development. |
| **3** | `/fix_attendance.cjs` | Temporary patch script used to adjust attendance mock records during development. |
| **4** | `/fix_median.patch` | Staging patch file created during Median bridge integration testing. |
| **5** | `/fix_workpulse.js` | One-time data repair script for workpulse logs. |
| **6** | `/run_check.js` | Development database document status check script. |
| **7** | `/run_check_delete.js` | Development script for deleting test registrations. |
| **8** | `/run_check_final.js` | Development database state verification script. |
| **9** | `/run_cleanup.js` | Development script for clearing registration collections. |
| **10** | `/test_jsdom.cjs` | Local JSDOM rendering test harness. |
| **11** | `/test_jsdom_local.cjs` | Local Express + JSDOM test server runner. |
| **12** | `/test_live.cjs` | Live endpoint HTTP response test script. |
| **13** | `/test_live2.cjs` | Live server HTML verification script. |
| **14** | `/test_playwright.cjs` | Playwright automated browser test script. |
| **15** | `/test_regex.js` | Regex asset matching test script. |
| **16** | `/test_startup.cjs` | Startup coordinator lifecycle test script. |
| **17** | `/test_sw_navigator.js` | Service Worker navigator object test script. |
| **18** | `/update_median.cjs` | One-time development script used to update Median bridge code. |
| **19** | `/update_sw_install.cjs` | One-time development script used to modify Service Worker pre-cache logic. |
| **20** | `/update_sw_install.js` | Alternative ES module version of SW updater script. |
| **21** | `/firestore.rules.bak` | Backup copy of Firestore security rules generated during development. |
| **22** | `/firebase-applet-config.json` | Active staging credentials config file (replaced by `firebase-applet-config.example.json` in distribution). |
| **23** | `/bun.lock` | Staging sandbox lockfile. |

---

## Guarantee

None of the files listed above contain core application logic, database schemas, Android native code, or business features required by the buyer. Excluding them guarantees that the commercial distribution remains clean, secure, professional, and free of staging artifact bloat.
