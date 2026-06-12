import { Router } from 'express';
import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { authMiddleware, JWT_SECRET } from '../middleware/auth.middleware';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// POST /auth/login
router.post('/auth/login', async (req, res) => {
  const { email, password, organizationId } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isPasswordValid = bcrypt.compareSync(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Resolve membership
    const membership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        role: true,
        organization: true,
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'User is not a member of the specified organization' });
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
    return res.status(500).json({ error: err.message });
  }
});

// POST /auth/refresh
router.post('/auth/refresh', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as any;
    
    // Check if user still exists and has valid membership
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        organizationId: decoded.organizationId,
      },
      include: {
        role: true,
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'User is no longer a member of the organization' });
    }

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
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
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
