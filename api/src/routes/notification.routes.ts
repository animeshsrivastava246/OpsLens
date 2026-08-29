// fallow-ignore-file
import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth.middleware';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { scheduleSlaScanJob } from '../queues/sla.queue';

const router = Router();

router.use(authMiddleware as any);

// GET /notifications - List user/organization notifications
router.get('/notifications', async (req: AuthenticatedRequest, res: Response) => {
  const { read, type } = req.query;

  try {
    const where: any = {};
    if (read !== undefined) where.read = read === 'true';
    if (type) where.type = type as string;

    const list = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /notifications/:id/read - Mark notification as read
router.post('/notifications/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const existing = await prisma.notification.findFirst({
      where: { id: id as string },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: { read: true },
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /escalations/scan - Trigger immediate SLA overdue scan and queue worker processing
router.post('/escalations/scan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    const job = await scheduleSlaScanJob({ organizationId });

    return res.status(202).json({
      message: 'SLA escalation scan triggered successfully',
      jobId: job.id,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
