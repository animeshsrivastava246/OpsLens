import 'dotenv/config';
import { get, post, patch, del, fetchTestMetadata } from './test-helpers';

interface TestContext {
  workerToken: string;
  adminToken: string;
  ghWorkerToken: string;
  testSiteId: string;
  testTypeId: string;
}

async function obtainTokens(): Promise<Partial<TestContext>> {
  console.log("Obtaining user tokens...");
  const workerRes = await post('/auth/login', { email: 'worker@acme.com', password: 'worker123' });
  const adminRes = await post('/auth/login', { email: 'admin@acme.com', password: 'admin123' });
  const ghWorkerRes = await post('/auth/login', { email: 'worker@globalhealth.com', password: 'worker123' });

  const workerToken = workerRes.data.token;
  const adminToken = adminRes.data.token;
  const ghWorkerToken = ghWorkerRes.data.token;

  if (!workerToken || !adminToken || !ghWorkerToken) {
    throw new Error("Failed to authenticate test users.");
  }

  return { workerToken, adminToken, ghWorkerToken };
}

async function fetchMetadata(workerToken: string): Promise<{ testSiteId: string; testTypeId: string }> {
  console.log("\nTest 1: Fetching sites and asset types...");
  try {
    const meta = await fetchTestMetadata(workerToken);
    console.log(`✅ Success: Found ${meta.sitesCount} sites and ${meta.typesCount} asset types.`);
    return { testSiteId: meta.siteId, testTypeId: meta.assetTypeId };
  } catch (err: any) {
    console.error("❌ Fail: Could not fetch sites or asset types:", err.message);
    process.exit(1);
  }
}

async function retrieveAcmeAssets(workerToken: string): Promise<any[]> {
  console.log("\nTest 2: Retrieve assets as Acme Worker (should see Acme assets)...");
  const acmeAssets = await get('/assets', workerToken);
  if (acmeAssets.status === 200) {
    console.log(`✅ Success: Retrieved ${acmeAssets.data.length} assets.`);
    console.log("   Assets:", acmeAssets.data.map((a: any) => a.name));
    return acmeAssets.data;
  }
  console.error("❌ Fail: Failed to fetch assets. Status:", acmeAssets.status);
  return [];
}

async function retrieveGhAssets(ghWorkerToken: string): Promise<void> {
  console.log("\nTest 3: Retrieve assets as Global Health Worker (should see 0 assets)...");
  const ghAssets = await get('/assets', ghWorkerToken);
  if (ghAssets.status === 200 && ghAssets.data.length === 0) {
    console.log("✅ Success: Tenant isolation working! Global Health saw 0 Acme assets.");
  } else {
    console.error("❌ Fail: Tenant isolation failed or returned error. Status:", ghAssets.status, "Count:", ghAssets.data?.length);
  }
}

function verifyCondition(condition: boolean, successMsg: string, failMsg: string) {
  if (condition) {
    console.log(successMsg);
  } else {
    console.error(failMsg);
  }
}

function checkScanResult(scanRes: any, expectedId: string): boolean {
  if (scanRes.status !== 200) return false;
  if (!scanRes.data) return false;
  return scanRes.data.id === expectedId;
}

async function resolveSeededAsset(seededAsset: any, workerToken: string, ghWorkerToken: string): Promise<void> {
  if (!seededAsset) {
    console.warn("⚠️ Warning: No seeded assets found to run resolve tests.");
    return;
  }

  console.log(`\nTest 4: Resolve seeded asset '${seededAsset.name}' via QR scan endpoint /assets/scan/:code...`);
  const scanRes = await get(`/assets/scan/${seededAsset.id}`, workerToken);
  const okScan = checkScanResult(scanRes, seededAsset.id);
  if (okScan) {
    console.log(`✅ Success: Asset resolved correctly! Name: ${scanRes.data.name}, Site: ${scanRes.data.site.name}`);
  } else {
    console.error(`❌ Fail: Failed to resolve asset. Status: ${scanRes.status}`);
  }

  console.log(`\nTest 5: Cross-tenant QR scan resolution check (Global Health worker scanning Acme asset)...`);
  const ghScanRes = await get(`/assets/scan/${seededAsset.id}`, ghWorkerToken);
  verifyCondition(
    ghScanRes.status === 404,
    "✅ Success: Blocked. Global Health worker got 404 (not found / not authorized) for Acme asset.",
    `❌ Fail: Expected 404, got: ${ghScanRes.status}`
  );
}

