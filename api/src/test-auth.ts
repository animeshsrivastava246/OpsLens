import 'dotenv/config';
import { get, post } from './test-helpers';

async function testInvalidLogin(): Promise<void> {
  console.log("\nTest 1: Login with invalid password...");
  const invalidLogin = await post('/auth/login', {
    email: 'worker@acme.com',
    password: 'wrongpassword',
  });
  if (invalidLogin.status === 401) {
    console.log("✅ Success: Invalid login rejected with status 401.");
  } else {
    console.error("❌ Fail: Expected status 401, got:", invalidLogin.status);
  }
}

async function testWorkerLogin(): Promise<string> {
  console.log("\nTest 2: Login as Acme Field Worker...");
  const workerLogin = await post('/auth/login', {
    email: 'worker@acme.com',
    password: 'worker123',
  });
  if (workerLogin.status === 200 && workerLogin.data.token) {
    console.log("✅ Success: Login successful. JWT token issued.");
    console.log(`   User: ${workerLogin.data.user.name}, Role: ${workerLogin.data.user.role}, Org: ${workerLogin.data.user.organization.name}`);
    return workerLogin.data.token;
  }
  console.error("❌ Fail: Login failed. Data:", workerLogin.data);
  process.exit(1);
}

async function testAdminLogin(): Promise<string> {
  console.log("\nTest 3: Login as Acme Admin...");
  const adminLogin = await post('/auth/login', {
    email: 'admin@acme.com',
    password: 'admin123',
  });
  if (adminLogin.status === 200 && adminLogin.data.token) {
    console.log("✅ Success: Admin login successful.");
    return adminLogin.data.token;
  }
  console.error("❌ Fail: Admin Login failed. Data:", adminLogin.data);
  process.exit(1);
}

async function testHealthWorkerLogin(): Promise<string> {
  console.log("\nTest 4: Login as Global Health Worker...");
  const healthWorkerLogin = await post('/auth/login', {
    email: 'worker@globalhealth.com',
    password: 'worker123',
  });
  if (healthWorkerLogin.status === 200 && healthWorkerLogin.data.token) {
    console.log("✅ Success: Global Health Worker login successful.");
    return healthWorkerLogin.data.token;
  }
  console.error("❌ Fail: Global Health Worker Login failed. Data:", healthWorkerLogin.data);
  process.exit(1);
}

async function testProfile(workerToken: string): Promise<void> {
  console.log("\nTest 5: Retrieve user profile /me...");
  const profile = await get('/me', workerToken);
  if (profile.status === 200 && profile.data.user.email === 'worker@acme.com') {
    console.log("✅ Success: User profile retrieved successfully.");
  } else {
    console.error("❌ Fail: Profile check failed. Data:", profile.data);
  }
}

async function testAcmeAssets(workerToken: string): Promise<void> {
  console.log("\nTest 6: Retrieve assets as Acme Worker (should see Acme assets)...");
  const acmeAssets = await get('/test/tenant-isolation', workerToken);
  if (acmeAssets.status === 200) {
    console.log(`✅ Success: Retrieved ${acmeAssets.data.assetsCount} assets.`);
    console.log("   Assets:", acmeAssets.data.assets.map((a: any) => a.name));
  } else {
    console.error("❌ Fail: Failed to fetch assets. Data:", acmeAssets.data);
  }
}

async function testHealthAssets(healthWorkerToken: string): Promise<void> {
  console.log("\nTest 7: Retrieve assets as Global Health Worker (should see 0 assets)...");
  const healthAssets = await get('/test/tenant-isolation', healthWorkerToken);
  if (healthAssets.status === 200 && healthAssets.data.assetsCount === 0) {
    console.log("✅ Success: RLS isolated correctly! Global Health user saw 0 Acme assets.");
  } else {
    console.error("❌ Fail: Tenant isolation failed. Global Health worker retrieved assets:", healthAssets.data);
  }
}

async function testAdminAccess(adminToken: string): Promise<void> {
  console.log("\nTest 8: Access admin-only route as Admin...");
  const adminAccess = await get('/test/admin-only', adminToken);
  if (adminAccess.status === 200) {
    console.log("✅ Success: Admin granted access.");
  } else {
    console.error("❌ Fail: Access denied for Admin. Data:", adminAccess.data);
  }
}

async function testWorkerAccess(workerToken: string): Promise<void> {
  console.log("\nTest 9: Access admin-only route as Worker (should block)...");
  const workerAccess = await get('/test/admin-only', workerToken);
  if (workerAccess.status === 403) {
    console.log("✅ Success: Worker blocked from admin route with status 403.");
  } else {
    console.error("❌ Fail: Expected status 403, got:", workerAccess.status);
  }
}

async function runTests() {
  console.log("=== STARTING AUTH & TENANCY VERIFICATION TESTS ===");

  await testInvalidLogin();
  const workerToken = await testWorkerLogin();
  const adminToken = await testAdminLogin();
  const healthWorkerToken = await testHealthWorkerLogin();

  await testProfile(workerToken);
  await testAcmeAssets(workerToken);
  await testHealthAssets(healthWorkerToken);
  await testAdminAccess(adminToken);
  await testWorkerAccess(workerToken);

  console.log("\n=== VERIFICATION COMPLETED ===");
}

runTests().catch(console.error);
