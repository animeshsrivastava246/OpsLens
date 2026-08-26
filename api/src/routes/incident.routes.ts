// fallow-ignore-file
import express, { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth.middleware';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = Router();

// Apply auth middleware to all incident endpoints
router.use(authMiddleware as any);

export function calculateSlaDueDate(severity: string): Date {
  const now = new Date();
  const hoursMap: Record<string, number> = {
    critical: 4,
    high: 24,
    medium: 72,
    low: 168,
  };
  const hours = hoursMap[severity.toLowerCase()] || 72;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

// POST /media/upload - Binary upload route (saves file locally, returns mock S3 URL)
router.post('/media/upload', express.raw({ type: 'image/*', limit: '10mb' }) as any, async (req: any, res: any) => {
  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: 'Empty payload' });
    }
    const filename = `${crypto.randomUUID()}.jpg`;
    const uploadsDir = path.join(__dirname, '../../public/uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filePath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(filePath, req.body);
    
    // Return mock S3 URL containing the uploaded filename
    const s3Url = `https://opslens-assets.s3.amazonaws.com/uploads/${filename}`;
    return res.json({ url: s3Url });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /incidents - List organization incidents
router.get('/incidents', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = await prisma.incident.findMany({
      include: {
        attachments: true,
        actionItems: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /incidents/:id - Get detail
router.get('/incidents/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const item = await prisma.incident.findFirst({
      where: { id: id as string },
      include: {
        attachments: true,
        actionItems: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            comments: true,
          },
        },
      },
    });
    if (!item) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    return res.json(item);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /incidents - Create incident & auto-generate corrective action item
router.post('/incidents', async (req: AuthenticatedRequest, res: Response) => {
  const { id, title, description, severity, assetId, attachments, assigneeId } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const organizationId = req.user!.organizationId;
    const incidentSeverity = severity || 'medium';

    if (assetId) {
      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
      });
      if (!asset) {
        return res.status(404).json({ error: 'Asset not found or unauthorized' });
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

    const dueDate = calculateSlaDueDate(incidentSeverity);

    const item = await prisma.incident.create({
      data: {
        id: id || undefined,
        title,
        description,
        severity: incidentSeverity,
        organizationId,
        assetId: assetId || null,
        attachments: attachments ? {
          create: attachments.map((att: any) => ({
            id: att.id || undefined,
            url: att.url,
          })),
        } : undefined,
        actionItems: {
          create: {
            title: `[${incidentSeverity.toUpperCase()}] Remediation: ${title}`,
            description: description || `Auto-generated corrective task for incident: ${title}`,
            status: 'open',
            priority: incidentSeverity,
            organizationId,
            assigneeId: assigneeId || null,
            dueDate,
          },
        },
      },
      include: {
        attachments: true,
        actionItems: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'INCIDENT_CREATE',
        actorId: req.user!.userId,
        entity: 'Incident',
        entityId: item.id,
        newState: { id: item.id, title: item.title, severity: item.severity },
      },
    });

    return res.status(201).json(item);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /incidents/:id/assign - Route / assign incident and associated action items
router.post('/incidents/:id/assign', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { assigneeId } = req.body;

  if (!assigneeId) {
    return res.status(400).json({ error: 'assigneeId is required' });
  }

  try {
    const incident = await prisma.incident.findFirst({
      where: { id: id as string },
    });

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: assigneeId },
    });
    if (!user) {
      return res.status(404).json({ error: 'Assignee user not found' });
    }

    await prisma.actionItem.updateMany({
      where: { incidentId: incident.id },
      data: { assigneeId },
    });

    const updatedIncident = await prisma.incident.findUnique({
      where: { id: incident.id },
      include: {
        attachments: true,
        actionItems: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'INCIDENT_ASSIGN',
        actorId: req.user!.userId,
        entity: 'Incident',
        entityId: incident.id,
        newState: { assigneeId },
      },
    });

    return res.json(updatedIncident);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /incidents/:id/close - Close incident and complete associated action items
router.post('/incidents/:id/close', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const incident = await prisma.incident.findFirst({
      where: { id: id as string },
      include: { actionItems: true },
    });

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Safely update all open/in_progress action items to closed
    await prisma.actionItem.updateMany({
      where: {
        incidentId: incident.id,
        status: { in: ['open', 'in_progress', 'resolved'] },
      },
      data: { status: 'closed' },
    });

    const updatedIncident = await prisma.incident.findUnique({
      where: { id: incident.id },
      include: {
        attachments: true,
        actionItems: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'INCIDENT_CLOSE',
        actorId: req.user!.userId,
        entity: 'Incident',
        entityId: incident.id,
        newState: { closedAt: new Date().toISOString() },
      },
    });

    return res.json(updatedIncident);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
