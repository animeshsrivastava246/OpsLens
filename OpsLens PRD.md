# OpsLens PRD

## Overview

OpsLens is a mobile-first field intelligence and compliance platform for factories, hospitals, warehouses, campuses, and distributed operations teams. The product helps field workers capture inspections, incidents, audits, maintenance observations, and compliance evidence with an offline-capable React Native app, while supervisors and administrators manage workflows, escalations, analytics, and audit history through operational dashboards.

The product is designed on a modern 2026 stack baseline: Expo SDK 56 with React Native 0.85 and React 19.2 on the mobile side, Express 5.2.1 for API services, and MySQL 8.4 LTS for transactional persistence and long-term operational reporting.

## Product vision

The vision is to replace paper forms, spreadsheets, chat messages, and fragmented legacy systems used in field compliance and inspection workflows with a single operational system of record. The system should let a user scan an asset, room, ward, vehicle, station, or checklist code and immediately perform the exact workflow required for that context, even when the network is unreliable.

OpsLens is positioned as infrastructure software for operational truth. The core value is not task management alone, but trustworthy evidence capture, structured remediation, and auditable execution across physical environments.

## Problem statement

Many organizations still run inspections and incident reporting through unstructured tools, which creates poor traceability, delayed escalations, missing evidence, inconsistent checklist completion, and weak compliance reporting. These issues are especially severe in environments such as hospitals, industrial plants, warehouses, transport depots, and campuses where events happen in the field, often under poor connectivity conditions.

Most existing general-purpose mobile apps do not combine offline data capture, role-aware workflows, asset-linked history, evidence attachments, and compliance-grade audit trails in one system. This creates operational blind spots and weakens both response times and audit readiness.

## Goals

- Enable field users to complete inspections, incidents, and corrective actions from a mobile device with or without connectivity.
- Create a tamper-evident operational record for assets, spaces, and incidents.
- Reduce time from issue detection to assignment and closure.
- Improve audit readiness by centralizing evidence, timestamps, status changes, and approvals.
- Surface recurring failures, non-compliance hotspots, and SLA breaches to supervisors and administrators.
- Support enterprise deployment across multiple organizations, sites, and departments.


## Non-goals

- Full ERP replacement.
- Full CMMS replacement in v1, though maintenance integrations are in scope later.
- Public consumer marketplace or ecommerce functionality.
- Desktop-first workflows; mobile is the primary operating surface for field execution.


## Personas

### Field inspector

Works on site and completes audits, checklists, and inspections. This user needs fast input flows, camera capture, offline access, QR-linked workflows, and very low interaction friction.

### Supervisor

Oversees teams, reviews critical incidents, assigns corrective actions, approves closures, and monitors SLA compliance. This user needs queue views, escalation alerts, trend dashboards, and full evidence history.

### Compliance manager

Defines checklists, policies, severity matrices, approval rules, and reporting standards. This user needs audit exports, compliance scorecards, evidence retrieval, and configuration controls.

### Site admin

Manages users, roles, assets, tags, organizational structure, and integration settings. This user needs tenant-level controls, access management, and configuration reliability.

## Primary use cases

- Factory safety walk-throughs and machine inspections.
- Hospital equipment rounds, biomedical checks, sanitation audits, and ward incident reporting.
- Warehouse cold-storage inspections, dock audits, and facility readiness checks.
- Fleet pre-trip and post-trip vehicle inspections.
- School and campus facility inspections.
- Contractor compliance verification and site access checks.

These use cases map well to an asset-linked, evidence-heavy mobile workflow model and benefit from relational lifecycle tracking over time.

## Product principles

- Offline first, sync later.
- Evidence before opinion.
- Fastest path for repetitive field work.
- Every state change must be attributable and auditable.
- Configuration-driven workflows over hardcoded forms.
- Role-based access across every feature.
- Mobile UX should prioritize low cognitive load, large tap targets, and scan-first interactions.


## Scope

### In scope for v1

- Multi-tenant organizations and sites.
- User roles and permissions.
- Asset and location registry.
- QR and barcode scanning for context launch.
- Dynamic inspection and audit checklists.
- Incident reporting with photo, audio, and text evidence.
- Corrective action assignment and escalation.
- Offline local storage and background sync.
- Push notifications for priority events.
- Supervisor dashboards and audit exports.
- Immutable audit trail of all operational changes.


### Out of scope for v1

- Predictive maintenance modeling.
- Live IoT telemetry ingestion at scale.
- Native biometric attendance features.
- Complex procurement and vendor billing.
- Full workflow builder UI for arbitrary BPMN.