async function createAssetBlocked(testSiteId: string, testTypeId: string, workerToken: string): Promise<void> {
  console.log("\nTest 6: Create asset as Acme Field Worker (should be forbidden)...");
  const failCreate = await post('/assets', {
    name: 'Forbidden Generator',
    siteId: testSiteId,
    assetTypeId: testTypeId
  }, workerToken);

  if (failCreate.status === 403) {
    console.log("✅ Success: Worker forbidden from creating assets.");
  } else {
    console.error("❌ Fail: Expected 403, got:", failCreate.status, failCreate.data);
  }
}

async function createAssetAdmin(testSiteId: string, testTypeId: string, adminToken: string): Promise<string> {
  console.log("\nTest 7: Create asset as Acme Admin (should succeed)...");
  const newAssetRes = await post('/assets', {
    name: 'Ventilation Fan 05',
    siteId: testSiteId,
    assetTypeId: testTypeId
  }, adminToken);

  if (newAssetRes.status === 201 && newAssetRes.data.id) {
    console.log(`✅ Success: Asset '${newAssetRes.data.name}' created with ID ${newAssetRes.data.id}`);
    return newAssetRes.data.id;
  }
  console.error("❌ Fail: Asset creation failed. Status:", newAssetRes.status, newAssetRes.data);
  process.exit(1);
}

async function updateAssetAdmin(newAssetId: string, adminToken: string): Promise<void> {
  console.log("\nTest 8: Update asset as Acme Admin (should succeed)...");
  const updateRes = await patch(`/assets/${newAssetId}`, {
    name: 'Ventilation Fan 05 (Upgraded)'
  }, adminToken);

  if (updateRes.status === 200 && updateRes.data.name === 'Ventilation Fan 05 (Upgraded)') {
    console.log("✅ Success: Asset updated successfully.");
  } else {
    console.error("❌ Fail: Update failed. Status:", updateRes.status, updateRes.data);
  }
}

async function retrieveUpdatedAsset(newAssetId: string, workerToken: string): Promise<void> {
  console.log("\nTest 9: Retrieve the updated asset...");
  const getRes = await get(`/assets/${newAssetId}`, workerToken);
  if (getRes.status === 200 && getRes.data.name === 'Ventilation Fan 05 (Upgraded)') {
    console.log(`✅ Success: Retrieved asset detail. Name: ${getRes.data.name}`);
  } else {
    console.error("❌ Fail: Failed to retrieve asset. Status:", getRes.status, getRes.data);
  }
}

async function deleteAssetAdmin(newAssetId: string, adminToken: string): Promise<void> {
  console.log("\nTest 10: Delete asset as Acme Admin...");
  const deleteRes = await del(`/assets/${newAssetId}`, adminToken);
  if (deleteRes.status === 200) {
    console.log("✅ Success: Asset deleted successfully.");
  } else {
    console.error("❌ Fail: Delete failed. Status:", deleteRes.status, deleteRes.data);
  }
}

async function verifyAssetDeleted(newAssetId: string, workerToken: string): Promise<void> {
  console.log("\nTest 11: Verify deleted asset is no longer accessible...");
  const verifyDeleted = await get(`/assets/${newAssetId}`, workerToken);
  if (verifyDeleted.status === 404) {
    console.log("✅ Success: Asset confirmed deleted (returned 404).");
  } else {
    console.error("❌ Fail: Expected 404, got:", verifyDeleted.status, verifyDeleted.data);
  }
}

async function runRegistryTests() {
  console.log("=== STARTING ASSET REGISTRY VERIFICATION TESTS ===");

  const tokens = await obtainTokens();
  const workerToken = tokens.workerToken!;
  const adminToken = tokens.adminToken!;
  const ghWorkerToken = tokens.ghWorkerToken!;

  const meta = await fetchMetadata(workerToken);
  const acmeAssets = await retrieveAcmeAssets(workerToken);
  await retrieveGhAssets(ghWorkerToken);
  
  if (acmeAssets.length > 0) {
    await resolveSeededAsset(acmeAssets[0], workerToken, ghWorkerToken);
  }
  
  await createAssetBlocked(meta.testSiteId, meta.testTypeId, workerToken);
  const newAssetId = await createAssetAdmin(meta.testSiteId, meta.testTypeId, adminToken);
  
  await updateAssetAdmin(newAssetId, adminToken);
  await retrieveUpdatedAsset(newAssetId, workerToken);
  await deleteAssetAdmin(newAssetId, adminToken);
  await verifyAssetDeleted(newAssetId, workerToken);

  console.log("\n=== REGISTRY VERIFICATION TESTS COMPLETED ===");
}

runRegistryTests().catch(console.error);
