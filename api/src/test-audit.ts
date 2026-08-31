import 'dotenv/config';
import { get, post, patch, del, fetchTestMetadata } from './test-helpers';
import { prisma } from './db';

async function obtainWorkerToken() {
  const res = await post('/auth/login', { email: 'worker@acme.com', password: 'worker123' });
  return {
    token: res.data.token,
    user: res.data.user,
  };
}

async function obtainAdminToken() {
  const res = await post('/auth/login', { email: 'admin@acme.com', password: 'admin123' });
  return {
    token: res.data.token,
    user: res.data.user,
  };
}

async function runAuditPipelineTests() {
  console.log("=== STARTING STAGE 3.2 AUDIT PIPELINE & EVENT SOURCING TESTS ===");

  const { token: adminToken, user: adminUser } = await obtainAdminToken();
  const { token: workerToken, user: workerUser } = await obtainWorkerToken();

  // Test 1: Create an entity (Asset) and verify automatic audit log creation
  console.log("\nTest 1: Creating Asset to test automatic CREATE audit logging...");
  const meta = await fetchTestMetadata(adminToken);
  const siteId = meta.siteId;
  const typeId = meta.assetTypeId;

  const testAssetName = `Audit Test Pump ${Date.now()}`;
  const createAssetRes = await post('/assets', {
    name: testAssetName,
    siteId,
    assetTypeId: typeId,
  }, adminToken);

  if (createAssetRes.status !== 201) {
    console.error("❌ Fail: Failed to create asset:", createAssetRes.data);
    process.exit(1);
  }
  const assetId = createAssetRes.data.id;
  console.log(`✅ Success: Asset created with ID: ${assetId}`);

  // Allow async audit log write
  await new Promise((r) => setTimeout(r, 200));

  // Test 2: Verify audit log for CREATE operation
  console.log("\nTest 2: Verifying CREATE audit log entry with null oldState and populated newState...");
  const createLogsRes = await get(`/audit-logs/entity/Asset/${assetId}`, adminToken);
  if (createLogsRes.status === 200 && createLogsRes.data.timelineCount >= 1) {
    const log = createLogsRes.data.history[0];
    if (log.action.includes('CREATE') && log.oldState === null && log.newState?.name === testAssetName) {
      console.log("✅ Success: CREATE audit log correctly captured with null oldState and newState.");
      console.log(`   Action: ${log.action}, Actor: ${log.actorId}, Entity: ${log.entity}`);
    } else {
      console.error("❌ Fail: Unexpected CREATE log state:", log);
      process.exit(1);
    }
  } else {
    console.error("❌ Fail: Audit timeline empty for created asset:", createLogsRes.data);
    process.exit(1);
  }

  // Test 3: Update entity and verify diff state capture
  console.log("\nTest 3: Updating Asset to verify UPDATE audit log with state diffs...");
  const updatedName = `${testAssetName} (Audited Revision)`;
  const updateRes = await patch(`/assets/${assetId}`, { name: updatedName }, adminToken);
  if (updateRes.status !== 200) {
    console.error("❌ Fail: Update asset failed:", updateRes.data);
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 200));

  const updateTimelineRes = await get(`/audit-logs/entity/Asset/${assetId}`, adminToken);
  if (updateTimelineRes.status === 200 && updateTimelineRes.data.timelineCount >= 2) {
    const updateLog = updateTimelineRes.data.history[1];
    if (
      updateLog.action.includes('UPDATE') &&
      updateLog.oldState?.name === testAssetName &&
      updateLog.newState?.name === updatedName
    ) {
      console.log("✅ Success: UPDATE audit log recorded accurate before/after state diff!");
      console.log(`   Old Name: "${updateLog.oldState.name}" -> New Name: "${updateLog.newState.name}"`);
    } else {
      console.error("❌ Fail: UPDATE log diff mismatch:", updateLog);
      process.exit(1);
    }
  } else {
    console.error("❌ Fail: Failed to find update audit log entry:", updateTimelineRes.data);
    process.exit(1);
  }

  // Test 4: Delete entity and verify DELETE audit log
  console.log("\nTest 4: Deleting Asset to verify DELETE audit log with null newState...");
  const deleteRes = await del(`/assets/${assetId}`, adminToken);
  if (deleteRes.status !== 200) {
    console.error("❌ Fail: Delete asset failed:", deleteRes.data);
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 200));

  const deleteTimelineRes = await get(`/audit-logs/entity/Asset/${assetId}`, adminToken);
  if (deleteTimelineRes.status === 200 && deleteTimelineRes.data.timelineCount >= 3) {
    const deleteLog = deleteTimelineRes.data.history[2];
    if (deleteLog.action.includes('DELETE') && deleteLog.oldState?.name === updatedName && deleteLog.newState === null) {
      console.log("✅ Success: DELETE audit log recorded oldState and set newState to null.");
    } else {
      console.error("❌ Fail: DELETE log state mismatch:", deleteLog);
      process.exit(1);
    }
  } else {
    console.error("❌ Fail: Failed to find delete audit log entry:", deleteTimelineRes.data);
    process.exit(1);
  }

  // Test 5: Query audit trail list via GET /audit-logs with pagination and filtering
  console.log("\nTest 5: Querying GET /audit-logs with entity and action filters...");
  const listRes = await get('/audit-logs?entity=Asset&limit=5', adminToken);
  if (listRes.status === 200 && Array.isArray(listRes.data.logs)) {
    console.log(`✅ Success: Retrieved ${listRes.data.logs.length} audit logs (Total: ${listRes.data.total}).`);
  } else {
    console.error("❌ Fail: Failed to list audit logs:", listRes.data);
    process.exit(1);
  }

  // Test 6: Verify password redaction in user mutations
  console.log("\nTest 6: Verifying sensitive data (password) redaction in audit logs...");
  const testEmail = `audittest_${Date.now()}@acme.com`;
  const registerRes = await post('/auth/register', {
    name: 'Audited Worker',
    email: testEmail,
    password: 'SuperSecretPassword123',
    role: 'field-worker',
    organizationName: 'Acme Industrial',
  });

  if (registerRes.status === 201) {
    await new Promise((r) => setTimeout(r, 200));
    const userLogRes = await get(`/audit-logs/entity/User/${registerRes.data.user.id}`, adminToken);
    if (userLogRes.status === 200 && userLogRes.data.timelineCount >= 1) {
      const userLog = userLogRes.data.history[0];
      if (userLog.newState?.passwordHash === '[REDACTED]') {
        console.log("✅ Success: Sensitive passwordHash successfully redacted to [REDACTED].");
      } else {
        console.error("❌ Fail: Sensitive password was not redacted:", userLog.newState);
        process.exit(1);
      }
    }
  }

  console.log("\n=== STAGE 3.2 AUDIT PIPELINE & EVENT SOURCING TESTS PASSED SUCCESSFULLY ===");
}

runAuditPipelineTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
