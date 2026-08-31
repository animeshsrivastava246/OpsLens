import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../db';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// GET /audit-logs - Query audit trail with filtering and pagination
router.get('/audit-logs', [authMiddleware as any], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entity, entityId, action, actorId, limit = '50', offset = '0' } = req.query;

    const where: any = {};
    if (entity) where.entity = String(entity);
    if (entityId) where.entityId = String(entityId);
    if (action) where.action = { contains: String(action) };
    if (actorId) where.actorId = String(actorId);

    const take = Math.min(Number(limit) || 50, 100);
    const skip = Number(offset) || 0;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
    ]);

    return res.json({
      total,
      limit: take,
      offset: skip,
      logs,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /audit-logs/entity/:entity/:entityId - Historical timeline for a specific entity
router.get('/audit-logs/entity/:entity/:entityId', [authMiddleware as any], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entity = String(req.params.entity);
    const entityId = String(req.params.entityId);

    const logs = await prisma.auditLog.findMany({
      where: {
        entity,
        entityId,
      },
      orderBy: { createdAt: 'asc' },
    });

    return res.json({
      entity,
      entityId,
      timelineCount: logs.length,
      history: logs,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /audit-logs/:id - Single audit log event details
router.get('/audit-logs/:id', [authMiddleware as any], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    const log = await prisma.auditLog.findUnique({
      where: { id },
    });

    if (!log) {
      return res.status(404).json({ error: 'Audit log entry not found' });
    }

    return res.json(log);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
