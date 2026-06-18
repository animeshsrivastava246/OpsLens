import 'dotenv/config';
import { get, post, generateUUID, fetchTestMetadata } from './test-helpers';

interface TestContext {
  adminToken: string;
  testSiteId: string;
  testTypeId: string;
  assetId1: string;
  assetId2: string;
  assetId3: string;
}

async function obtainAdminToken(): Promise<string> {
  console.log("Obtaining admin token...");
  const adminRes = await post('/auth/login', { email: 'admin@acme.com', password: 'admin123' });
  const adminToken = adminRes.data.token;

  if (!adminToken) {
    throw new Error("Failed to authenticate admin user.");
  }
  return adminToken;
}

async function fetchMetadata(adminToken: string): Promise<{ testSiteId: string; testTypeId: string }> {
  console.log("\nTest 1: Fetching sites and asset types...");
  try {
    const meta = await fetchTestMetadata(adminToken);
    console.log(`✅ Success: Found Site ID: ${meta.siteId}, Type ID: ${meta.assetTypeId}`);
    return { testSiteId: meta.siteId, testTypeId: meta.assetTypeId };
  } catch (err: any) {
    console.error("❌ Fail: Could not fetch sites or asset types:", err.message);
    process.exit(1);
  }
}

function assertSuccess(condition: boolean, failMessage: string) {
  if (!condition) {
    console.error(failMessage);
    process.exit(1);
  }
}

function findSuccessOp(results: any[], id: string): boolean {
  return results.some((r: any) => r.id === id && r.status === 'success');
}

function hasIdempotentMsg(results: any[], id: string): boolean {
  return results.some((r: any) => r.id === id && r.message && r.message.includes('idempotent'));
}

async function sendBatchSync(ctx: TestContext): Promise<any> {
  console.log("\nTest 2: Sending batch sync operations (Create Asset 1 & 2, Update Asset 1 name)...");
  const batch1 = {
    operations: [
      {
        id: ctx.assetId1,
        entity: 'asset',
        operation: 'create',
        payload: {
          name: 'Offline Generator 101',
          siteId: ctx.testSiteId,
          assetTypeId: ctx.testTypeId,
        },
      },
      {
        id: ctx.assetId2,
        entity: 'asset',
        operation: 'create',
        payload: {
          name: 'Offline Vent Fan 202',
          siteId: ctx.testSiteId,
          assetTypeId: ctx.testTypeId,
        },
      },
      {
        id: ctx.assetId1,
        entity: 'asset',
        operation: 'update',
        payload: {
          name: 'Offline Generator 101 (Upgraded via Sync)',
        },
      },
    ],
  };

  const syncRes = await post('/sync/batch', batch1, ctx.adminToken);
  assertSuccess(syncRes.status === 200 && !!syncRes.data.success, `❌ Fail: Batch sync request failed. Status: ${syncRes.status}`);

  console.log("Sync response results:");
  console.log(JSON.stringify(syncRes.data.results, null, 2));

  const results = syncRes.data.results;
  const hasOp1 = findSuccessOp(results, ctx.assetId1);
  const hasOp2 = findSuccessOp(results, ctx.assetId2);
  const allProcessed = syncRes.data.processedCount === 3;

  assertSuccess(hasOp1 && hasOp2 && allProcessed, `❌ Fail: Queue did not process all operations cleanly. processedCount: ${syncRes.data.processedCount}`);

  return batch1;
}

async function verifyIdempotency(batch: any, ctx: TestContext): Promise<void> {
  console.log("\nTest 3: Verify Idempotency (resending same batch, should return success and identify as idempotent)...");
  const syncResDup = await post('/sync/batch', batch, ctx.adminToken);

  assertSuccess(syncResDup.status === 200 && !!syncResDup.data.success, `❌ Fail: Duplicate batch sync request failed. Status: ${syncResDup.status}`);

  console.log("Duplicate Sync response results:");
  console.log(JSON.stringify(syncResDup.data.results, null, 2));

  const resultsDup = syncResDup.data.results;
  const isOp1Idempotent = hasIdempotentMsg(resultsDup, ctx.assetId1);
  const isOp2Idempotent = hasIdempotentMsg(resultsDup, ctx.assetId2);

  assertSuccess(isOp1Idempotent && isOp2Idempotent, "❌ Fail: Idempotency check failed. One or more duplicate operations returned unexpected results.");
}

