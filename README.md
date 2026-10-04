# OpsLens Enterprise Field Intelligence & Compliance Platform

[![Runtime](https://img.shields.io/badge/Runtime-Node.js%2024.16%20LTS-brightgreen.svg)](https://nodejs.org/)
[![Package Manager](https://img.shields.io/badge/Bun-1.1%2B-black.svg)](https://bun.sh/)
[![Mobile](https://img.shields.io/badge/Expo-SDK%2056%20Bare-blue.svg)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.85%20%2F%20React%2019.2-61dafb.svg)](https://reactnative.dev/)
[![Backend](https://img.shields.io/badge/Express-5.2.1-lightgrey.svg)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/MySQL-8.4%20LTS-orange.svg)](https://www.mysql.com/)
[![ORM](https://img.shields.io/badge/Prisma-7.8-1B222D.svg)](https://www.prisma.io/)
[![Background Jobs](https://img.shields.io/badge/BullMQ-6.3%20%2B%20Redis%206-red.svg)](https://bullmq.io/)

OpsLens is an enterprise-grade, offline-first field intelligence and compliance operations platform. Engineered for high-consequence physical environments—including manufacturing plants, healthcare facilities, cold-chain warehouses, and infrastructure networks—OpsLens enables distributed teams to execute inspections, document incidents with rich multi-modal evidence, and manage corrective action lifecycles under zero-connectivity field conditions. Compliance officers and supervisors benefit from automated SLA enforcement, immutable event-sourced audit logs, and instant PDF audit evidence dossiers.

---

## Architecture Overview

OpsLens operates as a cohesive monorepo composed of a hardened relational backend API with background job workers and an offline-first bare Expo React Native mobile client.

```mermaid
flowchart TB
    subgraph Client["Field Mobile Client (Expo SDK 56 / RN 0.85 / Hermes v1)"]
        UI["React Native UI / Dynamic Form Renderer"]
        SQLite[("Local SQLite Storage (expo-sqlite)")]
        SyncQueue["Idempotent Mutation Sync Queue"]
        MediaCache["Local Filesystem Cache (expo-file-system)"]
        Camera["Scanner & Media Capture (expo-camera / image-picker)"]

        UI --> SQLite
        UI --> MediaCache
        Camera --> MediaCache
        SQLite --> SyncQueue
    end

    subgraph Gateway["Express 5.2.1 API Engine"]
        MW_Tenancy["AsyncLocalStorage Tenant Context"]
        MW_Auth["JWT & Role Authorization Guard"]
        Router["Express Routers (Assets, Checklists, Incidents, Sync)"]
        MW_Tenancy --> MW_Auth --> Router
    end

    subgraph Persistence["Persistence & Infrastructure"]
        PrismaExt["Prisma Client Extension (Tenant Row-Level Isolation)"]
        MySQL[("MySQL 8.4 LTS Database")]
        Redis[("Redis 6+ Queue & Cache")]
        BullMQ["BullMQ Escalation & Notification Workers"]
        PDFGen["PDFKit Evidence Generator"]

        Router --> PrismaExt
        Router --> BullMQ
        Router --> PDFGen
        PrismaExt --> MySQL
        BullMQ --> Redis
        BullMQ --> PrismaExt
    end

    SyncQueue -.->|"POST /sync/batch (Idempotent UUIDs)"| MW_Tenancy
    MediaCache -.->|"POST /media/upload (Chunked Binary)"| MW_Tenancy
```

---

## Technical Baseline

| Layer | Technology | Specification / Version | Architectural Role |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | `24.16.0 LTS` | Server-side execution environment |
| **Package Manager** | Bun | `1.1.x` | Monorepo dependency management and script execution |
| **API Framework** | Express | `5.2.1` | REST HTTP routing, raw media endpoints, JSON validation |
| **Relational DB** | MySQL / MariaDB | `8.4 LTS` (Port 3307) | Transactional data storage with strict relational integrity |
| **ORM** | Prisma | `7.8.0` | Type-safe schema definition and query client extensions |
| **Task Queue** | BullMQ & Redis | BullMQ `6.3` / ioredis `6.0` | Asynchronous SLA monitoring and notification dispatch |
| **Mobile Runtime** | React Native | `0.85.3` / React `19.2.3` | Native cross-platform mobile client |
| **Mobile Toolchain**| Expo | `SDK 56.0.9` (Bare Workflow) | Camera, hardware scanning, and file system abstractions |
| **JS Engine** | Hermes | `v1` | Ahead-of-time bytecode compilation for low mobile latency |
| **Local Storage** | SQLite | `expo-sqlite 56.0.5` | Client-side offline cache and transaction logs |
| **Reporting** | PDFKit | `0.20.2` | Server-side vector PDF compliance dossier generation |
| **Language** | TypeScript | `6.0.3` | Strict type definitions across client and server |
| **Linter / Linter** | Fallow | Latest | Project-wide health checks and architectural guardrails |

---

## Monorepo Directory Layout

```
OpsLens/
├── api/                              # Backend Service
│   ├── prisma/
│   │   ├── schema.prisma             # Relational data models, enums & foreign keys
│   │   └── seed.ts                   # Seed script: Organizations, Roles, Users & Assets
│   ├── src/
│   │   ├── config/
│   │   │   └── redis.config.ts       # Redis connection pool and error fallbacks
│   │   ├── db.ts                     # Prisma client with Tenant Isolation extensions
│   │   ├── index.ts                  # Server bootstrap, middleware pipeline & listeners
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts    # JWT verification & role authorization guards
│   │   │   └── tenant.middleware.ts  # AsyncLocalStorage request context manager
│   │   ├── queues/
│   │   │   ├── notification.queue.ts # BullMQ queue for multi-channel notifications
│   │   │   └── sla.queue.ts          # BullMQ queue for overdue SLA processing
│   │   ├── routes/
│   │   │   ├── action-item.routes.ts # Corrective actions, comments & closure flow
│   │   │   ├── asset.routes.ts       # Sites, asset types, QR code resolver & assets CRUD
│   │   │   ├── audit.routes.ts       # Immutable audit trail queries and entity diffs
│   │   │   ├── auth.routes.ts        # Login, refresh tokens, logout & identity context
│   │   │   ├── checklist.routes.ts   # Dynamic JSON schema templates, assignments & runs
│   │   │   ├── incident.routes.ts    # Incident reporting, media uploads & assignments
│   │   │   ├── notification.routes.ts# Notification polling, mark-as-read & scans
│   │   │   ├── report.routes.ts      # Compliance metrics, SLA aggregations & PDF exports
│   │   │   └── sync.routes.ts        # Offline batch reconciliation endpoint
│   │   ├── utils/
│   │   │   └── response.util.ts      # Standardized JSON response formatting
│   │   ├── workers/
│   │   │   ├── notification.worker.ts# Notification consumer processor
│   │   │   └── sla.worker.ts         # SLA breach detection worker & escalations
│   │   └── test-*.ts                 # Comprehensive automated verification suite
│   ├── .env                          # Local database connection config
│   └── package.json                  # API dependencies and test runner scripts
├── mobile/                           # Mobile Application (Bare Expo)
│   ├── app/                          # Expo Router Navigation Tree
│   │   ├── _layout.tsx               # Root navigation stack configuration
│   │   ├── index.tsx                 # Main dashboard, compliance cards & quick actions
│   │   ├── scan.tsx                  # Real-time QR code camera scanner & manual entry
│   │   ├── asset/
│   │   │   └── [id].tsx              # Asset details, inspection history & active issues
│   │   ├── checklist/
│   │   │   └── run.tsx               # Dynamic schema-driven checklist execution engine
│   │   └── incident/
│   │       └── report.tsx            # Multi-severity incident reporting with media picker
│   ├── src/
│   │   ├── api.ts                    # HTTP client, network toggles & local DB bridge
│   │   ├── db/
│   │   │   ├── localDb.ts            # Local SQLite schema, caches & mutation sync queue
│   │   │   └── localDb.test.ts       # SQLite offline queuing test suite
│   │   ├── hooks/
│   │   │   └── useHomeState.ts       # Unified dashboard state management hook
│   │   └── types/
│   │       └── index.ts              # Core frontend TypeScript interfaces
│   ├── app.json                      # Expo application manifest
│   └── package.json                  # Mobile dependencies and execution scripts
├── db_data/                          # Persistent MySQL local data directory (git-ignored)
├── start.sh                          # Orchestrator: Database, API, and Mobile launch
├── TaskGraph.md                      # Milestone execution and verification record
├── OpsLens PRD.md                    # Core Product Requirements Document
└── README.md                         # Comprehensive System Documentation
```

---

## Core System Capabilities

### 1. Database-Level Multi-Tenant Isolation
OpsLens provides hard architectural isolation across organizations:
*   **Request Scope**: Every incoming request passes through [tenant.middleware.ts](file:///run/media/animesh/Zeus/Projects/OpsLens/api/src/middleware/tenant.middleware.ts), which initializes Node's `AsyncLocalStorage` context.
*   **Identity Binding**: [auth.middleware.ts](file:///run/media/animesh/Zeus/Projects/OpsLens/api/src/middleware/auth.middleware.ts) decodes verified JWT claims (`userId`, `role`, `organizationId`) and binds them directly into the context.
*   **Prisma Client Extension**: In [db.ts](file:///run/media/animesh/Zeus/Projects/OpsLens/api/src/db.ts), query interception automatically injects `organizationId: tenantId` into queries (`findMany`, `findFirst`, `update`, `delete`, `create`). Cross-tenant data leakage is prevented at the ORM layer without relying on ad-hoc developer queries.

### 2. Offline-First Sync & Idempotency
Designed for areas with unstable or non-existent connectivity:
*   **Client SQLite Storage**: Checklists, asset registries, draft runs, action items, and incidents are stored locally in SQLite (`expo-sqlite`) or fallback storage via [localDb.ts](file:///run/media/animesh/Zeus/Projects/OpsLens/mobile/src/db/localDb.ts).
*   **RFC 4122 Client UUIDs**: Every offline-created entity receives a client-generated UUID, preventing primary key collisions when flushed to the server.
*   **Transactional Sync Queue**: Mutations made offline enter the `sync_queue`. Once connectivity returns, mutations are batched to `POST /sync/batch`.
*   **Idempotent API Handlers**: [sync.routes.ts](file:///run/media/animesh/Zeus/Projects/OpsLens/api/src/routes/sync.routes.ts) verifies existing IDs before inserts; subsequent duplicate requests return successful acknowledgments without data duplication.

### 3. Dynamic Checklist & Inspection Engine
Flexible form architecture driven by JSON Schema:
*   **Schema Enforcement**: [checklist.routes.ts](file:///run/media/animesh/Zeus/Projects/OpsLens/api/src/routes/checklist.routes.ts) validates checklist configurations defining fields, types (`string`, `number`, `boolean`, `enum`), min/max constraints, and required fields.
*   **Dynamic Client Rendering**: [run.tsx](file:///run/media/animesh/Zeus/Projects/OpsLens/mobile/app/checklist/run.tsx) reads schema definitions and renders native form controls dynamically.
*   **Draft Auto-Save**: Field entries are written to local storage on every keystroke or selection.
*   **Validation & Submission**: Full schema compliance checks run locally before queuing final submission.

### 4. Incident Reporting & Media Pipeline
Structured incident escalation under any network condition:
*   **Capture**: [report.tsx](file:///run/media/animesh/Zeus/Projects/OpsLens/mobile/app/incident/report.tsx) captures severity (`low`, `medium`, `high`, `critical`), impacted asset references, textual observations, and photos.
*   **Media Handling**: Photos are persisted to the device filesystem (`expo-file-system`) and uploaded via `POST /media/upload` using raw binary streams up to 10MB.
*   **Corrective Action Triggers**: High- and critical-severity incidents automatically spawn corrective action items assigned to on-duty supervisors.

### 5. Corrective Action Lifecycle & SLA Escalation Engine
Closed-loop remediation tracking:
*   **Status Machine**: Tracks action items across `open` → `in_progress` → `completed` → `closed` statuses with mandatory resolution notes.
*   **Asynchronous SLA Queue**: Powered by BullMQ and Redis ([sla.queue.ts](file:///run/media/animesh/Zeus/Projects/OpsLens/api/src/queues/sla.queue.ts) and [sla.worker.ts](file:///run/media/animesh/Zeus/Projects/OpsLens/api/src/workers/sla.worker.ts)).
*   **Automated Escalation Scanning**: Background workers identify overdue action items, flag escalation states, and generate in-app supervisor notifications.

### 6. Immutable Audit Trail
Every mutation in the system is recorded for compliance review:
*   **Query Interception**: The Prisma extension intercepts all write operations (`create`, `update`, `delete`) across organizations.
*   **Append-Only Log**: Records actor ID, entity name, entity ID, timestamp, and JSON deltas (`oldState` and `newState`) into the `AuditLog` table.
*   **Audit Querying**: Access historical state timelines via `GET /audit-logs/entity/:entity/:entityId`.

### 7. Compliance Analytics & PDF Export Engine
*   **High-Speed Aggregations**: [report.routes.ts](file:///run/media/animesh/Zeus/Projects/OpsLens/api/src/routes/report.routes.ts) calculates overall compliance scores, inspection counts, and SLA compliance rates in under 100ms.
*   **Formal Compliance PDF**: `GET /reports/export/compliance-pdf` streams vector PDF audit summaries generated on-the-fly via PDFKit.
*   **Incident Evidence Dossier**: `GET /reports/incidents/:id/export/pdf` compiles incident timelines, attachments, severity ratings, and corrective actions into printable PDF reports.

---

## Complete API Reference

All routes (except `/auth/login` and `/health`) require `Authorization: Bearer <token>`.

### Authentication & Identity
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Public | Authenticates credentials, returns JWT with role and organization |
| `POST` | `/auth/refresh` | Authenticated | Refreshes active JWT session token |
| `POST` | `/auth/logout` | Authenticated | Clears current user session |
| `GET` | `/me` | All Roles | Returns active authenticated user identity and tenant details |

### Asset & Facility Registry
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/sites` | All Roles | Lists all sites within the authenticated organization |
| `GET` | `/asset-types` | All Roles | Lists asset classification categories |
| `GET` | `/assets` | All Roles | Lists assets (filterable by `siteId`, `assetTypeId`, `search`) |
| `GET` | `/assets/:assetId` | All Roles | Retrieves detailed asset record with recent inspection history |
| `GET` | `/assets/scan/:code` | All Roles | Resolves asset metadata from QR/barcode scanned string |
| `POST` | `/assets` | `site-admin`, `compliance-manager`, `supervisor` | Registers a new physical asset |
| `PATCH`| `/assets/:assetId` | `site-admin`, `compliance-manager`, `supervisor` | Modifies asset metadata or assigned site |
| `DELETE`| `/assets/:assetId`| `site-admin`, `compliance-manager` | Removes an asset from active registry |

### Offline Batch Synchronization
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/sync/batch` | All Roles | Idempotently reconciles client offline mutation operations |

### Dynamic Checklists & Inspections
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/checklist-templates` | All Roles | Lists available JSON Schema checklist templates |
| `POST` | `/checklist-templates` | `site-admin`, `compliance-manager` | Publishes a new JSON Schema checklist template |
| `PATCH`| `/checklist-templates/:id` | `site-admin`, `compliance-manager` | Updates an existing checklist template schema |
| `GET` | `/checklist-assignments` | All Roles | Lists active checklist template assignments to asset types |
| `POST` | `/checklist-assignments` | `site-admin`, `compliance-manager` | Links a checklist template to an asset category |
| `GET` | `/my/checklist-runs` | All Roles | Retrieves checklist runs completed by the caller |
| `POST` | `/checklist-runs` | All Roles | Initializes an inspection execution run (draft or completed) |
| `POST` | `/checklist-runs/:id/submit` | All Roles | Validates responses against template schema and finalizes run |

### Incident Management & Media Pipeline
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/media/upload` | All Roles | Accepts raw binary images (`image/*`, up to 10MB) |
| `GET` | `/incidents` | All Roles | Lists organization incidents (filterable by `severity`, `assetId`) |
| `GET` | `/incidents/:id` | All Roles | Retrieves complete incident record with attachments and actions |
| `POST` | `/incidents` | All Roles | Creates an incident record; auto-spawns actions if critical |
| `POST` | `/incidents/:id/assign` | `site-admin`, `supervisor` | Assigns incident oversight to a supervisor or worker |

### Corrective Action Items
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/action-items` | All Roles | Lists tasks (filterable by `status`, `priority`, `assigneeId`) |
| `GET` | `/action-items/:id` | All Roles | Retrieves detailed corrective action with discussion comments |
| `POST` | `/action-items` | All Roles | Creates a standalone corrective action task |
| `PATCH`| `/action-items/:id` | All Roles | Updates status, priority, description, or due date |
| `POST` | `/action-items/:id/comments` | All Roles | Appends an auditable comment to an action item |
| `POST` | `/action-items/:id/complete` | All Roles | Marks action item completed with mandatory closure notes |

### Notifications & Escalations
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/notifications` | All Roles | Retrieves pending in-app alerts and escalation notices |
| `POST` | `/notifications/:id/read` | All Roles | Marks an individual notification as read |
| `POST` | `/escalations/scan` | `site-admin`, `supervisor` | Triggers immediate manual scan for overdue SLA action items |

### Audit Pipeline
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/audit-logs` | All Roles | Retrieves recent immutable audit records |
| `GET` | `/audit-logs/:id` | All Roles | Retrieves an individual audit log entry |
| `GET` | `/audit-logs/entity/:entity/:entityId` | All Roles | Retrieves chronological change history and diffs for an entity |

### Reports, Analytics & PDF Generation
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/reports/compliance-summary` | All Roles | Returns overall compliance score, assets, and incident metrics |
| `GET` | `/reports/incidents` | All Roles | Provides incident breakdowns categorized by severity level |
| `GET` | `/reports/sla` | All Roles | Returns SLA compliance statistics and overdue task counts |
| `GET` | `/reports/export/compliance-pdf` | All Roles | Streams dynamically generated formal compliance report PDF |
| `GET` | `/reports/incidents/:id/export/pdf` | All Roles | Streams single incident evidence dossier PDF |

---

## Seed Data & Test Accounts

Running the database seeder sets up two isolated organizations with predefined roles and assets.

### Test Credentials
All accounts share the default development password format: `<role>123`

| Organization | Email | Password | Role | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Acme Industrial** | `admin@acme.com` | `admin123` | `site-admin` | Full tenant management, assets, templates |
| **Acme Industrial** | `compliance@acme.com` | `compliance123` | `compliance-manager` | Checklists, audit policies, PDF exports |
| **Acme Industrial** | `supervisor@acme.com` | `supervisor123` | `supervisor` | Action assignment, approvals, SLA triage |
| **Acme Industrial** | `worker@acme.com` | `worker123` | `field-worker` | Field inspections, incident reporting, sync |
| **Global Health** | `worker@globalhealth.com` | `worker123` | `field-worker` | Isolated tenant test user |

### Default Seed Assets & Templates
*   **Organization**: Acme Industrial
    *   **Site**: `Acme Factory Floor A`
    *   **Asset Type**: `Power Generator`
    *   **Asset**: `Main Backup Generator 01`
    *   **Checklist Template**: `Power Generator Safety Check` (assigned to `Power Generator` type)

---

## Setup & Local Execution

### System Requirements
*   **Node.js**: `24.16.0 LTS`
*   **Bun**: `1.1.x` or later
*   **MySQL / MariaDB**: `8.4 LTS` (Default local configuration binds to port `3307`)
*   **Redis**: `6.x` or later running on `127.0.0.1:6379` (for BullMQ queues)

### 1. Environment Configuration
Verify or create `/api/.env`:
```env
PORT=3000
DATABASE_URL="mysql://root:root@127.0.0.1:3307/opslens"
JWT_SECRET="opslens-secure-jwt-secret-key-2026"
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379
```

### 2. Install Dependencies
Install dependencies for both projects using Bun:
```bash
# Install API packages
cd api
bun install

# Install Mobile packages
cd ../mobile
bun install
```

### 3. Database Migration & Seeding
Apply Prisma database migrations and load default seed records:
```bash
cd api
bun x prisma migrate dev
bun x prisma db seed
```

### 4. Running the Complete Stack (Single Command)
OpsLens includes an orchestration script at the workspace root to start the database, Express API server, and Expo mobile dev server simultaneously:
```bash
./start.sh
```
*To terminate all services cleanly, press `Ctrl + C`.*

### 5. Running Individual Services

#### Start API Server
```bash
cd api
bun run dev
```
*Server boots at `http://localhost:3000` with hot-reloading.*

#### Start Mobile Metro Bundler
```bash
cd mobile
bun run start
```
*Press `w` in the terminal to preview in browser, or run on an emulator/physical device.*

*   **Android Emulator**: `bun run android`
*   **iOS Simulator**: `bun run ios`
*   **Web Preview**: `bun run web`

---

## Automated Verification & Test Suite

The API includes a modular integration test suite covering every phase of the platform:

```bash
cd api

# 1. Identity, JWT issuance, and Tenant Isolation tests
bun run test:auth

# 2. Site, Asset, and QR Code Registry tests
bun run test:registry

# 3. Base Offline Sync Idempotency tests
bun run test:sync

# 4. JSON Schema Checklist Engine & Execution tests
bun run test:checklists

# 5. Offline Checklist Execution & Batch Sync tests
bun run test:sync-checklist

# 6. Incident Reporting, Media Upload, and Action Triggers
bun run test:incidents

# 7. Offline Incident Batch Sync tests
bun run test:sync-incident

# 8. Corrective Action Lifecycle, Comments & Status Transitions
bun run test:actions

# 9. Offline Action Items Batch Sync tests
bun run test:sync-actions

# 10. BullMQ Redis SLA Tracking & Escalation Worker tests
bun run test:escalation

# 11. Prisma Mutation Interception & Immutable Audit Trail tests
bun run test:audit

# 12. Compliance Summary Aggregations & PDF Export tests
bun run test:reports
```

### Static Analysis & Health Auditing
Codebase standards and clean architecture constraints are enforced via Fallow:
```bash
# Audit API codebase
cd api
bun run health

# Audit Mobile codebase
cd ../mobile
bun run health
```

---

## Architectural Principles

*   **Offline-First Resilience**: All operations succeed without an active network connection. Writes queue locally with client-side UUIDs and reconcile idempotently.
*   **Multi-Tenant by Default**: No query reaches the database without strict tenant binding at the ORM extension layer.
*   **Configurable over Hardcoded**: Checklists use declarative JSON Schemas with dynamic mobile rendering rather than rigid static screens.
*   **Immutable Evidence Chain**: All state transitions produce append-only audit logs with complete before-and-after state snapshots.
*   **SOLID / DRY / KISS / GRASP**: Clean domain boundaries, single-purpose route controllers, isolated background queues, and shared type definitions.
