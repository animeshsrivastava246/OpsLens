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

// Shared handler for resolving a single asset (either by ID or scan code)
const getAssetDetails = async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.code || req.params.assetId;
  if (!id || typeof id !== 'string') {
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
};

// GET /assets/scan/:code - Resolve asset by scan code (UUID)
router.get('/assets/scan/:code', getAssetDetails as any);

// GET /assets/:assetId - Get single asset by ID
router.get('/assets/:assetId', getAssetDetails as any);

// POST /assets - Create a new asset (site-admin, compliance-manager, supervisor)
router.post('/assets', requireRole(['site-admin', 'compliance-manager', 'supervisor']) as any, async (req: AuthenticatedRequest, res: Response) => {
  const { name, siteId, assetTypeId } = req.body;

  if (!name || !siteId || !assetTypeId) {
    return res.status(400).json({ error: 'Name, siteId, and assetTypeId are required' });
  }

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Check if site exists and is owned by active organization
    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });
    if (!site) {
      return res.status(400).json({ error: 'Invalid siteId or site not authorized' });
    }

    // Check if asset type exists
    const assetType = await prisma.assetType.findUnique({
      where: { id: assetTypeId },
    });
    if (!assetType) {
      return res.status(400).json({ error: 'Invalid assetTypeId' });
    }

    const newAsset = await prisma.asset.create({
      data: {
        name,
        siteId,
        assetTypeId,
        organizationId: req.user.organizationId,
      },
      include: {
        site: true,
        assetType: true,
      },
    });

    return res.status(201).json(newAsset);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /assets/:assetId - Update asset (site-admin, compliance-manager, supervisor)
router.patch('/assets/:assetId', requireRole(['site-admin', 'compliance-manager', 'supervisor']) as any, async (req: AuthenticatedRequest, res: Response) => {
  const { assetId } = req.params;
  const { name, siteId, assetTypeId } = req.body;

  if (!assetId || typeof assetId !== 'string') {
    return res.status(400).json({ error: 'Asset ID is required' });
  }

  try {
    // If updating site, check ownership
    if (siteId) {
      const site = await prisma.site.findUnique({
        where: { id: siteId },
      });
      if (!site) {
        return res.status(400).json({ error: 'Invalid siteId or site not authorized' });
      }
    }

    // If updating asset type, check existence
    if (assetTypeId) {
      const assetType = await prisma.assetType.findUnique({
        where: { id: assetTypeId },
      });
      if (!assetType) {
        return res.status(400).json({ error: 'Invalid assetTypeId' });
      }
    }

    const updatedAsset = await prisma.asset.update({
      where: { id: assetId },
      data: {
        ...(name ? { name } : {}),
        ...(siteId ? { siteId } : {}),
        ...(assetTypeId ? { assetTypeId } : {}),
      },
      include: {
        site: true,
        assetType: true,
      },
    });

    return res.json(updatedAsset);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
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
