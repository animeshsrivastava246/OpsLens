import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import tenantMiddleware from './middleware/tenant.middleware';
import authRouter from './routes/auth.routes';
import assetRouter from './routes/asset.routes';
import syncRouter from './routes/sync.routes';
import checklistRouter from './routes/checklist.routes';
import incidentRouter from './routes/incident.routes';
import { authMiddleware, requireRole } from './middleware/auth.middleware';
import prisma from './db';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(helmet());
app.use(express.json());

// Apply tenant middleware globally to wrap all routes in AsyncLocalStorage context
app.use(tenantMiddleware);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: '1.0.0' });
});

// Register authentication router
app.use('/', authRouter);
app.use('/', assetRouter);
app.use('/', syncRouter);
app.use('/', checklistRouter);
app.use('/', incidentRouter);

// Verification test route for tenant isolation
app.get('/test/tenant-isolation', authMiddleware as any, async (req: any, res) => {
  try {
    // Queries all assets. The custom prisma client should automatically restrict
    // results to the user's organization.
    const assets = await prisma.asset.findMany();
    return res.json({
      organizationId: req.user.organizationId,
      assetsCount: assets.length,
      assets,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Verification test route for role guards
app.get('/test/admin-only', [authMiddleware as any, requireRole(['site-admin'])], (req: any, res: any) => {
  return res.json({ message: 'Welcome Site Admin!', user: req.user });
});

app.listen(port, () => {
  console.log(`OpsLens API server listening at http://localhost:${port}`);
});

