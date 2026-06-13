import 'dotenv/config';
import { get, post, patch, del } from './test-helpers';

async function runRegistryTests() {
  console.log("=== STARTING ASSET REGISTRY VERIFICATION TESTS ===");

  // Obtain login tokens
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

  // 1. Fetch sites and asset types to get valid IDs
  console.log("\nTest 1: Fetching sites and asset types...");
  const sitesRes = await get('/sites', workerToken);
  const typesRes = await get('/asset-types', workerToken);

  if (sitesRes.status !== 200 || typesRes.status !== 200) {
    console.error("❌ Fail: Could not fetch sites or asset types", sitesRes.status, typesRes.status);
    process.exit(1);
  }

  const sites = sitesRes.data;
  const types = typesRes.data;
  console.log(`✅ Success: Found ${sites.length} sites and ${types.length} asset types.`);
  const testSiteId = sites[0]?.id;
  const testTypeId = types[0]?.id;

  if (!testSiteId || !testTypeId) {
    console.error("❌ Fail: Seeding is incomplete; no sites or asset types found.");
    process.exit(1);
  }

  // 2. Retrieve assets as Acme Worker
  console.log("\nTest 2: Retrieve assets as Acme Worker (should see Acme assets)...");
  const acmeAssets = await get('/assets', workerToken);
  if (acmeAssets.status === 200) {
    console.log(`✅ Success: Retrieved ${acmeAssets.data.length} assets.`);
    console.log("   Assets:", acmeAssets.data.map((a: any) => a.name));
  } else {
    console.error("❌ Fail: Failed to fetch assets. Status:", acmeAssets.status);
  }

  // 3. Retrieve assets as Global Health Worker (should see 0)
  console.log("\nTest 3: Retrieve assets as Global Health Worker (should see 0 assets)...");
  const ghAssets = await get('/assets', ghWorkerToken);
  if (ghAssets.status === 200 && ghAssets.data.length === 0) {
    console.log("✅ Success: Tenant isolation working! Global Health saw 0 Acme assets.");
  } else {
    console.error("❌ Fail: Tenant isolation failed or returned error. Status:", ghAssets.status, "Count:", ghAssets.data?.length);
  }

  // 4. Resolve seeded asset via scan code (using UUID of the seeded asset)
  const seededAsset = acmeAssets.data[0];
  if (seededAsset) {
    console.log(`\nTest 4: Resolve seeded asset '${seededAsset.name}' via QR scan endpoint /assets/scan/:code...`);
    const scanRes = await get(`/assets/scan/${seededAsset.id}`, workerToken);
    if (scanRes.status === 200 && scanRes.data.id === seededAsset.id) {
      console.log(`✅ Success: Asset resolved correctly! Name: ${scanRes.data.name}, Site: ${scanRes.data.site.name}`);
    } else {
      console.error("❌ Fail: Failed to resolve asset. Status:", scanRes.status, scanRes.data);
    }

    console.log(`\nTest 5: Cross-tenant QR scan resolution check (Global Health worker scanning Acme asset)...`);
    const ghScanRes = await get(`/assets/scan/${seededAsset.id}`, ghWorkerToken);
    if (ghScanRes.status === 404) {
      console.log("✅ Success: Blocked. Global Health worker got 404 (not found / not authorized) for Acme asset.");
    } else {
      console.error("❌ Fail: Expected 404, got:", ghScanRes.status, ghScanRes.data);
    }
  } else {
    console.warn("⚠️ Warning: No seeded assets found to run resolve tests.");
  }

  // 6. Create asset as Worker (should be blocked)
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

  // 7. Create asset as Admin (should succeed)
  console.log("\nTest 7: Create asset as Acme Admin (should succeed)...");
  const newAssetRes = await post('/assets', {
    name: 'Ventilation Fan 05',
    siteId: testSiteId,
    assetTypeId: testTypeId
  }, adminToken);

  let newAssetId = '';
  if (newAssetRes.status === 201 && newAssetRes.data.id) {
    newAssetId = newAssetRes.data.id;
    console.log(`✅ Success: Asset '${newAssetRes.data.name}' created with ID ${newAssetId}`);
  } else {
    console.error("❌ Fail: Asset creation failed. Status:", newAssetRes.status, newAssetRes.data);
    process.exit(1);
  }

  // 8. Update asset as Admin
  console.log("\nTest 8: Update asset as Acme Admin (should succeed)...");
  const updateRes = await patch(`/assets/${newAssetId}`, {
    name: 'Ventilation Fan 05 (Upgraded)'
  }, adminToken);

  if (updateRes.status === 200 && updateRes.data.name === 'Ventilation Fan 05 (Upgraded)') {
    console.log("✅ Success: Asset updated successfully.");
  } else {
    console.error("❌ Fail: Update failed. Status:", updateRes.status, updateRes.data);
  }

  // 9. Retrieve updated asset
  console.log("\nTest 9: Retrieve the updated asset...");
  const getRes = await get(`/assets/${newAssetId}`, workerToken);
  if (getRes.status === 200 && getRes.data.name === 'Ventilation Fan 05 (Upgraded)') {
    console.log(`✅ Success: Retrieved asset detail. Name: ${getRes.data.name}`);
  } else {
    console.error("❌ Fail: Failed to retrieve asset. Status:", getRes.status, getRes.data);
  }

  // 10. Delete asset as Admin
  console.log("\nTest 10: Delete asset as Acme Admin...");
  const deleteRes = await del(`/assets/${newAssetId}`, adminToken);
  if (deleteRes.status === 200) {
    console.log("✅ Success: Asset deleted successfully.");
  } else {
    console.error("❌ Fail: Delete failed. Status:", deleteRes.status, deleteRes.data);
  }

  // 11. Verify deleted asset is gone
  console.log("\nTest 11: Verify deleted asset is no longer accessible...");
  const verifyDeleted = await get(`/assets/${newAssetId}`, workerToken);
  if (verifyDeleted.status === 404) {
    console.log("✅ Success: Asset confirmed deleted (returned 404).");
  } else {
    console.error("❌ Fail: Expected 404, got:", verifyDeleted.status, verifyDeleted.data);
  }

  console.log("\n=== REGISTRY VERIFICATION TESTS COMPLETED ===");
}

runRegistryTests().catch(console.error);
