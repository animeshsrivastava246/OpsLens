import 'dotenv/config';
import { get, post, fetchTestMetadata } from './test-helpers';
import crypto from 'crypto';

interface TestContext {
  workerToken: string;
  adminToken: string;
  ghWorkerToken: string;
  assetId: string;
}

async function obtainTokens(): Promise<Partial<TestContext>> {
  console.log("Obtaining user tokens...");
  const workerRes = await post('/auth/login', { email: 'worker@acme.com', password: 'worker123' });
  const adminRes = await post('/auth/login', { email: 'admin@acme.com', password: 'admin123' });
  const ghWorkerRes = await post('/auth/login', { email: 'worker@globalhealth.com', password: 'worker123' });
  return {
    workerToken: workerRes.data.token,
    adminToken: adminRes.data.token,
    ghWorkerToken: ghWorkerRes.data.token,
  };
}

async function runIncidentTests() {
  console.log("=== STARTING INCIDENT WORKFLOW VERIFICATION TESTS ===");

  const tokens = await obtainTokens();
  const workerToken = tokens.workerToken!;
  const adminToken = tokens.adminToken!;
  const ghWorkerToken = tokens.ghWorkerToken!;

  // Fetch meta to resolve an assetId
  const assetsRes = await get('/assets', workerToken);
  if (assetsRes.status !== 200 || assetsRes.data.length === 0) {
    console.error("❌ Fail: Seeded assets not found.");
    process.exit(1);
  }
  const assetId = assetsRes.data[0].id;

  // Test 1: Upload media binary
  console.log("\nTest 1: Uploading binary media evidence...");
  const dummyBuffer = Buffer.from("dummy-image-binary-data");
  
  // Custom fetch to POST raw binary body
  const uploadRes = await fetch("http://localhost:3000/media/upload", {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      "Authorization": `Bearer ${workerToken}`
    },
    body: dummyBuffer
  });

  if (uploadRes.status !== 200) {
    console.error("❌ Fail: Media upload failed with status:", uploadRes.status);
    process.exit(1);
  }

  const uploadData = (await uploadRes.json()) as any;
  const uploadedUrl = uploadData.url;
  if (uploadedUrl && uploadedUrl.includes("opslens-assets.s3.amazonaws.com/uploads/")) {
    console.log("✅ Success: Media uploaded successfully. Mock S3 URL:", uploadedUrl);
  } else {
    console.error("❌ Fail: Invalid upload response:", uploadData);
    process.exit(1);
  }

  // Test 2: Create incident with uploaded media URL
  console.log("\nTest 2: Creating new incident with severity critical and photo attachment...");
  const incidentId = crypto.randomUUID();
  const createRes = await post('/incidents', {
    id: incidentId,
    title: "Generator Coolant Leak",
    description: "Coolant level dropped below 20%. Secondary pump sputtering.",
    severity: "critical",
    assetId,
    attachments: [
      { id: crypto.randomUUID(), url: uploadedUrl }
    ]
  }, workerToken);

  if (createRes.status === 201) {
    console.log("✅ Success: Incident created successfully with critical status.");
    console.log("   Incident Details: Title:", createRes.data.title, ", Severity:", createRes.data.severity);
  } else {
    console.error("❌ Fail: Incident creation failed. Status:", createRes.status, createRes.data);
    process.exit(1);
  }

  // Test 3: List incidents and check tenant isolation (Acme worker should see it)
  console.log("\nTest 3: Fetching incidents list as Acme Worker...");
  const acmeListRes = await get('/incidents', workerToken);
  const foundInAcme = acmeListRes.data.find((i: any) => i.id === incidentId);

  if (acmeListRes.status === 200 && foundInAcme) {
    console.log("✅ Success: Found critical incident in Acme list.");
    console.log("   Attachments count:", foundInAcme.attachments.length, ", Url:", foundInAcme.attachments[0].url);
  } else {
    console.error("❌ Fail: Acme worker list failed or did not contain new incident.");
  }

  // Test 4: Tenant isolation check (Global Health worker should see 0 incidents)
  console.log("\nTest 4: Checking tenant isolation (Global Health worker should see 0)...");
  const ghListRes = await get('/incidents', ghWorkerToken);
  const foundInGh = ghListRes.data.find((i: any) => i.id === incidentId);

  if (ghListRes.status === 200 && !foundInGh && ghListRes.data.length === 0) {
    console.log("✅ Success: Tenant isolation working! Global Health worker saw 0 incidents.");
  } else {
    console.error("❌ Fail: Isolation breach! Global Health worker saw incident(s):", ghListRes.data);
  }

  // Test 5: Get incident detail
  console.log("\nTest 5: Fetching detailed incident by ID...");
  const detailRes = await get(`/incidents/${incidentId}`, workerToken);
  if (detailRes.status === 200 && detailRes.data.title === "Generator Coolant Leak") {
    console.log("✅ Success: Detail endpoint returned correct incident data.");
  } else {
    console.error("❌ Fail: Incident details lookup failed:", detailRes.data);
  }

  console.log("\n=== INCIDENT WORKFLOW VERIFICATION TESTS COMPLETED ===");
}

runIncidentTests().catch(console.error);
