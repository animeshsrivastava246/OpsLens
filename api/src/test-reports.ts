import 'dotenv/config';
import { get, post } from './test-helpers';

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

async function obtainGhWorkerToken() {
  const res = await post('/auth/login', { email: 'worker@globalhealth.com', password: 'worker123' });
  return {
    token: res.data.token,
    user: res.data.user,
  };
}

async function runReportAndExportTests() {
  console.log("=== STARTING STAGE 3.3 ANALYTICS & PDF EXPORT VERIFICATION TESTS ===");

  const { token: adminToken } = await obtainAdminToken();
  const { token: workerToken } = await obtainWorkerToken();
  const { token: ghToken } = await obtainGhWorkerToken();

  // Test 1: Fetching Compliance Summary Report
  console.log("\nTest 1: Fetching compliance summary metrics via GET /reports/compliance-summary...");
  const summaryRes = await get('/reports/compliance-summary', adminToken);
  if (summaryRes.status === 200) {
    console.log("✅ Success: Retrieved compliance summary report.");
    console.log(`   Overall Score: ${summaryRes.data.overallComplianceScore}% | Query Latency: ${summaryRes.data.queryLatencyMs}ms`);
    console.log(`   Assets: ${summaryRes.data.assets.total} | Inspections Completed: ${summaryRes.data.inspections.completed} | Incidents: ${summaryRes.data.incidents.total}`);
    
    if (summaryRes.data.queryLatencyMs > 100) {
      console.warn(`⚠️ Warning: Query latency exceeded 100ms: ${summaryRes.data.queryLatencyMs}ms`);
    } else {
      console.log(`✅ Performance: Aggregations executed under 100ms threshold (${summaryRes.data.queryLatencyMs}ms).`);
    }
  } else {
    console.error("❌ Fail: Failed to fetch compliance summary:", summaryRes.data);
    process.exit(1);
  }

  // Test 2: Fetching Incidents Analytics Breakdown
  console.log("\nTest 2: Fetching incident distribution analytics via GET /reports/incidents...");
  const incReportRes = await get('/reports/incidents', adminToken);
  if (incReportRes.status === 200) {
    console.log(`✅ Success: Retrieved incident distribution across severities:`, incReportRes.data.bySeverity);
    console.log(`   Query Latency: ${incReportRes.data.queryLatencyMs}ms`);
  } else {
    console.error("❌ Fail: Failed to fetch incident report:", incReportRes.data);
    process.exit(1);
  }

  // Test 3: Fetching SLA Compliance Analytics
  console.log("\nTest 3: Fetching SLA tracking analytics via GET /reports/sla...");
  const slaReportRes = await get('/reports/sla', adminToken);
  if (slaReportRes.status === 200) {
    console.log(`✅ Success: SLA Compliance Rate: ${slaReportRes.data.slaComplianceRate}%`);
    console.log(`   Overdue Tasks: ${slaReportRes.data.overdueCount} | On-time Tasks: ${slaReportRes.data.onTimeCount}`);
  } else {
    console.error("❌ Fail: Failed to fetch SLA report:", slaReportRes.data);
    process.exit(1);
  }

  // Test 4: Exporting Compliance Certification PDF
  console.log("\nTest 4: Generating and exporting official compliance PDF via GET /reports/export/compliance-pdf...");
  const baseUrl = 'http://localhost:3000';
  const pdfRes = await fetch(`${baseUrl}/reports/export/compliance-pdf`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  if (pdfRes.status === 200) {
    const contentType = pdfRes.headers.get('content-type');
    const arrayBuffer = await pdfRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfHeader = buffer.subarray(0, 5).toString('ascii');

    if (contentType?.includes('application/pdf') && pdfHeader === '%PDF-') {
      console.log(`✅ Success: Valid compliance certification PDF generated successfully!`);
      console.log(`   File Size: ${buffer.length} bytes | Header: ${pdfHeader} | Content-Type: ${contentType}`);
    } else {
      console.error("❌ Fail: PDF header or content-type mismatch:", { contentType, pdfHeader });
      process.exit(1);
    }
  } else {
    console.error("❌ Fail: Failed to generate compliance PDF. Status:", pdfRes.status);
    process.exit(1);
  }

  // Test 5: Exporting Incident Dossier PDF
  console.log("\nTest 5: Exporting specific incident evidence dossier PDF...");
  const incidentsListRes = await get('/incidents', adminToken);
  if (incidentsListRes.status === 200 && incidentsListRes.data.length > 0) {
    const targetIncident = incidentsListRes.data[0];
    const dossierRes = await fetch(`${baseUrl}/reports/incidents/${targetIncident.id}/export/pdf`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (dossierRes.status === 200) {
      const buffer = Buffer.from(await dossierRes.arrayBuffer());
      const pdfHeader = buffer.subarray(0, 5).toString('ascii');
      if (pdfHeader === '%PDF-') {
        console.log(`✅ Success: Incident Dossier PDF generated for incident [${targetIncident.title}]`);
        console.log(`   Size: ${buffer.length} bytes | Header: ${pdfHeader}`);
      } else {
        console.error("❌ Fail: Incident dossier PDF corrupted:", pdfHeader);
        process.exit(1);
      }
    } else {
      console.error("❌ Fail: Failed to generate incident dossier PDF:", dossierRes.status);
      process.exit(1);
    }
  }

  // Test 6: Cross-tenant isolation verification on reports
  console.log("\nTest 6: Checking tenant isolation on analytics reports (Global Health tenant)...");
  const ghSummaryRes = await get('/reports/compliance-summary', ghToken);
  if (ghSummaryRes.status === 200) {
    if (ghSummaryRes.data.assets.total === 0 && ghSummaryRes.data.incidents.total === 0) {
      console.log("✅ Success: Tenant isolation active! Global Health tenant summary shows 0 Acme records.");
    } else {
      console.error("❌ Fail: Tenant leak in compliance summary:", ghSummaryRes.data);
      process.exit(1);
    }
  }

  console.log("\n=== STAGE 3.3 ANALYTICS & PDF EXPORT VERIFICATION TESTS PASSED SUCCESSFULLY ===");
}

runReportAndExportTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
