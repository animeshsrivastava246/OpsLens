# OpsLens Mobile Application

The OpsLens Mobile application is an offline-first client built on the React Native framework using the Expo SDK 56 bare workflow. Designed for high performance and reliable operations on mid-range and enterprise-grade devices, it uses Hermes v1 for Javascript compilation and execution.

## Technical Architecture

### Component Stack
*   **Framework**: Expo SDK 56 (Bare Workflow)
*   **Runtime**: React Native 0.85, React 19.2
*   **Engine**: Hermes v1
*   **Language**: TypeScript 6.0.3

### Offline-First Persistence & Sync Strategy
The mobile application is designed to function in areas of low or zero network connectivity:

*   **SQLite Storage**: Form templates, local asset registries, checklists, action items, and pending submissions are serialized and persisted locally using `expo-sqlite`.
*   **Transactional Sync Queue**: Mutations made offline are stored as discrete operations in a local SQLite transaction log. Upon network re-connection, the app processes this queue sequentially using idempotent API endpoints to prevent duplicate records.
*   **Media and Evidence Handling**: Photos, audio comments, and digital signatures are captured and cached in the local device filesystem via `expo-file-system`. Background upload tasks transfer these files asynchronously to S3-compatible cloud storage, utilizing chunked or resumable protocols to survive network dropouts.

## Directory Structure

```
mobile/
├── .expo/                # Local Expo cache and compilation artifacts
├── android/              # Native Android project directory (bare workflow)
├── ios/                  # Native iOS project directory (bare workflow)
├── assets/               # Branding resources, app icons, and splash screens
├── App.tsx               # Main application entry point
├── app.json              # Expo application manifest configuration
└── package.json          # Dependency manifest and run scripts
```

## Running the Application

### Prerequisites
*   Node.js 24.16.0 LTS
*   Bun 1.1.x
*   CocoaPods (for iOS compilation)
*   Android Studio and SDK (for Android compilation)

### 1. Install Dependencies
```bash
bun install
```

### 2. Configure Native Projects
Initialize the native project configurations and build artifacts:
```bash
bun x expo prebuild
```

### 3. Start Development Server
Launch the Expo Metro packager:
```bash
bun run start
```

### 4. Execute on Simulators or Physical Devices

#### iOS Simulator / Device
```bash
bun run ios
```

#### Android Emulator / Device
```bash
bun run android
```