## Functional requirements

### 1. Authentication and access

The system must support secure sign-in, tenant-aware membership, refresh-token based sessions, device registration, and role-based authorization. It must support at least field worker, supervisor, compliance manager, and site admin roles in v1.

### 2. Organization model

The platform must support multiple organizations, each with sites, zones, departments, assets, users, and policies. Data isolation must be enforced at the tenant boundary.

### 3. Asset and location registry

The system must store physical entities such as equipment, rooms, stations, vehicles, checkpoints, or storage units. Each entity should support tags, hierarchy, QR code linkage, history timeline, checklist assignment, and incident association.

### 4. Dynamic checklist engine

Admins and compliance managers must be able to define reusable templates composed of sections, questions, response types, validations, mandatory evidence rules, severity mappings, and pass/fail logic. A checklist should be assignable to an asset type, location type, department, or policy group.

### 5. Inspection execution

Field users must be able to open a checklist from scan, search, schedule, or assignment and complete it efficiently. Responses should support text, numbers, booleans, multiple choice, photo attachment, audio note, signature, and optional geolocation/time metadata.

### 6. Incident reporting

Users must be able to report an issue outside a checklist flow, attach evidence, classify severity, select impacted asset or location, and submit it into the workflow engine. Critical incidents must trigger alerts and escalation logic immediately.

### 7. Corrective action workflow

The platform must create tasks or actions from failed checks and incidents, assign owners, set due dates, route approvals, track status changes, and support comments with attachments. Escalation rules should be configurable based on severity and SLA thresholds.

### 8. Offline-first sync

The mobile app must allow users to read assigned forms, recent assets, and open tasks while offline and queue writes locally. When connectivity returns, the app must synchronize data using idempotent operations, conflict detection, retry policies, and attachment upload resumption.

### 9. Notifications

The system must send push notifications for assignment, escalation, overdue actions, critical incidents, approval requests, and sync failures that need user intervention. Expo SDK 56 continues to support production app development through development builds rather than Expo Go, which is important for real push-notification and native workflow testing.

### 10. Reporting and analytics

Supervisors and managers must see inspection completion rates, open incidents by severity, SLA breach counts, recurring issue trends, compliance scores, and top-risk assets or locations. Data should be filterable by organization, site, department, date range, severity, and checklist type.

### 11. Audit log

Every create, update, submit, approve, reject, assign, close, or reopen action must generate an append-only audit record with actor, role, time, entity type, entity id, old state, new state, and metadata. The audit log is a core product capability, not a debug feature.

### 12. Export and evidence vault

The system must generate PDF/CSV-ready exports later, but the product data model must already support evidence retrieval by checklist, incident, asset, site, and date range. Evidence objects should have integrity metadata and access control.

## Non-functional requirements

### Reliability

The product must remain usable under poor connectivity, temporary backend failure, and partial attachment upload failure. Sync operations must be resumable and safe to retry.

### Performance

Common actions such as opening an assigned checklist, scanning a code, saving a response, and submitting an incident should feel near-instant on a mid-range Android device. Expo SDK 56 includes Hermes v1 by default and multiple runtime improvements that improve startup and performance characteristics for production mobile apps.

### Security

All APIs must require authenticated access except limited bootstrap endpoints. Attachments must use signed URLs or equivalent secure access patterns. The platform must support auditability, tenant isolation, and least-privilege authorization.

### Scalability

The backend must support multi-tenant growth, background jobs, bursty notification traffic, and growing volumes of attachments and audit records. Express remains on a supported 5.x line, and MySQL 8.4 is appropriate for relational transactional workloads and long-lived operational history.

### Observability

The system should include structured logging, error tracking, metrics, and tracing for sync failures, queue latency, job retries, notification delivery, and API latency. Operational software without observability creates silent compliance gaps.

## User journeys

### Asset inspection flow

1. User scans QR code on an asset.
2. Mobile app resolves asset context from local cache or server.
3. App displays pending checklist, latest status, open issues, and last inspection summary.
4. User completes checklist, attaches evidence, and submits.
5. Failed answers generate corrective actions automatically.
6. Supervisor receives notification if severity or policy threshold is met.

### Incident flow

1. User taps “Report incident.”
2. User selects location or asset, severity, and issue category.
3. User adds photo, audio, text, and optional signature.
4. App stores locally if offline or submits immediately if online.
5. Backend creates incident, routes to owner, logs audit event, and triggers notifications.
6. Resolution is tracked until closure and sign-off.

## Success metrics

### Business metrics

