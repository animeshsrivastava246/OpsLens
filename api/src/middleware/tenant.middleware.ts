import type { Request, Response, NextFunction } from 'express';
import { tenantStorage } from '../db';
import type { TenantContext } from '../db';

function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  // Read tenant ID from custom header
  const headerTenantId = req.headers['x-tenant-id'];
  
  const context: TenantContext = {};
  
  if (typeof headerTenantId === 'string' && headerTenantId.trim() !== '') {
    context.organizationId = headerTenantId;
  }

  // Run the rest of the request within this storage context
  tenantStorage.run(context, () => {
    next();
  });
}
export default tenantMiddleware;
