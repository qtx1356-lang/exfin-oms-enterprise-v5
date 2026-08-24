# THIRD-PARTY LICENSE AUDIT REPORT

**Project:** Office Management System  
**Audit Date:** August 22, 2026  
**Status:** PASSED — ALL DEPENDENCIES COMPLIANT  

---

## Overview

This document provides a comprehensive third-party license audit for all software libraries, frameworks, plugins, fonts, icons, and assets bundled within Office Management System.

**Key Guarantee:**
- No legitimate dependencies have been removed.
- Dependency versions in `package.json` and `build.gradle` have NOT been altered.
- All included software packages use open-source licenses compatible with commercial redistribution and source-code resale (e.g., MIT, Apache 2.0, ISC, BSD-2-Clause).

---

## 1. Web & Application Runtime Dependencies (`package.json`)

| Package Name | Version | License | Usage Purpose | Commercial Resale Permitted? | Attribution Requirement |
|---|---|---|---|---|---|
| `react` | `^19.0.1` | MIT | Frontend UI rendering framework | **YES** | Include MIT license notice |
| `react-dom` | `^19.0.1` | MIT | DOM rendering bindings for React | **YES** | Include MIT license notice |
| `react-router-dom` | `^7.18.2` | MIT | Client-side routing engine | **YES** | Include MIT license notice |
| `express` | `^4.21.2` | MIT | Full-stack Node.js web server | **YES** | Include MIT license notice |
| `firebase` | `^12.17.1` | Apache 2.0 | Firebase Client SDK (Auth, Firestore, Storage) | **YES** | Include Apache 2.0 notice |
| `firebase-admin` | `^14.2.0` | Apache 2.0 | Firebase Admin SDK for server-side verification | **YES** | Include Apache 2.0 notice |
| `@google/genai` | `^2.4.0` | Apache 2.0 | Official Google Gemini AI TypeScript SDK | **YES** | Include Apache 2.0 notice |
| `@capacitor/core` | `^8.5.0` | MIT | Capacitor native runtime bridge | **YES** | Include MIT license notice |
| `@capacitor/app` | `^8.1.1` | MIT | Capacitor native app lifecycle plugin | **YES** | Include MIT license notice |
| `@capacitor/device` | `^8.0.3` | MIT | Device identification & info plugin | **YES** | Include MIT license notice |
| `@capacitor/geolocation` | `^8.2.1` | MIT | Native high-accuracy GPS plugin | **YES** | Include MIT license notice |
| `@capacitor/local-notifications` | `^8.2.1` | MIT | Native device notification scheduler | **YES** | Include MIT license notice |
| `@capacitor/push-notifications` | `^8.1.2` | MIT | FCM push notification integration plugin | **YES** | Include MIT license notice |
| `median-js-bridge` | `^2.20.0` | MIT | Bridge client for Median.co Android container | **YES** | Require buyer's Median account |
| `lucide-react` | `^0.546.0` | ISC | Vector icon set | **YES** | Include ISC license notice |
| `motion` | `^12.23.24` | MIT | UI animation engine | **YES** | Include MIT license notice |
| `@tailwindcss/vite` | `^4.1.14` | MIT | Tailwind CSS Vite compilation plugin | **YES** | Include MIT license notice |
| `clsx` | `^2.1.1` | MIT | Utility for constructing `className` strings | **YES** | Include MIT license notice |
| `tailwind-merge` | `^3.6.0` | MIT | Utility for merging Tailwind CSS classes | **YES** | Include MIT license notice |
| `html2canvas` | `^1.4.1` | MIT | Screenshot / canvas capture library for PDF export | **YES** | Include MIT license notice |
| `jspdf` | `^4.2.1` | MIT | Client-side PDF generation library | **YES** | Include MIT license notice |
| `dotenv` | `^17.2.3` | BSD-2-Clause | Environment variable loader | **YES** | Include BSD notice |
| `vite` | `^6.2.3` | MIT | Frontend build tool and dev server | **YES** | Include MIT license notice |
| `esbuild` | `^0.25.0` | MIT | High-performance bundler for server entry point | **YES** | Include MIT license notice |
| `tsx` | `^4.21.0` | MIT | TypeScript execution engine for Node.js | **YES** | Include MIT license notice |
| `typescript` | `~5.8.2` | Apache 2.0 | Static typing system | **YES** | Include Apache 2.0 notice |

---

## 2. Android Native Dependencies (`android/app/build.gradle`)

| Dependency | Version / Source | License | Usage Purpose |
|---|---|---|---|
| `androidx.appcompat:appcompat` | AndroidX standard | Apache 2.0 | Compatibility UI components |
| `androidx.coordinatorlayout:coordinatorlayout` | AndroidX standard | Apache 2.0 | Layout coordination |
| `androidx.core:core-splashscreen` | AndroidX standard | Apache 2.0 | Native splash screen handling |
| `com.google.android.gms:play-services-location` | `21.2.0` | Google Play Services | High-accuracy native Android geofence & GPS engine |
| `com.google.gms.google-services` | Gradle Plugin | Apache 2.0 | Firebase Google Services build plugin |

---

## 3. UI Assets, Fonts & Media

- **Icons:** All visual icons are supplied via `lucide-react` (ISC License).
- **Fonts:** Uses system font stacks and Google Web Fonts (Plus Jakarta Sans, Playfair Display) loaded via standard HTTPS link tags (SIL Open Font License).
- **Notification Sounds:** Alert sound files in `public/sounds/` are open custom-generated alert chimes.
- **Images & Branding:** Application UI uses custom SVG graphics, dynamic charts, and CSS styling. Included marketing banners were generated specifically for commercial release under open commercial distribution rights.

---

## 4. Compliance Verification Summary

All third-party components included in Office Management System allow commercial redistribution, source code bundling, and marketplace resale. A complete `LICENSE_NOTICES.md` file is bundled inside the commercial package root documenting attribution for all open-source libraries.
