import 'dotenv/config';
import { get, post, patch, fetchTestMetadata } from './test-helpers';

interface TestContext {
  workerToken: string;
  adminToken: string;
  ghWorkerToken: string;
  testSiteId: string;
  testTypeId: string;
  assetId: string;
  templateId?: string;
  assignmentId?: string;
  runId?: string;
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

async function runChecklistTests() {
  console.log("=== STARTING CHECKLIST ENGINE VERIFICATION TESTS ===");

  const tokens = await obtainTokens();
  const workerToken = tokens.workerToken!;
  const adminToken = tokens.adminToken!;
  const ghWorkerToken = tokens.ghWorkerToken!;

  // Fetch metadata and assets
  const meta = await fetchTestMetadata(workerToken);
  const assetsRes = await get('/assets', workerToken);
  const assetId = assetsRes.data[0].id;

  const context: TestContext = {
    workerToken,
    adminToken,
    ghWorkerToken,
    testSiteId: meta.siteId,
    testTypeId: meta.assetTypeId,
    assetId,
  };

  const sampleSchema = {
    type: "object",
    properties: {
      serial_number: {
        type: "string",
        title: "Serial Number",
        required: true
      },
      pressure: {
        type: "number",
        title: "System Pressure (PSI)",
        minimum: 0,
        maximum: 150,
        required: true
      },
      emergency_stop_ok: {
        type: "boolean",
        title: "Emergency Stop Functional",
        required: true
      },
      general_status: {
        type: "string",
        title: "Overall Machine Status",
        enum: ["Good", "Needs Maintenance", "Critical Failure"],
        required: true
      }
    }
  };

  // Test 1: Create template as field worker (should be blocked)
  console.log("\nTest 1: Create checklist template as Field Worker (should be forbidden)...");
  const failCreateRes = await post('/checklist-templates', {
    name: "Generator Inspection Checklist",
    schema: sampleSchema
  }, workerToken);
  if (failCreateRes.status === 403) {
    console.log("✅ Success: Blocked. Worker forbidden from creating templates.");
  } else {
    console.error("❌ Fail: Expected 403, got:", failCreateRes.status, failCreateRes.data);
  }

  // Test 2: Create template as Acme Admin (should succeed)
  console.log("\nTest 2: Create checklist template as Acme Admin (should succeed)...");
  const createRes = await post('/checklist-templates', {
    name: "Generator Inspection Checklist",
    schema: sampleSchema
  }, adminToken);
  if (createRes.status === 201 && createRes.data.id) {
    console.log(`✅ Success: Checklist template created with ID ${createRes.data.id}`);
    context.templateId = createRes.data.id;
  } else {
    console.error("❌ Fail: Template creation failed. Status:", createRes.status, createRes.data);
    process.exit(1);
  }

  // Test 3: List templates as worker (should see the created template)
  console.log("\nTest 3: List checklist templates as Acme Worker (should see created template)...");
  const listTemplatesRes = await get('/checklist-templates', workerToken);
  if (listTemplatesRes.status === 200 && listTemplatesRes.data.length > 0) {
    console.log(`✅ Success: Found ${listTemplatesRes.data.length} templates. Names:`, listTemplatesRes.data.map((t: any) => t.name));
  } else {
    console.error("❌ Fail: List templates failed. Status:", listTemplatesRes.status);
  }

  // Test 4: Tenant isolation check for templates (Global Health worker should see 0 templates)
  console.log("\nTest 4: Tenant isolation check for templates (Global Health worker should see 0)...");
  const ghListTemplatesRes = await get('/checklist-templates', ghWorkerToken);
  if (ghListTemplatesRes.status === 200 && ghListTemplatesRes.data.length === 0) {
    console.log("✅ Success: Tenant isolation working! Global Health worker saw 0 templates.");
  } else {
    console.error("❌ Fail: Tenant isolation failed. Count:", ghListTemplatesRes.data?.length);
  }

  // Test 5: Assign template to asset type as Worker (should be blocked)
  console.log("\nTest 5: Assign checklist template to asset type as Worker (should be forbidden)...");
  const failAssignRes = await post('/checklist-assignments', {
    templateId: context.templateId,
    assetTypeId: context.testTypeId
  }, workerToken);
  if (failAssignRes.status === 403) {
    console.log("✅ Success: Blocked. Worker forbidden from creating assignments.");
  } else {
    console.error("❌ Fail: Expected 403, got:", failAssignRes.status, failAssignRes.data);
  }

  // Test 6: Assign template to asset type as Acme Admin (should succeed)
  console.log("\nTest 6: Assign checklist template to asset type as Admin (should succeed)...");
  const assignRes = await post('/checklist-assignments', {
    templateId: context.templateId,
    assetTypeId: context.testTypeId
  }, adminToken);
  if (assignRes.status === 201 && assignRes.data.id) {
    console.log(`✅ Success: Checklist assigned. Assignment ID: ${assignRes.data.id}`);
    context.assignmentId = assignRes.data.id;
  } else {
    console.error("❌ Fail: Assignment failed. Status:", assignRes.status, assignRes.data);
  }

  // Test 7: Create a checklist run (completed) as Worker
  console.log("\nTest 7: Execute and record a checklist run as Worker...");
  const runRes = await post('/checklist-runs', {
    templateId: context.templateId,
    assetId: context.assetId,
    status: "completed",
    responses: [
      { questionId: "serial_number", value: "GEN-2026-X" },
      { questionId: "pressure", value: 120 },
      { questionId: "emergency_stop_ok", value: true },
      { questionId: "general_status", value: "Good" }
    ]
  }, workerToken);
  if (runRes.status === 201 && runRes.data.id) {
    console.log(`✅ Success: Checklist run recorded. Run ID: ${runRes.data.id}`);
    context.runId = runRes.data.id;
  } else {
    console.error("❌ Fail: Run execution failed. Status:", runRes.status, runRes.data);
  }

  // Test 8: Fetch checklist runs as worker
  console.log("\nTest 8: Retrieve checklist runs as Acme Worker...");
  const fetchRunsRes = await get('/my/checklist-runs', workerToken);
  if (fetchRunsRes.status === 200 && fetchRunsRes.data.length > 0) {
    console.log(`✅ Success: Retrieved ${fetchRunsRes.data.length} runs.`);
    console.log("   First Run Responses:", fetchRunsRes.data[0].responses.map((r: any) => `${r.questionId}: ${r.value}`));
  } else {
    console.error("❌ Fail: Could not fetch runs. Status:", fetchRunsRes.status);
  }

  // Test 9: Tenant isolation check for runs (Global Health worker should see 0 runs)
  console.log("\nTest 9: Tenant isolation check for checklist runs (Global Health worker should see 0)...");
  const ghRunsRes = await get('/my/checklist-runs', ghWorkerToken);
  if (ghRunsRes.status === 200 && ghRunsRes.data.length === 0) {
    console.log("✅ Success: Tenant isolation working! Global Health worker saw 0 runs.");
  } else {
    console.error("❌ Fail: Tenant isolation failed. Count:", ghRunsRes.data?.length);
  }

  console.log("\n=== CHECKLIST ENGINE VERIFICATION TESTS COMPLETED ===");
}

runChecklistTests().catch(console.error);
