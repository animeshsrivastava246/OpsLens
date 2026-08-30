import { Worker } from 'bullmq';
import { SLA_QUEUE_NAME } from '../queues/sla.queue';
import { redisOptions } from '../config/redis.config';
import { prisma } from '../db';
import { addPushNotificationJob } from '../queues/notification.queue';

export async function processOverdueSlaScan(organizationId?: string): Promise<{ overdueCount: number; notificationsSent: number }> {
  const now = new Date();
  
  const where: any = {
    dueDate: { lt: now },
    status: { in: ['open', 'in_progress'] },
  };
  if (organizationId) {
    where.organizationId = organizationId;
  }

  const overdueItems = await prisma.actionItem.findMany({
    where,
    include: {
      incident: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  let notificationsSent = 0;

  for (const item of overdueItems) {
    const title = `🚨 SLA Breach Alert: ${item.title}`;
    const message = `Task "${item.title}" (Priority: ${item.priority.toUpperCase()}) is past due date ${item.dueDate?.toISOString()}. Immediate escalation required.`;

    const notification = await prisma.notification.create({
      data: {
        title,
        message,
        type: 'escalation',
        read: false,
        organizationId: item.organizationId,
        userId: item.assigneeId || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'SLA_BREACH_ESCALATION',
        actorId: item.assigneeId || 'system-sla-worker',
        entity: 'ActionItem',
        entityId: item.id,
        oldState: { status: item.status, dueDate: item.dueDate },
        newState: { status: 'overdue', escalatedAt: now.toISOString(), notificationId: notification.id },
      },
    });

    await addPushNotificationJob({
      notificationId: notification.id,
      userId: item.assigneeId || undefined,
      organizationId: item.organizationId,
      title,
      message,
      type: 'escalation',
    });

    notificationsSent++;
  }

  return { overdueCount: overdueItems.length, notificationsSent };
}

const slaWorker = new Worker(
  SLA_QUEUE_NAME,
  async (job) => {
    const { organizationId } = job.data || {};
    console.log(`[SLAWorker] Running SLA overdue scan for org: ${organizationId || 'all'}...`);
    const result = await processOverdueSlaScan(organizationId);
    console.log(`[SLAWorker] SLA Scan completed. Found ${result.overdueCount} overdue item(s), dispatched ${result.notificationsSent} alert(s).`);
    return result;
  },
  { connection: redisOptions }
);

slaWorker.on('failed', (job, err) => {
  console.error(`[SLAWorker] Job ${job?.id} failed with error:`, err.message);
});
