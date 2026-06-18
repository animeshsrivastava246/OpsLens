import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { tenantStorage } from '../db';

export const JWT_SECRET = process.env.JWT_SECRET || 'opslens-secret-key-2026';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    organizationId: string;
    role: string;
  };
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication token required' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      email: string;
      organizationId: string;
      role: string;
    };

    req.user = decoded;

    // Update the tenant context in store
    const store = tenantStorage.getStore()!;
    store.organizationId = decoded.organizationId;
    store.userId = decoded.userId;
    store.role = decoded.role;

    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
}
