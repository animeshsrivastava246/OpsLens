import 'dotenv/config';
import { get, post } from './test-helpers';
import crypto from 'crypto';

interface TestContext {
  workerToken: string;
  assetId: string;
}

async function obtainTokens(): Promise<Partial<TestContext>> {
  console.log("Obtaining user tokens...");
  const workerRes = await post('/auth/login', { email: 'worker@acme.com', password: 'worker123' });
  return {
    workerToken: workerRes.data.token,
  };
}

async function runSyncIncidentTests() {
  console.log("=== STARTING INCIDENT BATCH SYNC VERIFICATION TESTS ===");

  const tokens = await obtainTokens();
  const workerToken = tokens.workerToken!;

  const assetsRes = await get('/assets', workerToken);
  if (assetsRes.status !== 200 || assetsRes.data.length === 0) {
    console.error("❌ Fail: Seeded assets not found.");
    process.exit(1);
  }
  const assetId = assetsRes.data[0].id;

  const incidentId1 = crypto.randomUUID();
  const incidentId2 = crypto.randomUUID();

  // Test 1: Send batch sync operations with incidents
  console.log("\nTest 1: Sending batch sync operations (Create Incident 1 & 2)...");
  const batchRes = await post('/sync/batch', {
    operations: [
      {
        id: incidentId1,
        entity: "incident",
        operation: "create",
        payload: {
          title: "Primary Pipe Burst",
          description: "Water pressure flooded secondary chamber.",
          severity: "critical",
          assetId,
          attachments: [
            { id: crypto.randomUUID(), url: "https://opslens-assets.s3.amazonaws.com/uploads/burst.jpg" }
          ]
        }
      },
      {
        id: incidentId2,
        entity: "incident",
        operation: "create",
        payload: {
          title: "Slight Fuel Leak",
          description: "Minor drops near fuel filter.",
          severity: "low",
          assetId,
          attachments: []
        }
      }
    ]
  }, workerToken);

  if (batchRes.status === 200 && batchRes.data.processedCount === 2) {
    console.log("✅ Success: Both incidents successfully synced.");
  } else {
    console.error("❌ Fail: Sync failed. Status:", batchRes.status, batchRes.data);
    process.exit(1);
  }

  // Test 2: Verify Idempotency (resending same batch, should return success and identify as idempotent)
  console.log("\nTest 2: Resending same batch to verify idempotency...");
  const duplicateRes = await post('/sync/batch', {
    operations: [
      {
        id: incidentId1,
        entity: "incident",
        operation: "create",
        payload: {
          title: "Primary Pipe Burst",
          description: "Water pressure flooded secondary chamber.",
          severity: "critical",
          assetId
        }
      }
    ]
  }, workerToken);

  if (duplicateRes.status === 200 && duplicateRes.data.results[0].message?.includes('already exists')) {
    console.log("✅ Success: Idempotency check passed. Returned success with 'already exists' message.");
  } else {
    console.error("❌ Fail: Idempotency failed. Data:", duplicateRes.data);
  }

  // Test 3: Fetch incidents list and verify properties
  console.log("\nTest 3: Fetching incidents list to verify physical DB state...");
  const fetchRes = await get('/incidents', workerToken);
  const syncedInc1 = fetchRes.data.find((i: any) => i.id === incidentId1);
  const syncedInc2 = fetchRes.data.find((i: any) => i.id === incidentId2);

  if (syncedInc1 && syncedInc2) {
    console.log("✅ Success: Both incidents verified in DB.");
    console.log("   Incident 1 Title:", syncedInc1.title, ", Severity:", syncedInc1.severity, ", Attachments:", syncedInc1.attachments.map((a: any) => a.url));
    console.log("   Incident 2 Title:", syncedInc2.title, ", Severity:", syncedInc2.severity);
  } else {
    console.error("❌ Fail: Incidents could not be verified in DB.");
  }

  console.log("\n=== INCIDENT BATCH SYNC VERIFICATION TESTS COMPLETED ===");
}

runSyncIncidentTests().catch(console.error);