async function verifyDbState(ctx: TestContext): Promise<void> {
  console.log("\nTest 4: Verify physical DB state (fetching registry assets)...");
  const assetsRes = await get('/assets', ctx.adminToken);
  const dbAssets = assetsRes.data;

  const dbAsset1 = dbAssets.find((a: any) => a.id === ctx.assetId1);
  const dbAsset2 = dbAssets.find((a: any) => a.id === ctx.assetId2);

  assertSuccess(!!dbAsset1, "❌ Fail: Asset 1 not found in DB.");
  assertSuccess(dbAsset1.name === 'Offline Generator 101 (Upgraded via Sync)', `❌ Fail: Asset 1 name mismatch. Found: ${dbAsset1.name}`);

  assertSuccess(!!dbAsset2, "❌ Fail: Asset 2 not found in DB.");
  assertSuccess(dbAsset2.name === 'Offline Vent Fan 202', `❌ Fail: Asset 2 name mismatch. Found: ${dbAsset2.name}`);
}

async function testDeleteOperations(ctx: TestContext): Promise<any> {
  console.log("\nTest 5: Verify delete operation in sync batch...");
  const deleteBatch = {
    operations: [
      {
        id: ctx.assetId1,
        entity: 'asset',
        operation: 'delete',
        payload: {},
      },
      {
        id: ctx.assetId2,
        entity: 'asset',
        operation: 'delete',
        payload: {},
      },
    ],
  };

  const deleteSyncRes = await post('/sync/batch', deleteBatch, ctx.adminToken);
  if (deleteSyncRes.status === 200 && deleteSyncRes.data.success) {
    console.log("✅ Success: Assets queued for deletion deleted successfully.");
  } else {
    console.error("❌ Fail: Delete sync operation failed:", deleteSyncRes.data);
    process.exit(1);
  }

  return deleteBatch;
}

async function verifyDeleteIdempotency(deleteBatch: any, ctx: TestContext): Promise<void> {
  console.log("\nTest 6: Verify delete operation idempotency (sending deletes again)...");
  const deleteSyncResDup = await post('/sync/batch', deleteBatch, ctx.adminToken);
  const delOp1Dup = deleteSyncResDup.data.results.find((r: any) => r.id === ctx.assetId1);
  if (delOp1Dup && delOp1Dup.message && delOp1Dup.message.includes('idempotent')) {
    console.log("✅ Success: Deletion reconciliation is fully idempotent.");
  } else {
    console.error("❌ Fail: Deletion idempotency check failed:", delOp1Dup);
    process.exit(1);
  }
}

async function runSyncTests() {
  console.log("=== STARTING IDEMPOTENT SYNC RECONCILIATION VERIFICATION TESTS ===");

  const adminToken = await obtainAdminToken();
  const meta = await fetchMetadata(adminToken);

  const ctx: TestContext = {
    adminToken,
    testSiteId: meta.testSiteId,
    testTypeId: meta.testTypeId,
    assetId1: generateUUID(),
    assetId2: generateUUID(),
    assetId3: generateUUID(),
  };

  console.log(`Generated Test Client UUIDs: \n  - Asset 1: ${ctx.assetId1}\n  - Asset 2: ${ctx.assetId2}\n  - Asset 3: ${ctx.assetId3}`);

  const batch1 = await sendBatchSync(ctx);
  await verifyIdempotency(batch1, ctx);
  await verifyDbState(ctx);
  
  const deleteBatch = await testDeleteOperations(ctx);
  await verifyDeleteIdempotency(deleteBatch, ctx);

  console.log("\n=== IDEMPOTENT SYNC RECONCILIATION VERIFICATION TESTS COMPLETED ===");
}

runSyncTests().catch(console.error);
