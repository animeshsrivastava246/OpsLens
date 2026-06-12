# OpsLens API Server

The OpsLens API Server provides multi-tenant transaction processing, authorization guards, and relational persistence for the OpsLens platform. Built on Express 5.x and integrated with MySQL 8.4 via Prisma ORM, it utilizes AsyncLocalStorage to establish request-scoped context tracking for tenancy enforcement.

## Technical Architecture

### Directory Structure
```
api/
├── prisma/
│   ├── schema.prisma       # Database schema definition
│   └── seed.ts             # Seeding script for tenants, roles, and schema metadata
├── src/
│   ├── db.ts               # Prisma Client initialization and Custom Tenancy Extension
│   ├── index.ts            # Application entrypoint and middleware configuration
│   ├── middleware/
│   │   ├── auth.middleware.ts   # JWT validation and request-scoped identity injection
│   │   └── tenant.middleware.ts # AsyncLocalStorage context instantiation
│   └── routes/
│       └── auth.routes.ts       # Endpoint handlers for login, refresh, logout, and identity
```

### Request Lifecycle and Database-Level Multitenancy
Every incoming HTTP request undergoes database-level multi-tenancy enforcement.

1.  **Context Instantiation (`tenant.middleware.ts`)**: Initializes a new request-scoped context using Node.js `AsyncLocalStorage`. It reads the `x-tenant-id` header (if present) to populate the context container.
2.  **Authentication (`auth.middleware.ts`)**: Decodes and verifies the Authorization Bearer JWT. On success, it binds the authenticated user identity (User ID, Email, Role, Organization ID) to the request object and updates the `AsyncLocalStorage` store with the verified tenant ID (`organizationId`).
3.  **ORM Query Interception (`db.ts`)**: A custom Prisma client extension intercepts queries. For models designated as tenant-isolated (`Site`, `Asset`, `ChecklistTemplate`, `Membership`, `Incident`), it dynamically injects an `organizationId` filter matching the context storage:
    *   **Read Operations (`findMany`, `findFirst`, etc.)**: Appends `organizationId: tenantId` to the `where` query parameters.
    *   **Create Operations (`create`, `createMany`)**: Appends or maps the `organizationId` field within the write payload.
    *   **Mutations (`update`, `delete`, etc.)**: Restricts mutation targets with `organizationId: tenantId` constraints.

This architectural pattern guarantees that developers cannot accidentally retrieve or modify cross-tenant records, as isolation logic runs implicitly inside the ORM queries.

## Environment Configuration

Configure a `.env` file inside the `api` root directory:

```env
PORT=3000
DATABASE_URL="mysql://root:root@127.0.0.1:3306/opslens"
JWT_SECRET="your-secure-jwt-signing-secret"
```

## Running the API

### 1. Install Dependencies
```bash
bun install
```

### 2. Database Migrations
Create and run database migrations using Prisma:
```bash
bun prisma migrate dev
```

### 3. Database Seeding
Seed the database with default organizations, roles, assets, and users:
```bash
bun prisma db seed
```

### 4. Start Development Server
```bash
bun run index.ts
```

## API Endpoints

### Authentication
*   `POST /auth/login`: Authenticate credentials, returning JWT and tenant attributes.
*   `POST /auth/refresh`: Issue replacement JWT using an unexpired token payload.
*   `POST /auth/logout`: Terminate access session.
*   `GET /me`: Return active user identity and tenant bindings.

### Testing and Verification Routing
*   `GET /test/tenant-isolation`: Retrieve list of assets under the request context (validates automatic tenant-filtering execution).
*   `GET /test/admin-only`: Guarded endpoint requiring active `site-admin` privileges.
