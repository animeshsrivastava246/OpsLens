import { Queue } from 'bullmq';
import { redisOptions } from '../config/redis.config';

export const NOTIFICATION_QUEUE_NAME = 'notification-queue';

export const notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
  connection: redisOptions,
});

export async function addPushNotificationJob(data: {
  notificationId?: string;
  userId?: string;
  organizationId: string;
  title: string;
  message: string;
  type: string;
}) {
  return notificationQueue.add('send-push', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });
}
