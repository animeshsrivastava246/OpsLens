// fallow-ignore-file
import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../db';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all checklist endpoints
router.use(authMiddleware as any);

async function validateTemplate(templateId: string) {
  const template = await prisma.checklistTemplate.findUnique({
    where: { id: templateId },
  });
  if (!template) {
    throw new Error('Checklist template not found or unauthorized');
  }
  return template;
}

async function validateAssetType(assetTypeId?: string) {
  if (!assetTypeId) return;
  const assetType = await prisma.assetType.findUnique({
    where: { id: assetTypeId },
  });
  if (!assetType) {
    throw new Error('AssetType not found');
  }
}

async function validateAsset(assetId?: string) {
  if (!assetId) return;
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  });
  if (!asset) {
    throw new Error('Asset not found or unauthorized');
  }
}

// GET /checklist-templates - List templates for tenant
router.get('/checklist-templates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templates = await prisma.checklistTemplate.findMany({
      include: {
        assignments: {
          include: {
            assetType: true,
          },
        },
      },
    });
    return res.json(templates);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /checklist-templates - Create template (compliance-manager, site-admin)
router.post('/checklist-templates', requireRole(['site-admin', 'compliance-manager']) as any, async (req: AuthenticatedRequest, res: Response) => {
  const { name, schema } = req.body;
  if (!name || !schema) {
    return res.status(400).json({ error: 'Name and schema are required' });
  }

  try {
    const organizationId = req.user!.organizationId;
    const template = await prisma.checklistTemplate.create({
      data: {
        name,
        schema,
        organizationId,
      },
    });
    return res.status(201).json(template);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /checklist-templates/:id - Update template (compliance-manager, site-admin)
router.patch('/checklist-templates/:id', requireRole(['site-admin', 'compliance-manager']) as any, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, schema } = req.body;

  try {
    const data: any = {};
    if (name) data.name = name;
    if (schema) data.schema = schema;

    const template = await prisma.checklistTemplate.update({
      where: { id: id as string },
      data,
    });
    return res.json(template);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /checklist-assignments - Assign template (compliance-manager, site-admin)
router.post('/checklist-assignments', requireRole(['site-admin', 'compliance-manager']) as any, async (req: AuthenticatedRequest, res: Response) => {
  const { templateId, assetTypeId } = req.body;
  if (!templateId) {
    return res.status(400).json({ error: 'TemplateId is required' });
  }

  try {
    const organizationId = req.user!.organizationId;

    await validateTemplate(templateId);
    await validateAssetType(assetTypeId);

    const assignment = await prisma.checklistAssignment.create({
      data: {
        templateId,
        assetTypeId,
        organizationId,
      },
      include: {
        template: true,
        assetType: true,
      },
    });

    return res.status(201).json(assignment);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /checklist-assignments - List assignments
router.get('/checklist-assignments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const assignments = await prisma.checklistAssignment.findMany({
      include: {
        template: true,
        assetType: true,
      },
    });
    return res.json(assignments);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /my/checklist-runs - Retrieve runs for active tenant
router.get('/my/checklist-runs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const runs = await prisma.checklistRun.findMany({
      include: {
        template: true,
        asset: true,
        responses: true,
      },
    });
    return res.json(runs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /checklist-runs - Execute/create a run
router.post('/checklist-runs', async (req: AuthenticatedRequest, res: Response) => {
  const { id, templateId, assetId, responses, status } = req.body;
  if (!templateId) {
    return res.status(400).json({ error: 'TemplateId is required' });
  }

  try {
    const organizationId = req.user!.organizationId;

    await validateTemplate(templateId);
    await validateAsset(assetId);

    const run = await prisma.checklistRun.create({
      data: {
        id: id || undefined,
        templateId,
        assetId,
        organizationId,
        status: status || 'completed',
        responses: {
          create: (responses || []).map((r: any) => ({
            questionId: r.questionId,
            value: String(r.value),
          })),
        },
      },
      include: {
        template: true,
        asset: true,
        responses: true,
      },
    });

    return res.status(201).json(run);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /checklist-runs/:id/submit - Submit a draft run
router.post('/checklist-runs/:id/submit', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { responses } = req.body;

  try {
    const runExists = await prisma.checklistRun.findUnique({
      where: { id: id as string },
    });
    if (!runExists) {
      return res.status(404).json({ error: 'Checklist run not found or unauthorized' });
    }

    const data: any = { status: 'completed' };
    if (responses && Array.isArray(responses)) {
      await prisma.checklistResponse.deleteMany({
        where: { runId: id as string },
      });
      data.responses = {
        create: responses.map((r: any) => ({
          questionId: r.questionId,
          value: String(r.value),
        })),
      };
    }

    const updatedRun = await prisma.checklistRun.update({
      where: { id: id as string },
      data,
      include: {
        template: true,
        asset: true,
        responses: true,
      },
    });

    return res.json(updatedRun);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
