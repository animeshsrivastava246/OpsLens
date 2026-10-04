# OpsLens API Server

The OpsLens API Server provides multi-tenant transaction processing, authorization guards, background job scheduling, and relational persistence. Built on Express 5.2.1 and integrated with MySQL 8.4 via Prisma ORM 7.8, it uses Node.js `AsyncLocalStorage` to enforce strict tenant isolation across all database operations.

---

## Technical Stack

*   **Runtime**: Node.js 24.16.0 LTS
*   **Package Manager**: Bun 1.1+
*   **Framework**: Express 5.2.1
*   **Database**: MySQL / MariaDB 8.4 LTS (Port 3307)
*   **ORM**: Prisma 7.8.0 with custom client extensions
*   **Job Queue**: BullMQ 6.3 with Redis 6.0+
*   **Reporting**: PDFKit 0.20.2 for streaming PDF exports
*   **Security**: Helmet, CORS, bcryptjs, JSON Web Tokens (JWT)

---

## Architecture & Directory Layout

```
api/
├── prisma/
│   ├── schema.prisma             # MySQL database schema definition
│   └── seed.ts                   # Seeding script for tenants, roles, users & assets
├── src/
│   ├── config/
│   │   └── redis.config.ts       # Redis client & connection configuration
│   ├── db.ts                     # Prisma Client with automatic Tenant Isolation extension
│   ├── index.ts                  # Server entrypoint and router registration
│   ├── middleware/
│   │   ├── auth.middleware.ts    # JWT verification and role-based access control
│   │   └── tenant.middleware.ts  # AsyncLocalStorage request context manager
│   ├── queues/
│   │   ├── notification.queue.ts # BullMQ queue for user notifications
│   │   └── sla.queue.ts          # BullMQ queue for SLA monitoring
│   ├── routes/
│   │   ├── action-item.routes.ts # Corrective actions, comments, and status transitions
│   │   ├── asset.routes.ts       # Sites, asset types, QR scanner resolver, asset CRUD
│   │   ├── audit.routes.ts       # Immutable audit log queries and entity diffs
│   │   ├── auth.routes.ts        # Authentication (login, refresh, logout, me)
│   │   ├── checklist.routes.ts   # Dynamic JSON schema templates, assignments & runs
│   │   ├── incident.routes.ts    # Incident reporting, media upload, assignments
│   │   ├── notification.routes.ts# In-app notifications & manual escalation scan
│   │   ├── report.routes.ts      # Compliance scorecards, incident stats & PDF exports
│   │   └── sync.routes.ts        # Idempotent offline batch sync endpoint
│   ├── utils/
│   │   └── response.util.ts      # Standardized API response formatters
│   ├── workers/
│   │   ├── notification.worker.ts# Notification queue consumer
│   │   └── sla.worker.ts         # Overdue SLA scanner and escalation trigger
│   └── test-*.ts                 # Automated test suite scripts
├── .env                          # Local environment variables
└── package.json                  # Scripts and dependencies
```

---

## Core Architecture Patterns

### 1. Database-Level Multi-Tenancy
1.  **Context Instantiation (`tenant.middleware.ts`)**: Initializes request-scoped context using Node.js `AsyncLocalStorage`.
2.  **Authentication (`auth.middleware.ts`)**: Verifies JWT bearer token, binds user identity (`userId`, `role`, `organizationId`) to the request, and populates the store.
3.  **ORM Query Interception (`db.ts`)**: Custom Prisma client extension intercepts queries. For tenant-scoped models (`Site`, `Asset`, `ChecklistTemplate`, `Membership`, `Incident`, `ActionItem`, `Notification`), it injects `organizationId: tenantId`:
    *   **Reads (`findMany`, `findFirst`)**: Appends tenant filter to `where` conditions.
    *   **Creates (`create`, `createMany`)**: Automatically sets `organizationId`.
    *   **Mutations (`update`, `delete`)**: Restricts targets to caller's organization.

### 2. Idempotent Offline Sync (`/sync/batch`)
The sync router processes client mutation queues transactionally:
*   Entities utilize client-side UUID primary keys.
*   The handler verifies prior existence; existing keys return successful idempotency acknowledgments without data corruption.

### 3. Background Escalation Engine (BullMQ + Redis)
*   Monitors action item due dates against SLA thresholds.
*   Automatically flags overdue items and dispatches alerts to supervisors via `Notification` records.

