import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../db';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all registry endpoints
router.use(authMiddleware as any);

// GET /assets - List all assets for the active tenant
router.get('/assets', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const assets = await prisma.asset.findMany({
      include: {
        site: true,
        assetType: true,
      },
    });
    return res.json(assets);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Helper to fetch asset by ID with site and assetType relations
async function fetchAssetById(id: string) {
  return prisma.asset.findUnique({
    where: { id },
    include: {
      site: true,
      assetType: true,
    },
  });
}

async function resolveAsset(id: string | undefined, res: Response) {
  if (!id) {
    return res.status(400).json({ error: 'Asset identifier is required' });
  }
  try {
    const asset = await fetchAssetById(id);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found or not authorized' });
    }
    return res.json(asset);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Shared handler for resolving a single asset (either by ID or scan code)
const getAssetDetails = async (req: AuthenticatedRequest, res: Response) => {
  const codeVal = req.params.code || req.params.assetId;
  const id = typeof codeVal === 'string' ? codeVal : undefined;
  return resolveAsset(id, res);
};

// GET /assets/scan/:code - Resolve asset by scan code (UUID)
router.get('/assets/scan/:code', getAssetDetails as any);

// GET /assets/:assetId - Get single asset by ID
router.get('/assets/:assetId', getAssetDetails as any);

function handleAssetRouteError(err: any, res: Response) {
  if (err.message.includes('Invalid')) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: err.message });
}

async function validatePostRelations(siteId: string, assetTypeId: string) {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
  });
  if (!site) {
    throw new Error('Invalid siteId or site not authorized');
  }

  const assetType = await prisma.assetType.findUnique({
    where: { id: assetTypeId },
  });
  if (!assetType) {
    throw new Error('Invalid assetTypeId');
  }
}

function validateAssetBody(body: any): boolean {
  return !body.name || !body.siteId || !body.assetTypeId;
}

function getTenantOrgId(req: AuthenticatedRequest): string {
  if (!req.user?.organizationId) {
    throw new Error('Authentication required');
  }
  return req.user.organizationId;
}

// POST /assets - Create a new asset (site-admin, compliance-manager, supervisor)
router.post('/assets', requireRole(['site-admin', 'compliance-manager', 'supervisor']) as any, async (req: AuthenticatedRequest, res: Response) => {
  if (validateAssetBody(req.body)) {
    return res.status(400).json({ error: 'Name, siteId, and assetTypeId are required' });
  }

  try {
    const organizationId = getTenantOrgId(req);
    await validatePostRelations(req.body.siteId, req.body.assetTypeId);

    const newAsset = await prisma.asset.create({
      data: {
        name: req.body.name,
        siteId: req.body.siteId,
        assetTypeId: req.body.assetTypeId,
        organizationId,
      },
      include: {
        site: true,
        assetType: true,
      },
    });

    return res.status(201).json(newAsset);
  } catch (err: any) {
    return handleAssetRouteError(err, res);
  }
});

async function validateSiteId(siteId?: string) {
  if (!siteId) return;
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error('Invalid siteId or site not authorized');
}

async function validateAssetTypeId(assetTypeId?: string) {
  if (!assetTypeId) return;
  const assetType = await prisma.assetType.findUnique({ where: { id: assetTypeId } });
  if (!assetType) throw new Error('Invalid assetTypeId');
}

async function validatePatchRelations(siteId?: string, assetTypeId?: string) {
  await validateSiteId(siteId);
  await validateAssetTypeId(assetTypeId);
}

function buildAssetUpdateData(body: any): any {
  const data: any = {};
  if (body.name) data.name = body.name;
  if (body.siteId) data.siteId = body.siteId;
  if (body.assetTypeId) data.assetTypeId = body.assetTypeId;
  return data;
}

// PATCH /assets/:assetId - Update asset (site-admin, compliance-manager, supervisor)
router.patch('/assets/:assetId', requireRole(['site-admin', 'compliance-manager', 'supervisor']) as any, async (req: AuthenticatedRequest, res: Response) => {
  const { assetId } = req.params;
  if (typeof assetId !== 'string') {
    return res.status(400).json({ error: 'Asset ID is required' });
  }

  try {
    await validatePatchRelations(req.body.siteId, req.body.assetTypeId);

    const updatedAsset = await prisma.asset.update({
      where: { id: assetId },
      data: buildAssetUpdateData(req.body),
      include: {
        site: true,
        assetType: true,
      },
    });

    return res.json(updatedAsset);
  } catch (err: any) {
    return handleAssetRouteError(err, res);
  }
});

// DELETE /assets/:assetId - Delete asset (site-admin, compliance-manager)
router.delete('/assets/:assetId', requireRole(['site-admin', 'compliance-manager']) as any, async (req: AuthenticatedRequest, res: Response) => {
  const { assetId } = req.params;

  if (!assetId || typeof assetId !== 'string') {
    return res.status(400).json({ error: 'Asset ID is required' });
  }

  try {
    await prisma.asset.delete({
      where: { id: assetId },
    });
    return res.json({ message: 'Asset successfully deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Helper GET endpoints to fetch Sites and Asset Types to populate selectors on the frontend
router.get('/sites', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sites = await prisma.site.findMany();
    return res.json(sites);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/asset-types', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const types = await prisma.assetType.findMany();
    return res.json(types);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
