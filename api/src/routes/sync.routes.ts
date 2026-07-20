// fallow-ignore-file
import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth.middleware';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all sync endpoints
router.use(authMiddleware as any);

interface SyncOperationPayload {
  id: string;
  entity: string;
  operation: string;
  payload: any;
  createdAt?: string;
}

async function handleAssetCreate(id: string, payload: any, organizationId: string): Promise<any> {
  const existing = await prisma.asset.findUnique({
    where: { id },
  });

  if (existing) {
    return {
      id,
      status: 'success',
      message: 'Asset already exists (idempotent)',
    };
  }

  const site = await prisma.site.findUnique({
    where: { id: payload.siteId },
  });
  if (!site) {
    return {
      id,
      status: 'failed',
      error: 'Invalid siteId or site not authorized',
    };
  }

  const assetType = await prisma.assetType.findUnique({
    where: { id: payload.assetTypeId },
  });
  if (!assetType) {
    return {
      id,
      status: 'failed',
      error: 'Invalid assetTypeId',
    };
  }

  const newAsset = await prisma.asset.create({
    data: {
      id,
      name: payload.name,
      siteId: payload.siteId,
      assetTypeId: payload.assetTypeId,
      organizationId,
    },
  });

  return {
    id,
    status: 'success',
    data: newAsset,
  };
}

function buildUpdateData(payload: any): any {
  const data: any = {};
  if (payload.name) data.name = payload.name;
  if (payload.siteId) data.siteId = payload.siteId;
  if (payload.assetTypeId) data.assetTypeId = payload.assetTypeId;
  return data;
}

async function handleAssetUpdate(id: string, payload: any): Promise<any> {
  const existing = await prisma.asset.findUnique({
    where: { id },
  });

  if (!existing) {
    return {
      id,
      status: 'failed',
      error: 'Asset not found for update',
    };
  }

  const updatedAsset = await prisma.asset.update({
    where: { id },
    data: buildUpdateData(payload),
  });

  return {
    id,
    status: 'success',
    data: updatedAsset,
  };
}

async function handleAssetDelete(id: string): Promise<any> {
  const existing = await prisma.asset.findUnique({
    where: { id },
  });

  if (!existing) {
    return {
      id,
      status: 'success',
      message: 'Asset already deleted (idempotent)',
    };
  }

  await prisma.asset.delete({
    where: { id },
  });

  return {
    id,
    status: 'success',
    message: 'Asset successfully deleted',
  };
}

async function handleChecklistRunCreate(id: string, payload: any, organizationId: string): Promise<any> {
  const existing = await prisma.checklistRun.findUnique({
    where: { id },
  });

  if (existing) {
    return {
      id,
      status: 'success',
      message: 'Checklist run already exists (idempotent)',
    };
  }

  const template = await prisma.checklistTemplate.findUnique({
    where: { id: payload.templateId },
  });
  if (!template) {
    return {
      id,
      status: 'failed',
      error: 'Invalid templateId or template not authorized',
    };
  }

  if (payload.assetId) {
    const asset = await prisma.asset.findUnique({
      where: { id: payload.assetId },
    });
    if (!asset) {
      return {
        id,
        status: 'failed',
        error: 'Invalid assetId or asset not authorized',
      };
    }
  }

  const run = await prisma.checklistRun.create({
    data: {
      id,
      templateId: payload.templateId,
      assetId: payload.assetId || null,
      organizationId,
      status: payload.status || 'completed',
      responses: {
        create: (payload.responses || []).map((r: any) => ({
          questionId: r.questionId,
          value: String(r.value),
        })),
      },
    },
    include: {
      responses: true,
    },
  });

  return {
    id,
    status: 'success',
    data: run,
  };
}

