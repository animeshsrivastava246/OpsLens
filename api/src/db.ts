import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  organizationId?: string;
  userId?: string;
  role?: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

const dbUrlString = process.env.DATABASE_URL || 'mysql://root:root@127.0.0.1:3307/opslens';
const dbUrl = new URL(dbUrlString);

const adapter = new PrismaMariaDb({
  host: dbUrl.hostname || '127.0.0.1',
  port: dbUrl.port ? Number(dbUrl.port) : 3307,
  user: dbUrl.username || 'root',
  password: decodeURIComponent(dbUrl.password || ''),
  database: dbUrl.pathname.replace(/^\//, '') || 'opslens',
  allowPublicKeyRetrieval: true,
});

const basePrisma = new PrismaClient({ adapter });

// Create the tenant-aware Prisma extension
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const context = tenantStorage.getStore();
        const tenantId = context?.organizationId;

        // Models that should be isolated by organizationId
        const tenantModels = ['Site', 'Asset', 'ChecklistTemplate', 'Membership', 'Incident'];

        if (tenantId) {
          const a = args as any;

          // Apply RLS filter to read operations
          if (['findFirst', 'findMany', 'findUnique', 'count', 'aggregate', 'groupBy'].includes(operation)) {
            if (tenantModels.includes(model)) {
              a.where = {
                ...a.where,
                organizationId: tenantId,
              };
            } else if (model === 'Organization') {
              a.where = {
                ...a.where,
                id: tenantId,
              };
            }
          }

          // Apply RLS filter/set tenant on write operations
          if (['create', 'createMany'].includes(operation)) {
            if (tenantModels.includes(model)) {
              if (a.data) {
                if (Array.isArray(a.data)) {
                  a.data = a.data.map((item: any) => ({
                    ...item,
                    organizationId: tenantId,
                  }));
                } else {
                  a.data.organizationId = tenantId;
                }
              }
            }
          }

          if (['update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(operation)) {
            if (tenantModels.includes(model)) {
              a.where = {
                ...a.where,
                organizationId: tenantId,
              };
            } else if (model === 'Organization') {
              a.where = {
                ...a.where,
                id: tenantId,
              };
            }
          }
        }

        return query(args);
      },
    },
  },
});
export default prisma;
