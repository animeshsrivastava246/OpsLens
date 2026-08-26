// fallow-ignore-file
import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth.middleware';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all action item endpoints
router.use(authMiddleware as any);

export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'closed', 'cancelled'],
  in_progress: ['resolved', 'open', 'closed', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: ['in_progress'],
  cancelled: ['open'],
};

export function isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
  if (currentStatus === newStatus) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(newStatus) : false;
}

// GET /action-items - List action items for organization
router.get('/action-items', async (req: AuthenticatedRequest, res: Response) => {
  const { status, priority, incidentId, assigneeId, my } = req.query;

  try {
    const where: any = {};

    if (status) where.status = status as string;
    if (priority) where.priority = priority as string;
    if (incidentId) where.incidentId = incidentId as string;
    
    if (my === 'true' && req.user?.userId) {
      where.assigneeId = req.user.userId;
    } else if (assigneeId) {
      where.assigneeId = assigneeId as string;
    }

    const items = await prisma.actionItem.findMany({
      where,
      include: {
        incident: true,
        assignee: {
          select: { id: true, name: true, email: true },
        },
        comments: {
          include: {
            author: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(items);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /action-items/:id - Get action item detail
router.get('/action-items/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const item = await prisma.actionItem.findFirst({
      where: { id: id as string },
      include: {
        incident: true,
        assignee: {
          select: { id: true, name: true, email: true },
        },
        comments: {
          include: {
            author: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'Action item not found or unauthorized' });
    }

    return res.json(item);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /action-items - Create action item manually
router.post('/action-items', async (req: AuthenticatedRequest, res: Response) => {
  const { id, title, description, priority, incidentId, assigneeId, dueDate } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const organizationId = req.user!.organizationId;

    if (incidentId) {
      const incident = await prisma.incident.findFirst({
        where: { id: incidentId },
      });
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found or unauthorized' });
      }
    }

    if (assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
      });
      if (!assignee) {
        return res.status(404).json({ error: 'Assignee user not found' });
      }
    }

    const item = await prisma.actionItem.create({
      data: {
        id: id || undefined,
        title,
        description: description || null,
        status: 'open',
        priority: priority || 'medium',
        organizationId,
        incidentId: incidentId || null,
        assigneeId: assigneeId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: {
        incident: true,
        assignee: { select: { id: true, name: true, email: true } },
        comments: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'ACTION_ITEM_CREATE',
        actorId: req.user!.userId,
        entity: 'ActionItem',
        entityId: item.id,
        newState: { id: item.id, title: item.title, status: item.status, priority: item.priority },
      },
    });

    return res.status(201).json(item);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /action-items/:id - Update action item / status transition
router.patch('/action-items/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { title, description, status, priority, assigneeId, dueDate } = req.body;

  try {
    const existing = await prisma.actionItem.findFirst({
      where: { id: id as string },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Action item not found or unauthorized' });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

    if (status !== undefined && status !== existing.status) {
      if (!isValidStatusTransition(existing.status, status)) {
        return res.status(400).json({
          error: `Invalid status transition from '${existing.status}' to '${status}'`,
        });
      }
      updateData.status = status;
    }

    const updated = await prisma.actionItem.update({
      where: { id: id as string },
      data: updateData,
      include: {
        incident: true,
        assignee: { select: { id: true, name: true, email: true } },
        comments: true,
      },
    });

    if (status !== undefined && status !== existing.status) {
      await prisma.auditLog.create({
        data: {
          action: 'ACTION_ITEM_STATUS_CHANGE',
          actorId: req.user!.userId,
          entity: 'ActionItem',
          entityId: existing.id,
          oldState: { status: existing.status },
          newState: { status: updated.status },
        },
      });
    }

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /action-items/:id/comments - Add comment to action item
router.post('/action-items/:id/comments', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  try {
    const actionItem = await prisma.actionItem.findFirst({
      where: { id: id as string },
    });

    if (!actionItem) {
      return res.status(404).json({ error: 'Action item not found or unauthorized' });
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        actionItemId: actionItem.id,
        authorId: req.user!.userId,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json(comment);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /action-items/:id/complete - Complete / resolve action item
router.post('/action-items/:id/complete', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const targetStatus = req.body.status || 'resolved';

  try {
    const existing = await prisma.actionItem.findFirst({
      where: { id: id as string },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Action item not found or unauthorized' });
    }

    if (!isValidStatusTransition(existing.status, targetStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from '${existing.status}' to '${targetStatus}'`,
      });
    }

    const updated = await prisma.actionItem.update({
      where: { id: id as string },
      data: { status: targetStatus },
      include: {
        incident: true,
        assignee: { select: { id: true, name: true, email: true } },
        comments: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'ACTION_ITEM_STATUS_CHANGE',
        actorId: req.user!.userId,
        entity: 'ActionItem',
        entityId: existing.id,
        oldState: { status: existing.status },
        newState: { status: updated.status },
      },
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
