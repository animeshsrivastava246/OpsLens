# OpsLens Enterprise Field Intelligence and Compliance Platform

OpsLens is a multi-tenant, offline-first field intelligence and compliance system designed for high-consequence physical environments such as manufacturing facilities, healthcare systems, warehouses, and logistics networks. The platform enables field teams to execute inspections, document incidents with rich evidence, and track corrective action lifecycles under volatile network connectivity conditions, while providing supervisors and compliance managers with real-time auditability, trend analysis, and SLA enforcement.

## System Architecture

The project is structured as a monorepo containing two core services:

*   **api/**: Express-based backend engine providing schema-enforced relational persistence, token-based identity verification, and Tenant-Isolation middleware.
*   **mobile/**: React Native mobile client built with Expo (bare workflow) providing localized storage, scanning, media capture, and background synchronization.

```
OpsLens/
├── api/                  # Express API Server and Prisma ORM persistence layer
├── mobile/               # React Native Client (Expo SDK 56)
├── db_data/              # Local MySQL persistent storage volume (git-ignored)
├── start.sh              # Orchestrator script to start all services (DB, API, Mobile)
├── OpsLens PRD.md        # Product Requirements Document
└── TaskGraph.md          # Implementation Phase and Stage Graph
```

## Technical Baseline

| Component | Technology | Version | Description |
| :--- | :--- | :--- | :--- |
| Runtime | Node.js | 24.16.0 LTS | Primary execution environment |
| Package Manager | Bun | 1.1.x | Core package installer and script runner |
| API Server | Express | 5.2.1 | HTTP routing and middleware framework |
| Database | MySQL | 8.4 LTS | Transactional relational persistence |
| ORM | Prisma | Latest | Type-safe schema definition and query builder |
| Mobile Framework | Expo / React Native | SDK 56 / RN 0.85 | Hybrid application framework |
| JS/TS Engine | Hermes | v1 | High-performance Javascript engine |
| Language | TypeScript | 6.0.3 | Strict compiler settings enforced |

## Core Architecture Concepts

### Multi-Tenancy Isolation
The backend enforces tenant isolation at the database layer using Prisma Client Extensions and Node's `AsyncLocalStorage`. Every HTTP request passes through a tenant verification middleware that extracts the tenant identifier from the JWT and binds it to the execution context. Custom Prisma middleware intercepts all database queries (`findMany`, `findUnique`, `update`, etc.) to inject strict tenant-filtering parameters, preventing cross-tenant data leaks.

### Offline-First Synchronization
The mobile application uses an offline-first execution strategy. 
*   **Local State**: All checklists, asset records, and pending actions are cached locally using SQLite.
*   **UUID Primary Keys**: Client devices generate RFC 4122-compliant UUIDs for offline creations to eliminate server-side sequence collisions.
*   **Idempotent API Operations**: Sync APIs use unique transaction keys to ensure safety during network retries.
*   **Conflict Resolution**: Synchronizations track record versioning and push conflict states to the supervisor triage interface when manual reconciliation is required.

### Immutable Audit Log Engine
Every state mutation within the platform (e.g., checklist execution, incident escalation, corrective action closure) triggers an append-only audit event. These events record the actor, client timestamp, exact state delta, and authorization token signatures.

## Getting Started

### Prerequisites

*   Node.js 24.16.0 LTS
*   Bun 1.1.x (or later)
*   MySQL 8.4 LTS (running locally or via container)

### Step 1: Clone and Configure Environment Variables

Define the environment variables in both `api/.env` and `mobile/.env`. Refer to the respective module READMEs for configuration specifications.

### Step 2: Install Project Dependencies

Execute `bun install` at the root level of each directory:

```bash
# Install API dependencies
cd api
bun install

# Install Mobile dependencies
cd ../mobile
bun install
```

### Step 3: Database Schema Migration

Initialize the MySQL database and apply migration schemas:

```bash
cd ../api
bun x prisma migrate dev
bun x prisma db seed
```

### Step 4: Run the Entire Stack

You can start the Database (port 3307), API dev server, and Mobile Expo project concurrently using the orchestrator script in the root folder:

```bash
# Start all services
./start.sh
```

To stop all services safely, press `Ctrl + C`. The script catches the signal and kills all background processes cleanly.

---

## Verification & Health Auditing

### Running Tests
To run integration tests for the API, navigate to the `api` folder and execute:

```bash
# Run Auth Verification tests
bun run test:auth

# Run Asset Registry tests
bun run test:registry

# Run Idempotent Sync Layer tests
bun run test:sync
```

### Fallow Codebase Health Check
Static analysis and quality guidelines are enforced using the Fallow tool. You can run checks inside either directory:

```bash
# Run health check in api or mobile folder
bun run health
```
