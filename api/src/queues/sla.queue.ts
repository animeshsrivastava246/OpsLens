import { Queue } from 'bullmq';
import { redisOptions } from '../config/redis.config';

export const SLA_QUEUE_NAME = 'sla-escalation-queue';

const slaQueue = new Queue(SLA_QUEUE_NAME, {
  connection: redisOptions,
});

export async function scheduleSlaScanJob(data: { organizationId?: string } = {}) {
  return slaQueue.add('scan-overdue-sla', data, {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
  });
}