async function handleIncidentCreate(id: string, payload: any, organizationId: string): Promise<any> {
  const existing = await prisma.incident.findUnique({
    where: { id },
  });

  if (existing) {
    return {
      id,
      status: 'success',
      message: 'Incident already exists (idempotent)',
    };
  }

  if (payload.assetId) {
    const asset = await prisma.asset.findUnique({
      where: { id: payload.assetId },
    });
    if (!asset) {
      return {
        id,
        status: 'failed',
        error: 'Invalid assetId or asset not authorized',
      };
    }
  }

  const item = await prisma.incident.create({
    data: {
      id,
      title: payload.title,
      description: payload.description,
      severity: payload.severity || 'medium',
      organizationId,
      assetId: payload.assetId || null,
      attachments: payload.attachments ? {
        create: payload.attachments.map((att: any) => ({
          id: att.id || undefined,
          url: att.url,
        })),
      } : undefined,
    },
    include: {
      attachments: true,
    },
  });

  return {
    id,
    status: 'success',
    data: item,
  };
}

function hasAnyFalsy(values: any[]): boolean {
  for (const v of values) {
    if (!v) return true;
  }
  return false;
}

function validateOp(op: SyncOperationPayload): string | null {
  if (hasAnyFalsy([op.id, op.entity, op.operation, op.payload])) {
    return 'Missing required fields';
  }
  if (!['asset', 'checklist-run', 'incident'].includes(op.entity)) {
    return `Unsupported entity: ${op.entity}`;
  }
  return null;
}

async function processSyncOperation(op: SyncOperationPayload, organizationId: string): Promise<any> {
  const { id, entity, operation, payload } = op;
  const validationError = validateOp(op);
  if (validationError) {
    return { id: id || 'unknown', status: 'failed', error: validationError };
  }

  if (entity === 'asset') {
    const handlers: Record<string, () => Promise<any>> = {
      create: () => handleAssetCreate(id, payload, organizationId),
      update: () => handleAssetUpdate(id, payload),
      delete: () => handleAssetDelete(id),
    };

    const handler = handlers[operation];
    if (handler) {
      return handler();
    }
  } else if (entity === 'checklist-run') {
    if (operation === 'create') {
      return handleChecklistRunCreate(id, payload, organizationId);
    }
  } else if (entity === 'incident') {
    if (operation === 'create') {
      return handleIncidentCreate(id, payload, organizationId);
    }
  }

  return {
    id,
    status: 'failed',
    error: `Unsupported operation: ${operation} on entity: ${entity}`,
  };
}

async function processSingleBatchOp(op: SyncOperationPayload, organizationId: string): Promise<any> {
  try {
    return await processSyncOperation(op, organizationId);
  } catch (err: any) {
    return {
      id: op.id || 'unknown',
      status: 'failed',
      error: err.message || 'Unknown database error',
    };
  }
}

async function processBatchOperations(operations: SyncOperationPayload[], organizationId: string): Promise<{ results: any[]; processedCount: number }> {
  const results: any[] = [];
  for (const op of operations) {
    results.push(await processSingleBatchOp(op, organizationId));
  }
  const processedCount = results.filter(r => r.status === 'success').length;
  return { results, processedCount };
}

function isOpSuccessful(results: any[], opId: string): boolean {
  const found = results.find(r => r.id === opId);
  if (!found) {
    return false;
  }
  return found.status === 'success';
}

async function logSyncHistory(operations: SyncOperationPayload[], results: any[]) {
  try {
    for (const op of operations) {
      if (isOpSuccessful(results, op.id)) {
        await prisma.syncOperation.create({
          data: {
            entity: op.entity,
            operation: op.operation,
            payload: op.payload,
          },
        });
      }
    }
  } catch (err) {
    console.error('Failed to log sync operations:', err);
  }
}

// POST /sync/batch - Batch reconcile offline mutations
router.post('/sync/batch', async (req: AuthenticatedRequest, res: Response) => {
  const { operations } = req.body;

  if (!Array.isArray(operations)) {
    return res.status(400).json({ error: 'Operations array is required' });
  }

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { results, processedCount } = await processBatchOperations(operations, req.user.organizationId);
  await logSyncHistory(operations, results);

  return res.json({
    success: true,
    processedCount,
    results,
  });
});

export default router;
