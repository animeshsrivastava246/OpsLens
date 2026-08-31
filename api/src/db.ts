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

function sanitize(obj: any): any {
  if (!obj) return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }
  if (typeof obj === 'object') {
    const copy: any = { ...obj };
    if ('passwordHash' in copy) {
      copy.passwordHash = '[REDACTED]';
    }
    return copy;
  }
  return obj;
}

async function recordAuditLog(
  action: string,
  actorId: string,
  entity: string,
  entityId: string,
  oldState: any = null,
  newState: any = null
) {
  try {
    return await basePrisma.auditLog.create({
      data: {
        action,
        actorId: actorId || 'system',
        entity,
        entityId: String(entityId || 'unknown'),
        oldState: oldState ? JSON.parse(JSON.stringify(sanitize(oldState))) : null,
        newState: newState ? JSON.parse(JSON.stringify(sanitize(newState))) : null,
      },
    });
  } catch (err: any) {
    console.warn('[AuditPipeline] Failed to record audit log:', err.message);
    return null;
  }
}

const filterOps = new Set(['findFirst', 'findMany', 'findUnique', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const writeOps = new Set(['create', 'createMany']);

function getTenantId(context: TenantContext | undefined): string | undefined {
  if (!context) return undefined;
  return context.organizationId;
}

const auditIgnoredModels = new Set(['AuditLog', 'SyncOperation']);

// Create the tenant-aware and audit-intercepting Prisma extension
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const store = tenantStorage.getStore();
        const tenantId = getTenantId(store);
        const tenantModels = ['Site', 'Asset', 'ChecklistTemplate', 'ChecklistAssignment', 'ChecklistRun', 'Membership', 'Incident', 'ActionItem', 'Notification'];

        if (tenantId) {
          const a = args as any;
          if (filterOps.has(operation)) {
            applyFilterToWhere(model, a, tenantId, tenantModels);
          } else if (writeOps.has(operation)) {
            applyWriteFilter(model, a, tenantId, tenantModels);
          }
        }

        const isMutation = writeOps.has(operation) || operation === 'update' || operation === 'updateMany' || operation === 'delete' || operation === 'deleteMany' || operation === 'upsert';

        let oldRecord: any = null;
        if (isMutation && !auditIgnoredModels.has(model)) {
          const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
          if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
            try {
              const delegate = (basePrisma as any)[delegateName];
              if (delegate?.findFirst && (args as any)?.where) {
                oldRecord = await delegate.findFirst({ where: (args as any).where });
              }
            } catch (_) {}
          }
        }

        const result = await query(args);

        if (isMutation && !auditIgnoredModels.has(model)) {
          const actorId = store?.userId || 'system';
          let actionType = operation.toUpperCase();
          let entityId = (result as any)?.id || oldRecord?.id || (args as any)?.where?.id || (args as any)?.data?.id || 'batch';
          let oldStateData = null;
          let newStateData = null;

          if (operation === 'create') {
            oldStateData = null;
            newStateData = result || (args as any)?.data;
          } else if (operation === 'createMany') {
            oldStateData = null;
            newStateData = (args as any)?.data;
          } else if (operation === 'update') {
            oldStateData = oldRecord;
            newStateData = result;
          } else if (operation === 'updateMany') {
            oldStateData = (args as any)?.where;
            newStateData = (args as any)?.data;
          } else if (operation === 'delete') {
            oldStateData = oldRecord;
            newStateData = null;
          } else if (operation === 'deleteMany') {
            oldStateData = (args as any)?.where;
            newStateData = null;
          } else if (operation === 'upsert') {
            oldStateData = oldRecord;
            newStateData = result;
          }

          recordAuditLog(
            `${model.toUpperCase()}_${actionType}`,
            actorId,
            model,
            String(entityId),
            oldStateData,
            newStateData
          ).catch(() => {});
        }

        return result;
      },
    },
  },
});
export default prisma;
