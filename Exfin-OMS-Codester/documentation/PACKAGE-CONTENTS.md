Exfin OMS — Package Contents Directory
=======================================

Below is the complete inventory of files and directories included in the Exfin OMS Codester commercial package:

Exfin-OMS-Codester/
│
├── source-code/                 # Full Web Application & Express Node.js Server
│   ├── src/                     # React 19 + TypeScript component architecture
│   ├── public/                  # Public static assets & favicons
│   ├── server.ts                # Production Express backend entry point
│   ├── index.html               # Main HTML document
│   ├── vite.config.ts           # Vite build configuration
│   ├── tsconfig.json            # TypeScript configuration
│   ├── package.json             # NPM dependencies & build scripts
│   ├── bun.lock                 # Lockfile for reproducible builds
│   ├── capacitor.config.ts      # Capacitor mobile configuration
│   ├── storage.rules            # Firebase Storage security rules
│   ├── metadata.json            # AI Studio applet metadata
│   ├── .env.example             # Environment variable placeholders
│   └── firebase-applet-config.json # Firebase project configuration template
│
├── android/                     # Native Android Capacitor Project
│   ├── app/                     # Android module, Gradle configuration, & assets
│   │   ├── src/main/            # AndroidManifest.xml & Java geofence plugin source
│   │   └── build.gradle         # App-level Gradle dependencies
│   ├── build.gradle             # Root-level Gradle build configuration
│   └── variables.gradle         # Dependency version definitions
│
├── documentation/               # Comprehensive Guides
│   ├── INSTALLATION-GUIDE.md    # Quickstart and full installation manual
│   ├── FIREBASE-SETUP.md        # Step-by-step Firebase project provisioning guide
│   ├── FIRESTORE-STRUCTURE.md   # Complete Firestore collection & field schema
│   ├── DEPLOYMENT-GUIDE.md      # Cloud Run, Node, & static hosting deployment
│   ├── ADMIN-GUIDE.md           # Administrator dashboard operations manual
│   ├── EMPLOYEE-GUIDE.md        # Employee mobile/web app usage guide
│   ├── FEATURES.md              # Detailed list of all system features
│   ├── GPS-ATTENDANCE.md        # GPS, 25m geofence, & address engine technical docs
│   ├── ATTENDANCE-CORRECTION.md # Admin correction & payload sanitization technical docs
│   ├── TROUBLESHOOTING.md       # Frequently asked questions & resolution steps
│   ├── DEMO-CREDENTIALS.txt     # Sample admin & employee login credentials
│   ├── CODESTER-DESCRIPTION.md  # Official Codester marketplace copy
│   ├── PACKAGE-CONTENTS.md      # This file
│   └── SCREENSHOT-CHECKLIST.md  # Required marketplace screenshot guide
│
├── configuration/               # Marketplace Template Files
│   ├── .env.example             # Web app environment variables template
│   ├── firebase-applet-config.example.json # Firebase web config template
│   └── google-services.example.json        # Android Firebase config template
│
├── database/                    # Firestore Security Rules
│   └── firestore.rules          # Production-grade Firestore security rules
│
├── demo-data/                   # Demo Data Instructions
│   └── README.md                # Fictional demo dataset structures & import guide
│
├── assets/                      # Visual Assets Placeholder
│   ├── screenshots/             # Folder for buyer UI screenshots
│   └── preview/                 # Folder for marketplace banner preview
│
├── README.md                    # Main project overview & quickstart
├── CHANGELOG.txt                # System release notes
└── LICENSE.txt                  # Codester commercial marketplace license
