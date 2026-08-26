import 'dotenv/config';
import { post } from './test-helpers';
import crypto from 'crypto';

async function obtainWorkerToken() {
  const res = await post('/auth/login', { email: 'worker@acme.com', password: 'worker123' });
  return res.data.token;
}

async function runSyncActionTests() {
  console.log("=== STARTING BATCH SYNC ACTION ITEMS VERIFICATION TESTS ===");

  const token = await obtainWorkerToken();
  const offlineActionId = crypto.randomUUID();

  // Test 1: Batch sync create action item offline mutation
  console.log("\nTest 1: Reconciling offline action-item creation mutation...");
  const batchCreateRes = await post('/sync/batch', {
    operations: [
      {
        id: offlineActionId,
        entity: 'action-item',
        operation: 'create',
        payload: {
          title: "Offline Repair Motor B",
          description: "Motor B bearings grinding noise",
          priority: "high",
          status: "open",
        },
      },
    ],
  }, token);

  if (batchCreateRes.status === 200 && batchCreateRes.data.processedCount === 1) {
    console.log("✅ Success: Offline action item synced successfully:", batchCreateRes.data.results[0]);
  } else {
    console.error("❌ Fail: Offline action item sync failed:", batchCreateRes.data);
    process.exit(1);
  }

  // Test 2: Idempotent re-sync of same operation
  console.log("\nTest 2: Verifying idempotency on re-syncing same action-item operation...");
  const reSyncRes = await post('/sync/batch', {
    operations: [
      {
        id: offlineActionId,
        entity: 'action-item',
        operation: 'create',
        payload: {
          title: "Offline Repair Motor B",
          priority: "high",
        },
      },
    ],
  }, token);

  if (reSyncRes.status === 200 && reSyncRes.data.results[0].status === 'success') {
    console.log("✅ Success: Idempotent re-sync handled cleanly:", reSyncRes.data.results[0].message);
  } else {
    console.error("❌ Fail: Idempotent re-sync failed:", reSyncRes.data);
    process.exit(1);
  }

  // Test 3: Batch sync update action item status (open -> in_progress)
  console.log("\nTest 3: Reconciling offline action-item status update mutation (open -> in_progress)...");
  const batchUpdateRes = await post('/sync/batch', {
    operations: [
      {
        id: offlineActionId,
        entity: 'action-item',
        operation: 'update',
        payload: {
          status: 'in_progress',
        },
      },
    ],
  }, token);

  if (batchUpdateRes.status === 200 && batchUpdateRes.data.results[0].status === 'success') {
    console.log("✅ Success: Offline status update synced successfully:", batchUpdateRes.data.results[0].data.status);
  } else {
    console.error("❌ Fail: Offline status update failed:", batchUpdateRes.data);
    process.exit(1);
  }

  console.log("\n=== BATCH SYNC ACTION ITEMS VERIFICATION TESTS PASSED SUCCESSFULLY ===");
}

runSyncActionTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
