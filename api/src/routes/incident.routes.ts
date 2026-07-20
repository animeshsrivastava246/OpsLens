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
        actionItems: true,
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
        actionItems: true,
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

// POST /incidents - Create incident
router.post('/incidents', async (req: AuthenticatedRequest, res: Response) => {
  const { id, title, description, severity, assetId, attachments } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const organizationId = req.user!.organizationId;

    if (assetId) {
      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
      });
      if (!asset) {
        return res.status(404).json({ error: 'Asset not found or unauthorized' });
      }
    }

    const item = await prisma.incident.create({
      data: {
        id: id || undefined,
        title,
        description,
        severity: severity || 'medium',
        organizationId,
        assetId: assetId || null,
        attachments: attachments ? {
          create: attachments.map((att: any) => ({
            id: att.id || undefined,
            url: att.url,
          })),
        } : undefined,
      },
      include: {
        attachments: true,
      },
    });

    return res.status(201).json(item);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
