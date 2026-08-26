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

function applyFilterToWhere(model: string, a: any, tenantId: string, tenantModels: string[]) {
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

function applyWriteFilter(model: string, a: any, tenantId: string, tenantModels: string[]) {
  if (!tenantModels.includes(model) || !a.data) {
    return;
  }
  if (Array.isArray(a.data)) {
    a.data = a.data.map((item: any) => ({
      ...item,
      organizationId: tenantId,
    }));
  } else {
    a.data.organizationId = tenantId;
  }
}

const filterOps = new Set(['findFirst', 'findMany', 'findUnique', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const writeOps = new Set(['create', 'createMany']);

function getTenantId(context: TenantContext | undefined): string | undefined {
  if (!context) return undefined;
  return context.organizationId;
}

// Create the tenant-aware Prisma extension
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const tenantId = getTenantId(tenantStorage.getStore());
        const tenantModels = ['Site', 'Asset', 'ChecklistTemplate', 'ChecklistAssignment', 'ChecklistRun', 'Membership', 'Incident', 'ActionItem'];

        if (tenantId) {
          const a = args as any;
          if (filterOps.has(operation)) {
            applyFilterToWhere(model, a, tenantId, tenantModels);
          } else if (writeOps.has(operation)) {
            applyWriteFilter(model, a, tenantId, tenantModels);
          }
        }

        return query(args);
      },
    },
  },
});
export default prisma;
