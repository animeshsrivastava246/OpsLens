import 'dotenv/config';
import { get, post, fetchTestMetadata } from './test-helpers';
import crypto from 'crypto';

interface TestContext {
  adminToken: string;
  workerToken: string;
  templateId: string;
  assetId: string;
}

async function obtainTokens(): Promise<Partial<TestContext>> {
  console.log("Obtaining user tokens...");
  const adminRes = await post('/auth/login', { email: 'admin@acme.com', password: 'admin123' });
  const workerRes = await post('/auth/login', { email: 'worker@acme.com', password: 'worker123' });
  return {
    adminToken: adminRes.data.token,
    workerToken: workerRes.data.token,
  };
}

async function runSyncChecklistTests() {
  console.log("=== STARTING CHECKLIST RUN BATCH SYNC VERIFICATION TESTS ===");

  const tokens = await obtainTokens();
  const adminToken = tokens.adminToken!;
  const workerToken = tokens.workerToken!;

  // Retrieve templates and assets to get real IDs
  const templatesRes = await get('/checklist-templates', workerToken);
  if (templatesRes.status !== 200 || templatesRes.data.length === 0) {
    console.error("❌ Fail: Seeded templates not found. Run seed script first.");
    process.exit(1);
  }
  const templateId = templatesRes.data[0].id;

  const assetsRes = await get('/assets', workerToken);
  if (assetsRes.status !== 200 || assetsRes.data.length === 0) {
    console.error("❌ Fail: Seeded assets not found.");
    process.exit(1);
  }
  const assetId = assetsRes.data[0].id;

  const runId1 = crypto.randomUUID();
  const runId2 = crypto.randomUUID();

  // Test 1: Send batch sync operations with checklist-runs
  console.log("\nTest 1: Sending batch sync operations (Create Checklist Run 1 & 2)...");
  const batchRes = await post('/sync/batch', {
    operations: [
      {
        id: runId1,
        entity: "checklist-run",
        operation: "create",
        payload: {
          templateId,
          assetId,
          status: "completed",
          responses: [
            { questionId: "serial_number", value: "GEN-SYNC-1" },
            { questionId: "pressure", value: 110 },
            { questionId: "emergency_stop_ok", value: true },
            { questionId: "general_status", value: "Good" }
          ]
        }
      },
      {
        id: runId2,
        entity: "checklist-run",
        operation: "create",
        payload: {
          templateId,
          assetId,
          status: "completed",
          responses: [
            { questionId: "serial_number", value: "GEN-SYNC-2" },
            { questionId: "pressure", value: 95 },
            { questionId: "emergency_stop_ok", value: false },
            { questionId: "general_status", value: "Needs Maintenance" }
          ]
        }
      }
    ]
  }, workerToken);

  if (batchRes.status === 200 && batchRes.data.processedCount === 2) {
    console.log("✅ Success: Both checklist runs successfully synced.");
    console.log("   Results:", JSON.stringify(batchRes.data.results, null, 2));
  } else {
    console.error("❌ Fail: Sync failed. Status:", batchRes.status, batchRes.data);
    process.exit(1);
  }

  // Test 2: Verify Idempotency (resending same batch, should return success and identify as idempotent)
  console.log("\nTest 2: Resending same batch to verify idempotency...");
  const duplicateRes = await post('/sync/batch', {
    operations: [
      {
        id: runId1,
        entity: "checklist-run",
        operation: "create",
        payload: {
          templateId,
          assetId,
          status: "completed",
          responses: [
            { questionId: "serial_number", value: "GEN-SYNC-1" },
            { questionId: "pressure", value: 110 }
          ]
        }
      }
    ]
  }, workerToken);

  if (duplicateRes.status === 200 && duplicateRes.data.results[0].message?.includes('already exists')) {
    console.log("✅ Success: Idempotency check passed. Returned success with 'already exists' message.");
  } else {
    console.error("❌ Fail: Idempotency failed. Data:", duplicateRes.data);
  }

  // Test 3: Fetch runs from GET /my/checklist-runs and verify properties
  console.log("\nTest 3: Fetching checklist runs to verify physical DB state...");
  const fetchRes = await get('/my/checklist-runs', workerToken);
  const syncedRun1 = fetchRes.data.find((r: any) => r.id === runId1);
  const syncedRun2 = fetchRes.data.find((r: any) => r.id === runId2);

  if (syncedRun1 && syncedRun2) {
    console.log("✅ Success: Both runs verified in DB.");
    console.log("   Run 1 responses:", syncedRun1.responses.map((r: any) => `${r.questionId}: ${r.value}`));
    console.log("   Run 2 responses:", syncedRun2.responses.map((r: any) => `${r.questionId}: ${r.value}`));
  } else {
    console.error("❌ Fail: Checklist runs could not be verified in DB.");
  }

  console.log("\n=== CHECKLIST RUN BATCH SYNC VERIFICATION TESTS COMPLETED ===");
}

runSyncChecklistTests().catch(console.error);
