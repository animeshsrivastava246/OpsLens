import { Worker } from 'bullmq';
import { NOTIFICATION_QUEUE_NAME } from '../queues/notification.queue';
import { redisOptions } from '../config/redis.config';

const notificationWorker = new Worker(
  NOTIFICATION_QUEUE_NAME,
  async (job) => {
    const { notificationId, userId, organizationId, title, message, type } = job.data;
    console.log(`[PushWorker] Dispatched push notification [${type.toUpperCase()}] to user ${userId || 'org-all'} (${organizationId}): "${title}"`);
    return {
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      jobId: job.id,
    };
  },
  { connection: redisOptions }
);

notificationWorker.on('failed', (job, err) => {
  console.error(`[PushWorker] Job ${job?.id} failed with error:`, err.message);
});
