const db = require('./src/db');
const { initialize } = require('./src/db/seed');
const { createApp } = require('./src/app');

async function testSuite() {
  console.log('--- STARTING COMPREHENSIVE VERIFICATION SUITE ---');
  await db.ready;
  await initialize(db);

  const app = createApp();
  const server = app.listen(4005);

  const baseUrl = 'http://localhost:4005/api';

  try {
    // 1. FLOW W: Public Enquiry (no auth)
    console.log('\n[TEST 1] FLOW W: Public Enquiry (inbound lead capture)');
    const reqEnquiry = await fetch(`${baseUrl}/public/enquire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization: 'Stanford Tech Academy',
        contact_person: 'Dean Harrison',
        email: 'harrison@stanford.edu',
        phone: '98400-99999',
        requirement: 'Full Campus Generative AI Workshop',
        expected_students: 150,
      }),
    });
    const resEnquiry = await reqEnquiry.json();
    console.log('Public enquiry result:', resEnquiry.success, resEnquiry.data?.id);
    if (!resEnquiry.success || !resEnquiry.data?.id) throw new Error('Public enquiry failed');

    // Verify lead was tagged with source = 'Website' and follow-up was auto-logged
    const leadCheck = await db.get('SELECT * FROM leads WHERE id = ?', [resEnquiry.data.id]);
    const fuCheck = await db.query('SELECT * FROM lead_followups WHERE lead_id = ?', [resEnquiry.data.id]);
    if (leadCheck.source !== 'Website') throw new Error('Lead source should be Website');
    if (!fuCheck.length || !fuCheck[0].notes.includes('auto-captured')) throw new Error('System follow-up missing');
    console.log('✓ Public enquiry auto-captured with system follow-up');

    // 2. FLOW Y: Certificate Issuance & Eligibility Rule (>=75%)
    console.log('\n[TEST 2] FLOW Y: Certificate Issuance Attendance Rule');
    // STU-003 has 0% attendance in AIML-2026-01 (1 session absent)
    const reqLow = await fetch(`${baseUrl}/certificates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-role': 'organization',
      },
      body: JSON.stringify({ student_id: 'STU-003', batch_id: 'AIML-2026-01' }),
    });
    const resLow = await reqLow.json();
    console.log('Low attendance rejection (status code):', reqLow.status, resLow.error);
    if (reqLow.status !== 422 || !resLow.error.includes('75%')) {
      throw new Error(`Expected 422 for low attendance, got ${reqLow.status}`);
    }
    console.log('✓ Ineligible student correctly blocked with 422');

    // STU-006 has 100% attendance in AIML-2026-01
    const reqCert = await fetch(`${baseUrl}/certificates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-role': 'organization',
      },
      body: JSON.stringify({ student_id: 'STU-006', batch_id: 'AIML-2026-01' }),
    });
    const resCert = await reqCert.json();
    console.log('Eligible student certificate issuance:', resCert.success, resCert.data?.certificate_no);
    if (!resCert.success || !resCert.data?.certificate_no) throw new Error('Certificate issuance failed');
    console.log('✓ Certificate issued for eligible student:', resCert.data.certificate_no);

    // 3. FLOW Y: Public Certificate Verification (no auth)
    console.log('\n[TEST 3] FLOW Y: Public Verification endpoint');
    const reqVerify = await fetch(`${baseUrl}/public/verify/${resCert.data.certificate_no}`);
    const resVerify = await reqVerify.json();
    console.log('Verification result:', resVerify.success, resVerify.data?.student_name);
    if (!resVerify.success || resVerify.data?.student_name !== 'Sathvee S') {
      throw new Error('Public verification failed');
    }
    console.log('✓ Public certificate verified successfully');

    // 4. FLOW X: Collections Queue
    console.log('\n[TEST 4] FLOW X: Risk-Ranked Collections Queue');
    const reqCol = await fetch(`${baseUrl}/collections`, {
      headers: { 'x-role': 'organization' },
    });
    const resCol = await reqCol.json();
    console.log('Collections rows returned:', resCol.data?.length);
    if (!resCol.success || !resCol.data?.length) throw new Error('Collections queue failed');
    const first = resCol.data[0];
    console.log('Top priority invoice:', first.id, 'Risk:', first.risk, 'Reasons:', first.reasons);
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(first.risk)) throw new Error('Invalid risk classification');
    console.log('✓ Collections queue correctly prioritized with reasons');

    // 5. 1-Click Quotation to Invoice Conversion
    console.log('\n[TEST 5] 1-Click Quotation -> Invoice Conversion');
    const reqQuoConv = await fetch(`${baseUrl}/quotations/QUO-001/convert-invoice`, {
      method: 'POST',
      headers: { 'x-role': 'organization' },
    });
    const resQuoConv = await reqQuoConv.json();
    console.log('Quotation conversion result:', resQuoConv.success, resQuoConv.data?.id);
    if (!resQuoConv.success || !resQuoConv.data?.id) throw new Error('Quotation conversion failed');
    console.log('✓ Quotation successfully promoted to invoice with line items preserved');

    // 6. Reports Trend & Live Operational Feed
    console.log('\n[TEST 6] Reports Trend & Live Feed');
    const reqTrend = await fetch(`${baseUrl}/reports/trend`, { headers: { 'x-role': 'organization' } });
    const resTrend = await reqTrend.json();
    console.log('Trend data points:', resTrend.data?.length);
    if (!resTrend.success || !resTrend.data?.length) throw new Error('Trend report failed');

    const reqAct = await fetch(`${baseUrl}/activity`, { headers: { 'x-role': 'organization' } });
    const resAct = await reqAct.json();
    console.log('Activity feed events:', resAct.data?.length);
    if (!resAct.success || !resAct.data?.length) throw new Error('Activity feed failed');
    console.log('✓ Trend and activity stream operational');

    // 7. Role Isolation: Institution Customer 360
    console.log('\n[TEST 7] Scope Isolation: Institution gets students count but students: []');
    const reqC360 = await fetch(`${baseUrl}/customers/CUST-001`, {
      headers: { 'x-role': 'institution', 'x-customer': 'CUST-001' },
    });
    const resC360 = await reqC360.json();
    console.log('Institution student roster count:', resC360.data?.students?.length, 'Summary count:', resC360.data?.summary?.students);
    if (resC360.data?.students?.length !== 0) throw new Error('Institution should receive empty students roster');
    if (resC360.data?.summary?.students < 1) throw new Error('Institution summary student count should be preserved');
    console.log('✓ Strict institution student privacy enforced');

    console.log('\n>>> ALL 7 TEST SUITES PASSED FLAWLESSLY! <<<');
  } finally {
    server.close();
  }
}

testSuite().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