- Number of active sites.
- Weekly active field users.
- Monthly inspections completed.
- Monthly incidents reported and closed.
- Audit export usage.
- Tenant retention and expansion.


### Product metrics

- Median inspection completion time.
- Sync success rate.
- Offline submission success rate.
- Time from incident creation to first assignment.
- Overdue action rate.
- Attachment upload success rate.
- SLA breach rate.


### Quality metrics

- Crash-free sessions.
- Failed sync retries per 1,000 operations.
- API p95 latency.
- Duplicate incident rate.
- Data conflict rate during offline reconciliation.


## Technical baseline

### Mobile

- Expo SDK 56
- React Native 0.85
- React 19.2
- TypeScript 6.0.3 in current Expo project templates
- Hermes v1 default runtime
- Development builds for production-oriented development; Expo Go is not the recommended path for shipping-grade apps and Expo Go for SDK 56 is not available in the public app stores at the time of the SDK 56 release.


### Backend

- Node.js 22 or later is required by React Native 0.85 toolchain expectations, and using Node 24.16.0 LTS is a practical backend and tooling baseline in 2026.
- Express 5.2.1 on the active supported Express 5 line.
- MySQL 8.4 LTS.
- Redis for queues and caching.
- BullMQ for reminders, escalations, retries, and report jobs.
- Prisma as ORM for schema safety and migrations.


## Recommended architecture

| Layer | Recommended choice | Rationale |
| :-- | :-- | :-- |
| Mobile app | Expo SDK 56 + React Native 0.85 + TypeScript | Modern production mobile baseline |
| Local persistence | expo-sqlite + file-system | Offline forms, queue, attachments metadata |
| Navigation | Expo Router | File-based routing aligned with Expo |
| UI | Expo UI where stable primitives fit, plus carefully chosen RN components | Native-feeling UI primitives in SDK 56 |
| API | Node.js + Express 5.2.1 | Mature service layer |
| Database | MySQL 8.4 | Strong relational model for inspections and audit trail |
| Queue/cache | Redis + BullMQ | Async workflows and reminders |
| File storage | S3-compatible storage | Evidence attachment storage |
| Realtime | Socket.IO or SSE | Live queue and escalation updates |
| Search | Meilisearch or OpenSearch | Asset, incident, and checklist retrieval |
| Auth | JWT + refresh tokens + RBAC | Tenant-aware access control |
| Observability | OpenTelemetry + Sentry + logs | Production diagnostics |

## Data model

### Core entities

- Organization
- Site
- Zone
- Department
- User
- Role
- Membership
- Asset
- AssetType
- ChecklistTemplate
- ChecklistAssignment
- ChecklistRun
- ChecklistResponse
- Incident
- ActionItem
- Comment
- Attachment
- Notification
- AuditLog
- SyncOperation
- PolicyRule
- SeverityMatrix


### High-level relationships

- One organization has many sites, users, assets, incidents, and checklist templates.
- One site has many zones and assets.
- One asset can have many checklist runs and incidents.
- One checklist template can create many checklist assignments and runs.
- One incident can create many action items and attachments.
- Every meaningful entity can emit audit log records.


## API surface

