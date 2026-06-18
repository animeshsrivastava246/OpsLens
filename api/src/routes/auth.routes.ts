import { Router } from 'express';
import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { authMiddleware, JWT_SECRET } from '../middleware/auth.middleware';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function verifyUserAndCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const isPasswordValid = bcrypt.compareSync(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new HttpError(401, 'Invalid email or password');
  }

  return user;
}

function checkAuthParams(email: any, password: any) {
  if (!email) {
    throw new HttpError(400, 'Email and password are required');
  }
  if (!password) {
    throw new HttpError(400, 'Email and password are required');
  }
}

function buildMembershipWhere(userId: string, organizationId?: string) {
  const where: any = { userId };
  if (organizationId) {
    where.organizationId = organizationId;
  }
  return where;
}

function getErrorStatus(err: any): number {
  return err.status || 500;
}

// POST /auth/login
router.post('/auth/login', async (req, res) => {
  const { email, password, organizationId } = req.body;

  try {
    checkAuthParams(email, password);
    const user = await verifyUserAndCredentials(email, password);

    // Resolve membership
    const membership = await prisma.membership.findFirst({
      where: buildMembershipWhere(user.id, organizationId),
      include: {
        role: true,
        organization: true,
      },
    });

    if (!membership) {
      throw new HttpError(403, 'User is not a member of the specified organization');
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        organizationId: membership.organizationId,
        role: membership.role.name,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organization: {
          id: membership.organization.id,
          name: membership.organization.name,
        },
        role: membership.role.name,
      },
    });
  } catch (err: any) {
    return res.status(getErrorStatus(err)).json({ error: err.message });
  }
});

async function verifyRefreshMembership(userId: string, organizationId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HttpError(401, 'User no longer exists');
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      organizationId,
    },
    include: {
      role: true,
    },
  });

  if (!membership) {
    throw new HttpError(403, 'User is no longer a member of the organization');
  }

  return { user, membership };
}

async function verifyRefreshToken(token: string) {
  const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as any;
  return verifyRefreshMembership(decoded.userId, decoded.organizationId);
}

function handleRefreshError(err: any, res: Response) {
  const status = err.status || 401;
  const msg = err.status ? err.message : 'Invalid token';
  return res.status(status).json({ error: msg });
}

// POST /auth/refresh
router.post('/auth/refresh', async (req, res) => {
  const { token } = req.body;

  try {
    if (!token) {
      throw new HttpError(400, 'Token is required');
    }
    const { user, membership } = await verifyRefreshToken(token);

    // Issue new token
    const newToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        organizationId: membership.organizationId,
        role: membership.role.name,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({ token: newToken });
  } catch (err: any) {
    return handleRefreshError(err, res);
  }
});

// POST /auth/logout
router.post('/auth/logout', (req, res) => {
  return res.json({ message: 'Successfully logged out' });
});

// GET /me
router.get('/me', authMiddleware as any, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return res.json({
      user,
      organizationId: req.user.organizationId,
      role: req.user.role,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
