import 'dotenv/config';
import { get, post, patch } from './test-helpers';
import crypto from 'crypto';

async function obtainTokens() {
  console.log("Obtaining user tokens...");
  const workerRes = await post('/auth/login', { email: 'worker@acme.com', password: 'worker123' });
  const adminRes = await post('/auth/login', { email: 'admin@acme.com', password: 'admin123' });
  const ghWorkerRes = await post('/auth/login', { email: 'worker@globalhealth.com', password: 'worker123' });
  
  return {
    workerToken: workerRes.data.token,
    workerUser: workerRes.data.user,
    adminToken: adminRes.data.token,
    adminUser: adminRes.data.user,
    ghWorkerToken: ghWorkerRes.data.token,
  };
}

async function runActionItemTests() {
  console.log("=== STARTING STAGE 2.4 CORRECTIVE ACTIONS VERIFICATION TESTS ===");

  const tokens = await obtainTokens();
  const workerToken = tokens.workerToken;
  const adminToken = tokens.adminToken;
  const adminUser = tokens.adminUser;
  const ghWorkerToken = tokens.ghWorkerToken;

  // Test 1: Auto-generate action item on critical incident creation
  console.log("\nTest 1: Auto-generating action item task on Critical Incident creation...");
  const incidentId = crypto.randomUUID();
  const incRes = await post('/incidents', {
    id: incidentId,
    title: "Boiler Overpressure Warning",
    description: "Main line pressure exceeds 140 PSI.",
    severity: "critical",
  }, workerToken);

  if (incRes.status === 201 && incRes.data.actionItems && incRes.data.actionItems.length > 0) {
    console.log("✅ Success: Incident created and auto-generated action item task:", incRes.data.actionItems[0].title);
    console.log("   Auto-generated Priority:", incRes.data.actionItems[0].priority, ", DueDate:", incRes.data.actionItems[0].dueDate);
  } else {
    console.error("❌ Fail: Incident creation failed or action item was not auto-generated:", incRes.data);
    process.exit(1);
  }

  const autoActionId = incRes.data.actionItems[0].id;

  // Test 2: Users view assignments instantly
  console.log("\nTest 2: Users viewing assigned action items instantly via GET /action-items...");
  const listRes = await get('/action-items', workerToken);
  if (listRes.status === 200 && Array.isArray(listRes.data)) {
    const found = listRes.data.find((a: any) => a.id === autoActionId);
    if (found) {
      console.log("✅ Success: Found action item in organization list instantly.");
    } else {
      console.error("❌ Fail: Action item not in list response:", listRes.data);
      process.exit(1);
    }
  } else {
    console.error("❌ Fail: Action items list query failed:", listRes.data);
    process.exit(1);
  }

  // Test 3: Status machine transitions & validation
  console.log("\nTest 3: Testing status lifecycle state machine...");

  // open -> in_progress (valid)
  console.log("  3a. Transitioning open -> in_progress (valid)...");
  const step1 = await patch(`/action-items/${autoActionId}`, { status: 'in_progress' }, workerToken);
  if (step1.status === 200 && step1.data.status === 'in_progress') {
    console.log("  ✅ open -> in_progress succeeded safely.");
  } else {
    console.error("  ❌ open -> in_progress failed:", step1.data);
    process.exit(1);
  }

  // in_progress -> resolved (valid)
  console.log("  3b. Transitioning in_progress -> resolved (valid)...");
  const step2 = await patch(`/action-items/${autoActionId}`, { status: 'resolved' }, workerToken);
  if (step2.status === 200 && step2.data.status === 'resolved') {
    console.log("  ✅ in_progress -> resolved succeeded safely.");
  } else {
    console.error("  ❌ in_progress -> resolved failed:", step2.data);
    process.exit(1);
  }

  // resolved -> closed (valid)
  console.log("  3c. Transitioning resolved -> closed (valid)...");
  const step3 = await patch(`/action-items/${autoActionId}`, { status: 'closed' }, workerToken);
  if (step3.status === 200 && step3.data.status === 'closed') {
    console.log("  ✅ resolved -> closed succeeded safely.");
  } else {
    console.error("  ❌ resolved -> closed failed:", step3.data);
    process.exit(1);
  }

  // closed -> resolved (invalid FSM transition)
  console.log("  3d. Attempting invalid status transition closed -> resolved (should fail with 400)...");
  const step4 = await patch(`/action-items/${autoActionId}`, { status: 'resolved' }, workerToken);
  if (step4.status === 400 && step4.data.error?.includes('Invalid status transition')) {
    console.log("  ✅ Success: Invalid transition correctly blocked:", step4.data.error);
  } else {
    console.error("  ❌ Fail: Invalid transition was not blocked with 400:", step4.status, step4.data);
    process.exit(1);
  }

  // Test 4: Commenting on action item
  console.log("\nTest 4: Adding discussion comment to action item...");
  const commentRes = await post(`/action-items/${autoActionId}/comments`, {
    content: "Pressure safety valve re-calibrated and tested.",
  }, workerToken);

  if (commentRes.status === 201 && commentRes.data.content) {
    console.log("✅ Success: Comment added:", commentRes.data.content, "by author:", commentRes.data.author?.email);
  } else {
    console.error("❌ Fail: Adding comment failed:", commentRes.data);
    process.exit(1);
  }

  // Test 5: Route / Assign incident to admin user
  console.log("\nTest 5: Routing incident and assigning tasks to Admin user...");
  const assignRes = await post(`/incidents/${incidentId}/assign`, {
    assigneeId: adminUser.id,
  }, workerToken);

  if (assignRes.status === 200 && assignRes.data.actionItems[0].assigneeId === adminUser.id) {
    console.log("✅ Success: Incident routed and action items assigned to admin:", adminUser.email);
  } else {
    console.error("❌ Fail: Incident routing / assignment failed:", assignRes.data);
    process.exit(1);
  }

  // Test 6: Tenant isolation check (Global Health worker should see 0 action items)
  console.log("\nTest 6: Verifying tenant isolation for Action Items...");
  const ghList = await get('/action-items', ghWorkerToken);
  const foundInGh = ghList.data.find((a: any) => a.id === autoActionId);
  if (ghList.status === 200 && !foundInGh) {
    console.log("✅ Success: Tenant isolation verified! Other tenant cannot view action items.");
  } else {
    console.error("❌ Fail: Tenant isolation breach! Global Health worker saw Acme action item:", ghList.data);
    process.exit(1);
  }

  console.log("\n=== STAGE 2.4 CORRECTIVE ACTIONS VERIFICATION TESTS PASSED SUCCESSFULLY ===");
}

runActionItemTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
