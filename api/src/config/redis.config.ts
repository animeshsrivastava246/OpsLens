import { Redis } from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

export const redisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

export const redisConnection = new Redis(redisOptions);

redisConnection.on('error', (err) => {
  console.warn('[Redis] Connection warning:', err.message);
});
