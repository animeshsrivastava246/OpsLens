// @ts-nocheck
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
(globalThis as any).nodeRequire = require;

// Mock localStorage for WebDbMock to run in Node/Bun environment
const store: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  }
};

import {
  initDb,
  cacheChecklists,
  cacheAssignments,
  getCachedChecklists,
  getCachedAssignments,
  saveDraftRun,
  saveDraftResponses,
  getDraftRun,
  getDraftResponses,
  getDraftRunByAssetId,
  deleteDraftRun,
  queueMediaUpload,
  getPendingUploads,
  markUploadCompleted,
  markUploadFailed,
  clearMediaUploadQueue
} from './localDb';

async function runLocalDbTests() {
  console.log("=== STARTING MOBILE SQLITE LOCAL DB VERIFICATION TESTS ===");

  await initDb();

  // Test 1: Cache Checklist Templates and Assignments
  console.log("Test 1: Caching templates and assignments...");
  const templates = [
    {
      id: "temp-1",
      name: "Generator Inspection Checklist",
      schema: { type: "object", properties: { pressure: { type: "number" } } },
      organizationId: "org-acme"
    }
  ];
  const assignments = [
    {
      id: "ass-1",
      templateId: "temp-1",
      assetTypeId: "type-generator",
      organizationId: "org-acme"
    }
  ];

  await cacheChecklists(templates);
  await cacheAssignments(assignments);

  const cachedTemplates = await getCachedChecklists();
  const cachedAssignments = await getCachedAssignments();

  if (cachedTemplates.length === 1 && cachedTemplates[0].name === "Generator Inspection Checklist") {
    console.log("✅ Success: Templates cached and retrieved correctly.");
  } else {
    console.error("❌ Fail: Templates cache mismatch:", cachedTemplates);
  }

  if (cachedAssignments.length === 1 && cachedAssignments[0].assetTypeId === "type-generator") {
    console.log("✅ Success: Assignments cached and retrieved correctly.");
  } else {
    console.error("❌ Fail: Assignments cache mismatch:", cachedAssignments);
  }

  // Test 2: Create draft run and responses
  console.log("\nTest 2: Creating draft run and responses...");
  const runId = "run-draft-123";
  await saveDraftRun(runId, "temp-1", "asset-gen-01", "draft");

  const responses = [
    { questionId: "pressure", value: 125 },
    { questionId: "serial_number", value: "GEN-009" }
  ];
  await saveDraftResponses(runId, responses);

  const draftRun = await getDraftRun(runId);
  const draftResponses = await getDraftResponses(runId);

  if (draftRun && draftRun.status === "draft" && draftRun.assetId === "asset-gen-01") {
    console.log("✅ Success: Draft run saved and retrieved.");
  } else {
    console.error("❌ Fail: Draft run mismatch:", draftRun);
  }

  if (draftResponses.length === 2 && draftResponses.find(r => r.questionId === "pressure")?.value === 125) {
    console.log("✅ Success: Draft responses saved and retrieved.");
  } else {
    console.error("❌ Fail: Draft responses mismatch:", draftResponses);
  }

  // Test 3: Get Draft Run By Asset ID
  console.log("\nTest 3: Querying draft run by asset ID...");
  const draftByAsset = await getDraftRunByAssetId("asset-gen-01");
  if (draftByAsset && draftByAsset.id === runId) {
    console.log("✅ Success: Resolved draft run by asset ID.");
  } else {
    console.error("❌ Fail: Could not resolve draft by asset ID:", draftByAsset);
  }

  // Test 4: Delete draft run
  console.log("\nTest 4: Deleting draft run and verifying cleanup...");
  await deleteDraftRun(runId);

  const deletedRun = await getDraftRun(runId);
  const deletedResponses = await getDraftResponses(runId);
  const deletedByAsset = await getDraftRunByAssetId("asset-gen-01");

  if (!deletedRun && deletedResponses.length === 0 && !deletedByAsset) {
    console.log("✅ Success: Draft run and all responses successfully deleted.");
  } else {
    console.error("❌ Fail: Cleanup failed. Run:", deletedRun, "Responses:", deletedResponses, "ByAsset:", deletedByAsset);
  }
 
  // Test 5: Media upload queue tests
  console.log("\nTest 5: Testing media upload queue helpers...");
  await queueMediaUpload("media-1", "file://local/burst.jpg", "https://s3/burst.jpg");
  const pending = await getPendingUploads();
  if (pending.length === 1 && pending[0].localUri === "file://local/burst.jpg") {
    console.log("✅ Success: Media upload queued correctly.");
  } else {
    console.error("❌ Fail: Media queue pending mismatch:", pending);
  }
 
  await markUploadFailed("media-1", "Timeout", 1);
  const pendingAfterFail = await getPendingUploads();
  if (pendingAfterFail.length === 1 && pendingAfterFail[0].status === "failed") {
    console.log("✅ Success: Media upload status updated to failed.");
  } else {
    console.error("❌ Fail: Media queue status mismatch:", pendingAfterFail);
  }
 
  await markUploadCompleted("media-1");
  const pendingAfterSuccess = await getPendingUploads();
  if (pendingAfterSuccess.length === 0) {
    console.log("✅ Success: Media upload marked completed (removed from queue).");
  } else {
    console.error("❌ Fail: Media queue cleanup mismatch:", pendingAfterSuccess);
  }
 
  // Test 6: flushMediaUploads integration test
  console.log("\nTest 6: Testing flushMediaUploads integration...");
  await queueMediaUpload("media-2", "file://local/leak.jpg", "https://s3/leak.jpg");
  
  const { flushMediaUploads } = await import('../api');
  await flushMediaUploads();

  const postFlushPending = await getPendingUploads();
  if (postFlushPending.length === 0) {
    console.log("✅ Success: flushMediaUploads successfully processed and cleared the queue.");
  } else {
    console.error("❌ Fail: Queue not cleared after flush:", postFlushPending);
  }
 
  console.log("\n=== MOBILE LOCAL DB VERIFICATION TESTS COMPLETED ===");
}

runLocalDbTests().catch(console.error);