### Auth

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /me`


### Organizations and sites

- `GET /orgs/:orgId`
- `GET /orgs/:orgId/sites`
- `GET /sites/:siteId/assets`
- `GET /sites/:siteId/dashboard`


### Assets

- `GET /assets/:assetId`
- `GET /assets/scan/:code`
- `POST /assets`
- `PATCH /assets/:assetId`
- `GET /assets/:assetId/history`


### Checklists

- `GET /checklist-templates`
- `POST /checklist-templates`
- `PATCH /checklist-templates/:id`
- `POST /checklist-assignments`
- `GET /my/checklist-runs`
- `POST /checklist-runs`
- `POST /checklist-runs/:id/submit`


### Incidents

- `GET /incidents`
- `POST /incidents`
- `GET /incidents/:id`
- `PATCH /incidents/:id`
- `POST /incidents/:id/assign`
- `POST /incidents/:id/close`


### Corrective actions

- `GET /action-items`
- `POST /action-items`
- `PATCH /action-items/:id`
- `POST /action-items/:id/comment`
- `POST /action-items/:id/complete`


### Attachments and sync

- `POST /attachments/presign`
- `POST /sync/batch`
- `GET /sync/status`
- `POST /devices/register`


### Reporting

- `GET /reports/compliance-summary`
- `GET /reports/incidents`
- `GET /reports/sla`
- `GET /audit-logs`


## Mobile app modules

- Authentication and tenant selection.
- Home dashboard.
- Scan and resolve context.
- Assigned inspections.
- Incident reporting.
- Action items and approvals.
- Asset history.
- Notifications.
- Offline queue and sync center.
- Profile and device settings.


## Admin and supervisor modules

- Organization and site setup.
- User and role administration.
- Asset registry management.
- Checklist builder and assignment rules.
- Severity and SLA configuration.
- Incident triage queue.
- Approval workflows.
- Analytics dashboards.
- Audit log explorer.
- Export center.


## Mobile UX requirements

The primary interaction model should be scan-first and list-second. Key field actions should be reachable within one or two taps from the home screen, and the app should maintain strong feedback around draft saving, sync state, queued uploads, and overdue actions.

Expo SDK 56 adds several capabilities relevant to this product direction, including stable Expo UI primitives, stronger file-system transfer APIs, stable modern Calendar, Contacts, and MediaLibrary APIs, and broader improvements in CLI and runtime behavior. Not all of those APIs are mandatory for v1, but they make the platform baseline more future-proof.

## Sync strategy

The mobile app should maintain a local SQLite-backed store for cached assets, templates, assignments, pending actions, and queued mutations. Expo SDK 56 continues to improve `expo-sqlite` and `expo-file-system`, including ArrayBuffer support for SQLite blobs and more capable upload/download task APIs, which are useful for attachment-heavy offline workflows.

Recommended sync behavior:

- Use client-generated UUIDs for offline-created records.
- Store mutation log entries locally with retry metadata.
- Upload metadata first, file second.
- Use idempotency keys on write endpoints.
- Use server timestamps as the source of truth after reconciliation.
- Expose conflict states explicitly when two users modify the same workflow artifact.


## Security and compliance requirements

- Tenant isolation on every query.
- RBAC and permission-based endpoint guards.
- Attachment access through signed URLs or equivalent secure broker.
- Device-aware sessions and forced logout support.
- Full auditability of workflow and approval changes.
- Data retention policies configurable by tenant.
- PII minimization where possible.
- Encryption in transit and at rest in managed infrastructure.


## Risks and mitigations

| Risk | Impact | Mitigation |
| :-- | :-- | :-- |
| Offline sync conflicts | Data inconsistency | Idempotent APIs, versioning, conflict resolution UI |
| Large attachment uploads on poor networks | User frustration and failed evidence capture | Background upload tasks, resumable uploads, progress state |
| Over-configurable checklist engine | Slow delivery and admin complexity | Ship opinionated v1 templates and limited response types first |
| Weak adoption by field staff | Low usage | Scan-first UX, minimal taps, draft auto-save, offline confidence |
| Audit trail gaps | Trust and compliance failure | Append-only audit log with actor and state snapshot |
| Expo upgrade drift | Build instability | Pin SDK 56-compatible packages and run Expo Doctor during CI |

## Release plan

### Phase 1: Foundation

- Auth, tenancy, roles.
- Asset registry.
- Basic checklist execution.
- Incident creation.
- Offline local store.
- Attachment capture.


### Phase 2: Workflow and operations

- Corrective actions.
- Escalation engine.
- Push notifications.
- Supervisor queue.
- Reporting basics.


### Phase 3: Enterprise readiness

- Advanced analytics.
- Approval chains.
- Export center.
- SSO and SCIM later.
- Integration hooks for CMMS, ERP, and ticketing systems.


## Acceptance criteria for v1

- A field user can sign in, open assigned work, complete an inspection, add evidence, and submit successfully while offline, then sync later.
- A supervisor can receive a critical incident alert, review evidence, assign corrective action, and track closure.
- A compliance manager can define a checklist template and retrieve an auditable history of submissions.
- A site admin can onboard assets, users, and locations without developer intervention.
- All major workflow state changes create visible audit records.
- The system works on current Expo SDK 56-compatible mobile builds and supported Express/MySQL versions.


## Suggested KPIs for first 90 days after launch

- 80% or higher weekly active rate among onboarded field staff.
- 95% or higher sync success rate.
- Under 10 minutes median time from critical incident submission to supervisor acknowledgment.
- 30% reduction in overdue corrective actions versus prior process baseline.
- 90% or higher checklist completion rate for scheduled inspections.


## Version recommendations summary

| Area | Recommended version |
| :-- | :-- |
| Expo | SDK 56 |
| React Native | 0.85 |
| React | 19.2 |
| TypeScript | 6.0.3 |
| Express | 5.2.1 |
| MySQL | 8.4 LTS |
| Node.js | 24.16.0 LTS |
