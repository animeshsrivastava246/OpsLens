# OpsLens Mobile Application

The OpsLens Mobile application is an offline-first client built on React Native and the Expo SDK 56 bare workflow. Designed for high performance and low-latency interactions on mid-range and enterprise-grade devices, it uses Hermes v1 for JavaScript compilation and execution.

---

## Technical Stack

*   **Framework**: Expo SDK 56 (Bare Workflow) with Expo Router
*   **Runtime**: React Native 0.85.3, React 19.2.3
*   **Engine**: Hermes v1 (Bytecode compilation)
*   **Language**: TypeScript 6.0.3
*   **Storage**: SQLite (`expo-sqlite 56.0.5`) with local schema and offline mutation queue
*   **Camera & Scanning**: `expo-camera 56.0.8` for QR code and barcode scanning
*   **Filesystem & Media**: `expo-file-system 57.0.1` and `expo-image-picker 57.0.5`

---

## Architecture & Navigation Structure

```
mobile/
├── app/                          # Expo Router Navigation Tree
│   ├── _layout.tsx               # Root navigation stack configuration
│   ├── index.tsx                 # Dashboard: Compliance metrics, assets & quick actions
│   ├── scan.tsx                  # QR & barcode scanner with manual code input
│   ├── asset/
│   │   └── [id].tsx              # Asset details, inspection history & open issues
│   ├── checklist/
│   │   └── run.tsx               # Dynamic JSON Schema checklist execution engine
│   └── incident/
│       └── report.tsx            # Incident capture with severity and photo attachments
├── src/
│   ├── api.ts                    # HTTP client with offline queue interceptor
│   ├── db/
│   │   ├── localDb.ts            # Local SQLite schema, caching and sync queue
│   │   └── localDb.test.ts       # Local database & queuing test suite
│   ├── hooks/
│   │   └── useHomeState.ts       # Unified dashboard state management hook
│   └── types/
│       └── index.ts              # Frontend data models and interfaces
├── android/                      # Native Android project directory (bare workflow)
├── ios/                          # Native iOS project directory (bare workflow)
├── assets/                       # Branding resources and app icons
├── app.json                      # Expo application manifest
└── package.json                  # Dependencies and run scripts
```

---

## Offline-First Capabilities

1.  **Local SQLite Cache**:
    *   Assets, checklist templates, assignments, draft runs, action items, and incidents are stored locally in SQLite (`expo-sqlite`).
    *   Enables full app navigation and execution with zero network connectivity.

2.  **Idempotent Mutation Queue (`sync_queue`)**:
    *   Offline mutations (inspections, incidents, actions) are stored in an append-only transaction log.
    *   Client entities use RFC 4122 UUIDs to avoid sequence conflicts.
    *   When connectivity is restored, mutations are flushed to `POST /sync/batch`.

3.  **Dynamic Checklist Execution**:
    *   Inspects incoming JSON Schemas and renders form elements dynamically.
    *   Auto-saves responses locally as drafts to avoid losing progress.

4.  **Local Media Pipeline**:
    *   Images are saved locally via `expo-file-system`.
    *   Background upload worker posts raw binary streams to `POST /media/upload`.

---

## Running the Application

### Prerequisites
*   Node.js 24.16.0 LTS
*   Bun 1.1+
*   Android Studio & SDK (for Android) or Xcode & CocoaPods (for iOS)

### 1. Install Dependencies
```bash
bun install
```

### 2. Prebuild Native Projects (If Needed)
```bash
bun x expo prebuild
```

### 3. Launch Development Server
```bash
bun run start
```

### 4. Target Platforms
*   **Web Preview**: `bun run web` (or press `w` in Metro CLI)
*   **Android Emulator / Device**: `bun run android` (or press `a` in Metro CLI)
*   **iOS Simulator / Device**: `bun run ios` (or press `i` in Metro CLI)

### 5. Code Quality Check
```bash
bun run health
```