---

## API Endpoints

### Auth (`auth.routes.ts`)
*   `POST /auth/login`: Authenticate credentials, return JWT with role & tenant.
*   `POST /auth/refresh`: Issue replacement JWT from valid token.
*   `POST /auth/logout`: Invalidate session.
*   `GET /me`: Return current user profile and organization membership.

### Assets & Sites (`asset.routes.ts`)
*   `GET /sites`: List organization sites.
*   `GET /asset-types`: List asset categories.
*   `GET /assets`: List assets with filtering.
*   `GET /assets/:assetId`: Get single asset record with inspection history.
*   `GET /assets/scan/:code`: Resolve asset from QR or barcode code.
*   `POST /assets`: Create new asset (`site-admin`, `compliance-manager`, `supervisor`).
*   `PATCH /assets/:assetId`: Modify asset record.
*   `DELETE /assets/:assetId`: Remove asset from registry (`site-admin`, `compliance-manager`).

### Sync (`sync.routes.ts`)
*   `POST /sync/batch`: Batch process queued offline operations (assets, checklists, incidents, actions).

### Checklists (`checklist.routes.ts`)
*   `GET /checklist-templates`: List JSON Schema templates.
*   `POST /checklist-templates`: Create new template (`site-admin`, `compliance-manager`).
*   `PATCH /checklist-templates/:id`: Update template schema.
*   `GET /checklist-assignments`: View template-to-asset-type assignments.
*   `POST /checklist-assignments`: Assign template to asset type.
*   `GET /my/checklist-runs`: View user's inspection runs.
*   `POST /checklist-runs`: Create new run (draft or completed).
*   `POST /checklist-runs/:id/submit`: Validate responses and finalize inspection.

### Incidents (`incident.routes.ts`)
*   `POST /media/upload`: Upload raw image binary (up to 10MB).
*   `GET /incidents`: List incidents with severity filters.
*   `GET /incidents/:id`: Get incident details, media attachments, and corrective actions.
*   `POST /incidents`: Report new incident.
*   `POST /incidents/:id/assign`: Assign incident to supervisor or worker.

### Corrective Actions (`action-item.routes.ts`)
*   `GET /action-items`: List action items (filterable by status and priority).
*   `GET /action-items/:id`: View single action item with comment history.
*   `POST /action-items`: Create standalone action item.
*   `PATCH /action-items/:id`: Update status, priority, or due date.
*   `POST /action-items/:id/comments`: Add comment.
*   `POST /action-items/:id/complete`: Complete action item with resolution notes.

### Notifications & Escalations (`notification.routes.ts`)
*   `GET /notifications`: Retrieve unread and read alerts.
*   `POST /notifications/:id/read`: Mark notification as read.
*   `POST /escalations/scan`: Trigger immediate scan for overdue action items.

### Audit Trail (`audit.routes.ts`)
*   `GET /audit-logs`: List recent immutable audit entries.
*   `GET /audit-logs/:id`: Get single audit record.
*   `GET /audit-logs/entity/:entity/:entityId`: Retrieve chronological change diffs for an entity.

### Reports & PDF Exports (`report.routes.ts`)
*   `GET /reports/compliance-summary`: Organization compliance score, asset & inspection stats.
*   `GET /reports/incidents`: Incident distribution across severities.
*   `GET /reports/sla`: SLA compliance rates and overdue metrics.
*   `GET /reports/export/compliance-pdf`: Download compliance summary PDF.
*   `GET /reports/incidents/:id/export/pdf`: Download incident evidence dossier PDF.

---

## Environment Setup

Create `.env` inside `api/`:
```env
PORT=3000
DATABASE_URL="mysql://root:root@127.0.0.1:3307/opslens"
JWT_SECRET="opslens-secure-jwt-secret-key-2026"
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379
```

---

## Execution & Testing

### Installation & Migrations
```bash
bun install
bun x prisma migrate dev
bun x prisma db seed
```

### Run Server
```bash
bun run dev
```

### Automated Tests
```bash
bun run test:auth
bun run test:registry
bun run test:sync
bun run test:checklists
bun run test:sync-checklist
bun run test:incidents
bun run test:sync-incident
bun run test:actions
bun run test:sync-actions
bun run test:escalation
bun run test:audit
bun run test:reports
```
