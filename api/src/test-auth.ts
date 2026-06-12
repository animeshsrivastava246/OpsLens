import 'dotenv/config';

async function runTests() {
  console.log("=== STARTING AUTH & TENANCY VERIFICATION TESTS ===");

  const baseUrl = 'http://localhost:3000';

  // Helper for requests
  const post = async (path: string, body: any) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json()) as any };
  };

  const get = async (path: string, token?: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    return { status: res.status, data: (await res.json()) as any };
  };

  let workerToken = '';
  let adminToken = '';
  let healthWorkerToken = '';

  // Test 1: Invalid Login
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

  // Test 2: Successful Login (Worker)
  console.log("\nTest 2: Login as Acme Field Worker...");
  const workerLogin = await post('/auth/login', {
    email: 'worker@acme.com',
    password: 'worker123',
  });
  if (workerLogin.status === 200 && workerLogin.data.token) {
    workerToken = workerLogin.data.token;
    console.log("✅ Success: Login successful. JWT token issued.");
    console.log(`   User: ${workerLogin.data.user.name}, Role: ${workerLogin.data.user.role}, Org: ${workerLogin.data.user.organization.name}`);
  } else {
    console.error("❌ Fail: Login failed. Data:", workerLogin.data);
  }

  // Test 3: Successful Login (Admin)
  console.log("\nTest 3: Login as Acme Admin...");
  const adminLogin = await post('/auth/login', {
    email: 'admin@acme.com',
    password: 'admin123',
  });
  if (adminLogin.status === 200 && adminLogin.data.token) {
    adminToken = adminLogin.data.token;
    console.log("✅ Success: Admin login successful.");
  }

  // Test 4: Successful Login (Global Health Worker)
  console.log("\nTest 4: Login as Global Health Worker...");
  const healthWorkerLogin = await post('/auth/login', {
    email: 'worker@globalhealth.com',
    password: 'worker123',
  });
  if (healthWorkerLogin.status === 200 && healthWorkerLogin.data.token) {
    healthWorkerToken = healthWorkerLogin.data.token;
    console.log("✅ Success: Global Health Worker login successful.");
  }

  // Test 5: Verify /me profile
  console.log("\nTest 5: Retrieve user profile /me...");
  const profile = await get('/me', workerToken);
  if (profile.status === 200 && profile.data.user.email === 'worker@acme.com') {
    console.log("✅ Success: User profile retrieved successfully.");
  } else {
    console.error("❌ Fail: Profile check failed. Data:", profile.data);
  }

  // Test 6: Verify Tenant Isolation (Acme Worker)
  console.log("\nTest 6: Retrieve assets as Acme Worker (should see Acme assets)...");
  const acmeAssets = await get('/test/tenant-isolation', workerToken);
  if (acmeAssets.status === 200) {
    console.log(`✅ Success: Retrieved ${acmeAssets.data.assetsCount} assets.`);
    console.log("   Assets:", acmeAssets.data.assets.map((a: any) => a.name));
  } else {
    console.error("❌ Fail: Failed to fetch assets. Data:", acmeAssets.data);
  }

  // Test 7: Verify Tenant Isolation (Global Health Worker - should NOT see Acme assets)
  console.log("\nTest 7: Retrieve assets as Global Health Worker (should see 0 assets)...");
  const healthAssets = await get('/test/tenant-isolation', healthWorkerToken);
  if (healthAssets.status === 200 && healthAssets.data.assetsCount === 0) {
    console.log("✅ Success: RLS isolated correctly! Global Health user saw 0 Acme assets.");
  } else {
    console.error("❌ Fail: Tenant isolation failed. Global Health worker retrieved assets:", healthAssets.data);
  }

  // Test 8: Verify Role Guards (Admin route - should allow Admin)
  console.log("\nTest 8: Access admin-only route as Admin...");
  const adminAccess = await get('/test/admin-only', adminToken);
  if (adminAccess.status === 200) {
    console.log("✅ Success: Admin granted access.");
  } else {
    console.error("❌ Fail: Access denied for Admin. Data:", adminAccess.data);
  }

  // Test 9: Verify Role Guards (Admin route - should block Worker)
  console.log("\nTest 9: Access admin-only route as Worker (should block)...");
  const workerAccess = await get('/test/admin-only', workerToken);
  if (workerAccess.status === 403) {
    console.log("✅ Success: Worker blocked from admin route with status 403.");
  } else {
    console.error("❌ Fail: Expected status 403, got:", workerAccess.status);
  }

  console.log("\n=== VERIFICATION COMPLETED ===");
}

runTests().catch(console.error);
