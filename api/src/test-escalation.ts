import 'dotenv/config';
import { get, post } from './test-helpers';
import crypto from 'crypto';
import { redisConnection } from './config/redis.config';
import { processOverdueSlaScan } from './workers/sla.worker';
import { addPushNotificationJob } from './queues/notification.queue';

async function obtainWorkerToken() {
  const res = await post('/auth/login', { email: 'worker@acme.com', password: 'worker123' });
  return {
    token: res.data.token,
    user: res.data.user,
  };
}

async function runEscalationEngineTests() {
  console.log("=== STARTING STAGE 3.1 ESCALATION ENGINE VERIFICATION TESTS ===");

  // Test 1: Redis connection pool check
  console.log("\nTest 1: Verifying Redis connection pool status...");
  const pingResult = await redisConnection.ping();
  if (pingResult === 'PONG') {
    console.log("✅ Success: Redis connection pool active and responding with PONG.");
  } else {
    console.error("❌ Fail: Redis ping failed:", pingResult);
    process.exit(1);
  }

  const { token, user } = await obtainWorkerToken();

  // Test 2: Create action item with past due date (simulating overdue SLA)
  console.log("\nTest 2: Creating ActionItem task with past due date to simulate SLA breach...");
  const overdueItemId = crypto.randomUUID();
  const pastDueDate = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago

  const itemRes = await post('/action-items', {
    id: overdueItemId,
    title: "Critical Valve Inspection Overdue",
    description: "SLA limit expired. Requires immediate supervisor triage.",
    priority: "critical",
    dueDate: pastDueDate,
  }, token);

  if (itemRes.status === 201 && itemRes.data.id === overdueItemId) {
    console.log("✅ Success: Created task with past due date:", itemRes.data.dueDate);
  } else {
    console.error("❌ Fail: Failed to create test action item:", itemRes.data);
    process.exit(1);
  }

  // Test 3: Process SLA scan & verify overdue alert generation
  console.log("\nTest 3: Processing SLA tracking worker scan for overdue tasks...");
  const scanResult = await processOverdueSlaScan(user.organization.id);

  if (scanResult.overdueCount > 0 && scanResult.notificationsSent > 0) {
    console.log(`✅ Success: SLA worker scan detected ${scanResult.overdueCount} overdue task(s) and generated ${scanResult.notificationsSent} escalation alert(s).`);
  } else {
    console.error("❌ Fail: SLA worker scan failed to detect overdue items:", scanResult);
    process.exit(1);
  }

  // Test 4: Verify Notifications list API
  console.log("\nTest 4: Retrieving generated notifications via GET /notifications...");
  const notifListRes = await get('/notifications', token);

  if (notifListRes.status === 200 && Array.isArray(notifListRes.data) && notifListRes.data.length > 0) {
    const foundNotif = notifListRes.data.find((n: any) => n.message.includes("Critical Valve Inspection Overdue"));
    if (foundNotif) {
      console.log("✅ Success: Found generated SLA escalation alert:", foundNotif.title);

      // Test 5: Mark notification as read
      console.log("\nTest 5: Marking notification as read via POST /notifications/:id/read...");
      const readRes = await post(`/notifications/${foundNotif.id}/read`, {}, token);
      if (readRes.status === 200 && readRes.data.read === true) {
        console.log("✅ Success: Notification successfully marked as read.");
      } else {
        console.error("❌ Fail: Failed to mark notification as read:", readRes.data);
        process.exit(1);
      }
    } else {
      console.error("❌ Fail: Notification message not found in list:", notifListRes.data);
      process.exit(1);
    }
  } else {
    console.error("❌ Fail: GET /notifications failed:", notifListRes.data);
    process.exit(1);
  }

  // Test 6: Trigger manual scan endpoint POST /escalations/scan
  console.log("\nTest 6: Triggering manual escalation scan job via POST /escalations/scan...");
  const triggerRes = await post('/escalations/scan', {}, token);
  if (triggerRes.status === 202 && triggerRes.data.jobId) {
    console.log("✅ Success: Escalation scan job queued in BullMQ with Job ID:", triggerRes.data.jobId);
  } else {
    console.error("❌ Fail: Escalation scan trigger failed:", triggerRes.data);
    process.exit(1);
  }

  // Test 7: BullMQ queue high load stress test (dispatches 50 push notification jobs)
  console.log("\nTest 7: BullMQ high-load queue processing (batch submitting 50 push notification jobs)...");
  const jobPromises = [];
  for (let i = 1; i <= 50; i++) {
    jobPromises.push(
      addPushNotificationJob({
        userId: user.id,
        organizationId: user.organization.id,
        title: `Stress Test Alert ${i}`,
        message: `High load push notification test item ${i}`,
        type: 'alert',
      })
    );
  }

  const jobs = await Promise.all(jobPromises);
  if (jobs.length === 50 && jobs.every((j) => j.id)) {
    console.log("✅ Success: Successfully enqueued 50 jobs into BullMQ without queue blocking.");
  } else {
    console.error("❌ Fail: High-load BullMQ job submission failed.");
    process.exit(1);
  }

  console.log("\n=== STAGE 3.1 ESCALATION ENGINE VERIFICATION TESTS PASSED SUCCESSFULLY ===");
}

runEscalationEngineTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test Error:", err);
    process.exit(1);
  });
