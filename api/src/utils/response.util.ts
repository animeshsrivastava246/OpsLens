import type { Response } from 'express';

export function sendSuccess(res: Response, data: any, statusCode: number = 200) {
  return res.status(statusCode).json(data);
}

export function sendError(res: Response, message: string, statusCode: number = 400) {
  return res.status(statusCode).json({ error: message });
}

export function handleServerError(res: Response, err: any) {
  const message = err?.message || 'An unexpected server error occurred';
  const statusCode = message.includes('not found') || message.includes('unauthorized') ? 404 : 500;
  return res.status(statusCode).json({ error: message });
}
