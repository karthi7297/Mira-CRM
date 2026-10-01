import { inr } from './api';

/* ------------------------------------------------------------------ *
 * Mira print engine — every Report / Print button in the app opens a
 * self-contained, professionally styled A4 analysis document in a new
 * window (Print → Save as PDF gives a clean PDF). Nothing here prints
 * raw app HTML; each builder composes header + KPIs + analysis +
 * detailed tables + footer from the data already on screen.
 * ------------------------------------------------------------------ */

const esc = (v) => String(v ?? '—')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (v) => (v == null || v === '' ? '—' : inr(v));
const pct1 = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : `${Math.round(Number(v) * 10) / 10}%`);
const dstr = (v) => (v ? String(v).slice(0, 10) : '—');
const today = () => new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const stamp = () => new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const CSS = `
  @page { size: A4; margin: 13mm 12mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11.5px; line-height: 1.55; }
  .sheet { max-width: 190mm; margin: 0 auto; }
  .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0e7268; padding-bottom: 10px; margin-bottom: 6px; }
  .brand h1 { margin: 0; font-size: 21px; letter-spacing: 0.12em; color: #0e7268; }
  .brand .tag { font-size: 10px; color: #64748b; letter-spacing: 0.04em; margin-top: 2px; }
  .brand .doc { text-align: right; }
  .brand .doc b { display: block; font-size: 15px; }
  .brand .doc span { font-size: 10.5px; color: #64748b; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 10.5px; color: #475569; margin: 8px 0 14px; }
  .meta b { color: #0f172a; }
  h2.sec { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #0e7268; border-left: 4px solid #0e7268; padding-left: 8px; margin: 20px 0 8px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
  .kpi { border: 1px solid #e2e8f0; border-top: 3px solid #0e7268; border-radius: 6px; padding: 8px 10px; }
  .kpi .t { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #64748b; }
  .kpi .v { font-size: 16px; font-weight: 750; letter-spacing: -0.01em; margin-top: 2px; }
  .kpi .s { font-size: 10px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 4px; font-size: 11px; }
  thead th { background: #0f172a; color: #fff; text-align: left; padding: 7px 9px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  thead th:first-child { border-radius: 6px 0 0 0; }
  thead th:last-child { border-radius: 0 6px 0 0; }
  tbody td { padding: 6px 9px; border-bottom: 1px solid #eef2f7; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .note { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px; padding: 8px 12px; font-size: 11px; margin: 10px 0; }
  .warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; font-size: 11px; margin: 10px 0; }
  .sum { font-size: 11.5px; margin: 6px 0; }
  .sum li { margin-bottom: 4px; }
  .totals { width: 62mm; margin-left: auto; font-size: 11.5px; }
  .totals .row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #e2e8f0; }
  .totals .grand { font-size: 14px; font-weight: 800; border-bottom: none; margin-top: 4px; }
  .bar { height: 9px; background: #e2e8f0; border-radius: 5px; overflow: hidden; margin: 6px 0 2px; }
  .bar i { display: block; height: 100%; background: #16a34a; border-radius: 5px; }
  .footer { margin-top: 22px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9.5px; color: #94a3b8; display: flex; justify-content: space-between; }
  .sig { display: flex; justify-content: space-between; margin-top: 34px; }
  .sig div { width: 58mm; border-top: 1px solid #0f172a; padding-top: 5px; font-size: 10.5px; text-align: center; color: #475569; }
  .cert { border: 3px double #0e7268; border-radius: 10px; padding: 30px 28px; text-align: center; margin-top: 8px; }
  .cert h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 26px; letter-spacing: 0.14em; color: #0e3f3a; margin: 6px 0; }
  .cert .who { font-family: Georgia, serif; font-size: 30px; font-weight: 700; margin: 10px 0 2px; }
  .cert .seal { width: 64px; height: 64px; border-radius: 50%; background: #0e7268; color: #fff; display: inline-grid; place-items: center; font-size: 28px; margin-bottom: 6px; }
  .cert .detail { display: inline-block; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 8px 18px; font-size: 11.5px; margin-top: 12px; }
  @media print { .no-print { display: none !important; } }
`;

function shell({ docTitle, docSub, preparedFor, body }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(docTitle)}</title>
<style>${CSS}</style></head><body><div class="sheet">
<div class="brand">
  <div><h1>RAMPEX</h1><div class="tag">EduTech Operations · Mira Platform</div></div>
  <div class="doc"><b>${esc(docTitle)}</b><span>${esc(docSub)}</span></div>
</div>
<div class="meta"><span>Prepared for <b>${esc(preparedFor)}</b></span><span>Generated <b>${esc(stamp())}</b></span><span>Source <b>Mira CRM</b></span></div>
${body}
<div class="footer"><span>System-generated document · Mira CRM · Rampex Education Services</span><span>Page <span style="font-variant-numeric: tabular-nums">1</span> · ${esc(today())}</span></div>
</div><script>window.onload = () => setTimeout(() => window.print(), 350);<\/script></body></html>`;
}

function openDoc(html, title) {
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  w.focus();
}

const kpiGrid = (items) => `<div class="kpis">${items.map((k) => `
  <div class="kpi" style="${k.accent ? `border-top-color:${k.accent};` : ''}">
    <div class="t">${esc(k.t)}</div><div class="v">${esc(k.v)}</div>
    ${k.s ? `<div class="s">${esc(k.s)}</div>` : ''}
  </div>`).join('')}</div>`;

const table = (head, rows, numFrom = -1) => `
<table><thead><tr>${head.map((h, i) => `<th${i >= numFrom && numFrom >= 0 ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td${i >= numFrom && numFrom >= 0 ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}" style="text-align:center;color:#94a3b8;">No records</td></tr>`}</tbody></table>`;

/* ================= Executive analysis report (Reports page) ================= */
export function printExecutiveReport({ d, top = [], trend = [], who = 'Management' }) {
  const revenue = Number(d.revenue || 0);
  const collected = Number(d.collected || 0);
  const outstanding = Number(d.outstanding || 0);
  const expenses = d.expenses == null ? null : Number(d.expenses);
  const net = d.net == null ? null : Number(d.net);
  const rate = revenue ? Math.round((collected / revenue) * 100) : 0;
  const margin = revenue && net != null ? Math.round((net / revenue) * 100) : null;
  const outCount = (d.outstandingInvoices || []).length;
  const cash30 = Math.round(outstanding * 0.65);
  const verdict = rate >= 80 ? 'healthy — collections are keeping pace with billing'
    : rate >= 60 ? 'acceptable but watchful — a fifth or more of billed revenue is still in the field'
    : 'under pressure — accelerated follow-up on high-value dues is recommended';

  const trendRows = (trend || []).slice(-12);
  const best = trendRows.reduce((a, t) => (Number(t.collected || 0) > Number(a.collected || 0) ? t : a), trendRows[0] || {});
  const avgBill = trendRows.length ? Math.round(trendRows.reduce((s, t) => s + Number(t.billed || 0), 0) / trendRows.length) : 0;

  const expCats = [
    ['Trainer', d.trainerExpense], ['Venue', d.venueExpense], ['Travel', d.travelExpense],
    ['Accommodation', d.accommodationExpense], ['Materials', d.materialsExpense],
    ['Marketing', d.marketingExpense], ['Operations', d.operationsExpense], ['Other', d.otherExpense],
  ].filter(([, v]) => Number(v || 0) > 0);
  const expTotal = expCats.reduce((s, [, v]) => s + Number(v || 0), 0);

  const body = `
${kpiGrid([
    { t: 'Revenue Billed', v: money(revenue), s: `${d.totalLeads || 0} active leads in pipeline` },
    { t: 'Collected', v: money(collected), s: `${rate}% recovery rate`, accent: '#16a34a' },
    { t: 'Outstanding', v: money(outstanding), s: `${outCount} invoices pending`, accent: '#f59e0b' },
    { t: 'Net Position', v: money(net), s: margin != null ? `${margin}% margin` : '—', accent: net != null && net < 0 ? '#ef4444' : '#16a34a' },
    { t: 'Conversion', v: `${d.conversionRate || 0}%`, s: 'lead → customer' },
    { t: 'Students', v: String(d.totalStudents ?? d.studentCount ?? 0), s: `${d.activeBatches ?? (d.batches || []).length} batches` },
    { t: 'Expenses', v: money(expenses), s: 'operating costs' },
    { t: '30-Day Cashflow', v: money(cash30), s: 'projected inflow @65% velocity' },
  ])}
<h2 class="sec">Executive Summary</h2>
<ul class="sum">
  <li>Collection health is <b>${verdict}</b>: ${money(collected)} recovered of ${money(revenue)} billed (${rate}%).</li>
  <li><b>${money(outstanding)}</b> remains outstanding across <b>${outCount}</b> invoices; projected 30-day inflow is <b>${money(cash30)}</b> at historical velocity.</li>
  ${margin != null ? `<li>Operating margin stands at <b>${margin}%</b> on a net position of <b>${money(net)}</b>.</li>` : ''}
  ${trendRows.length ? `<li>Average monthly billing is <b>${money(avgBill)}</b>${best && best.month ? `; strongest collection month was <b>${esc(String(best.month).slice(0, 10))}</b> at <b>${money(best.collected)}</b>` : ''}.</li>` : ''}
  ${expTotal ? `<li>Largest cost centre is <b>${esc(expCats.slice().sort((a, b) => b[1] - a[1])[0][0])}</b> at <b>${money(expCats.slice().sort((a, b) => b[1] - a[1])[0][1])}</b> of ${money(expTotal)} total expenses.</li>` : ''}
</ul>
<h2 class="sec">Revenue Analysis · Billed vs Collected</h2>
${table(['Period', 'Billed', 'Collected', 'Recovery'], trendRows.map((t) => [
    esc(String(t.month || '').slice(0, 10)),
    money(t.billed), money(t.collected),
    pct1(Number(t.billed || 0) ? (Number(t.collected || 0) / Number(t.billed)) * 100 : null),
  ]), 1)}
<h2 class="sec">Collections Analysis · Outstanding Receivables</h2>
<div class="note">Priority order: largest and oldest dues first. Every row below is actionable from Finance → Collections.</div>
${table(['Invoice', 'Customer', 'Outstanding', 'Due'], (d.outstandingInvoices || []).map((i) => [
    `<b>${esc(i.id)}</b>`, esc(i.customer_name || ''), `<b>${money(i.outstanding)}</b>`, esc(i.due_date || '—'),
  ]), 2)}
<h2 class="sec">Expense Analysis · Cost Centres</h2>
${table(['Category', 'Amount', 'Share'], expCats.map(([c, v]) => [
    esc(c), money(v), pct1(expTotal ? (Number(v) / expTotal) * 100 : null),
  ]), 1)}
<h2 class="sec">Academic Excellence · Top Students</h2>
${table(['Rank', 'Student', 'Batch', 'Attendance', 'Avg Score'], (top || []).map((s, i) => [
    `<b>#${i + 1}</b>`, `<b>${esc(s.name)}</b>`, esc(s.batch_id || '—'), `${s.attendance ?? '—'}%`, s.avg_score != null ? `${s.avg_score}%` : '—',
  ]))}
<h2 class="sec">Recent Collections</h2>
${table(['Receipt', 'Date', 'Amount'], (d.recentPayments || []).slice(0, 15).map((p) => [
    `<b>${esc(p.id)}</b>`, esc(p.date || ''), `<b>${money(p.amount)}</b>`,
  ]), 2)}
<div class="sig"><div>Prepared By<br><b>Rampex Finance</b></div><div>Reviewed By<br><b>Management</b></div><div>Authorised Signatory</div></div>`;

  openDoc(shell({
    docTitle: 'Executive Business Analysis Report', docSub: `Rampex Education · ${today()}`, preparedFor: who, body,
  }), 'Executive Analysis Report');
}

/* ================= Invoice analysis + receipt ================= */
export function printInvoice(inv) {
  const total = Number(inv.total || 0);
  const paid = Number(inv.paid || 0);
  const progress = total ? Math.round((paid / total) * 100) : 0;
  const body = `
${kpiGrid([
    { t: 'Invoice Total', v: money(total) },
    { t: 'Paid', v: money(paid), s: `${progress}% recovered`, accent: '#16a34a' },
    { t: 'Outstanding', v: money(inv.outstanding), accent: '#f59e0b' },
    { t: 'Status', v: String(inv.status || '—').replace(/_/g, ' ') },
  ])}
<div class="note">Billed to <b>${esc(inv.customer_name)}</b> for <b>${esc(inv.program || 'Training')}</b> · Invoice <b>${esc(inv.id)}</b> · Due <b>${dstr(inv.due_date)}</b></div>
<h2 class="sec">Billed Items &amp; Computation</h2>
${table(['Item', 'Qty', 'Rate', 'Amount'], (inv.items || []).map((it) => [
    esc(it.description), esc(it.qty), money(it.rate), `<b>${money(it.amount)}</b>`,
  ]), 1)}
<div class="totals">
  <div class="row"><span>Subtotal</span><b>${money(inv.subtotal)}</b></div>
  <div class="row"><span>Discount</span><b>−${money(inv.discount)}</b></div>
  <div class="row"><span>Tax (GST 18%)</span><b>${money(inv.tax)}</b></div>
  <div class="row grand"><span>Total</span><b>${money(total)}</b></div>
</div>
<h2 class="sec">Collection Progress</h2>
<div class="bar"><i style="width:${progress}%"></i></div>
<div class="sum">${money(paid)} of ${money(total)} recovered (${progress}%). ${Number(inv.outstanding || 0) > 0
    ? `<b>${money(inv.outstanding)} remains due${inv.status === 'OVERDUE' ? ' and the invoice is OVERDUE — escalate via the Collections queue' : ''}.</b>`
    : 'Fully settled — no further action required.'}</div>
<h2 class="sec">Payment History</h2>
${table(['Receipt', 'Amount', 'Method', 'Date', 'Reference'], (inv.payments || []).map((p) => [
    `<b>${esc(p.id)}</b>`, `<b>${money(p.amount)}</b>`, esc(p.method), esc(p.date), esc(p.reference || '—'),
  ]), 1)}
<div class="sig"><div>Raised By<br><b>Rampex Finance</b></div><div>Received By<br><b>${esc(inv.customer_name)}</b></div><div>Authorised Signatory</div></div>`;

  openDoc(shell({
    docTitle: `Tax Invoice Analysis · ${inv.id}`, docSub: `${inv.customer_name || ''} · ${today()}`, preparedFor: inv.customer_name || 'Customer', body,
  }), `Invoice ${inv.id}`);
}

/* ================= Quotation analysis ================= */
export function printQuotation(q) {
  const total = Number(q.total || 0);
  const discPct = (Number(q.subtotal || 0) + Number(q.tax || 0)) > 0
    ? Math.round((Number(q.discount || 0) / (Number(q.subtotal || 0) + Number(q.tax || 0))) * 1000) / 10 : 0;
  const body = `
${kpiGrid([
    { t: 'Quoted Total', v: money(total) },
    { t: 'Discount', v: money(q.discount), s: `${discPct}% effective` },
    { t: 'Tax (GST 18%)', v: money(q.tax) },
    { t: 'Status', v: String(q.status || '—') },
  ])}
<div class="note">Proposed to <b>${esc(q.customer_name)}</b> for <b>${esc(q.program || 'Training')}</b> · Quotation <b>${esc(q.id)}</b></div>
<h2 class="sec">Commercial Computation</h2>
<div class="totals">
  <div class="row"><span>Subtotal</span><b>${money(q.subtotal)}</b></div>
  <div class="row"><span>Discount</span><b>−${money(q.discount)}</b></div>
  <div class="row"><span>Tax (GST 18%)</span><b>${money(q.tax)}</b></div>
  <div class="row grand"><span>Quoted Total</span><b>${money(total)}</b></div>
</div>
<h2 class="sec">Pipeline Analysis</h2>
<ul class="sum">
  <li>Current stage: <b>${esc(q.status || '—')}</b>${q.status === 'DRAFT' ? ' — internal proposal, not yet shared with the client' : ''}${q.status === 'SENT' ? ' — awaiting client decision; follow up per the lead pipeline' : ''}${q.status === 'ACCEPTED' ? ' — approved; convert to invoice in one click from Quotations' : ''}${q.status === 'REJECTED' ? ' — declined; capture the reason as a lead follow-up' : ''}.</li>
  <li>Effective discount of <b>${discPct}%</b> on a quoted value of <b>${money(total)}</b>.</li>
</ul>
<div class="sig"><div>Proposed By<br><b>Rampex</b></div><div>Accepted By<br><b>${esc(q.customer_name)}</b></div><div>Authorised Signatory</div></div>`;

  openDoc(shell({
    docTitle: `Quotation Analysis · ${q.id}`, docSub: `${q.customer_name || ''} · ${today()}`, preparedFor: q.customer_name || 'Customer', body,
  }), `Quotation ${q.id}`);
}

/* ================= Payment receipt analysis ================= */
export function printReceipt(pay, allPayments = []) {
  const mine = (allPayments || []).filter((p) => (p.customer_name || '') === (pay.customer_name || '') || (p.invoice_id || '') === (pay.invoice_id || ''));
  const custTotal = mine.reduce((s, p) => s + Number(p.amount || 0), 0);
  const body = `
${kpiGrid([
    { t: 'Receipt', v: String(pay.id || '—') },
    { t: 'Amount Received', v: money(pay.amount), accent: '#16a34a' },
    { t: 'Customer Lifetime Paid', v: money(custTotal), s: `${mine.length} payments on record` },
    { t: 'Mode', v: String(pay.method || '—') },
  ])}
<div class="note">Received with thanks from <b>${esc(pay.customer_name)}</b> against invoice <b>${esc(pay.invoice_id)}</b> on <b>${dstr(pay.date)}</b> · Reference <b>${esc(pay.reference || 'N/A')}</b></div>
<h2 class="sec">Payer Ledger · All Recorded Payments</h2>
${table(['Receipt', 'Invoice', 'Amount', 'Method', 'Date'], mine.map((p) => [
    `<b>${esc(p.id)}</b>`, esc(p.invoice_id), `<b>${money(p.amount)}</b>`, esc(p.method), esc(p.date),
  ]), 2)}
<div class="sig"><div>Collected By<br><b>Rampex Finance</b></div><div>Acknowledged By<br><b>${esc(pay.customer_name)}</b></div><div>Authorised Signatory</div></div>`;

  openDoc(shell({
    docTitle: `Payment Receipt Analysis · ${pay.id}`, docSub: `${pay.customer_name || ''} · ${today()}`, preparedFor: pay.customer_name || 'Customer', body,
  }), `Receipt ${pay.id}`);
}

/* ================= Completion certificate ================= */
export function printCertificate(c) {
  const body = `
<div class="cert">
  <div class="seal">✓</div>
  <h1>CERTIFICATE OF COMPLETION</h1>
  <div style="font-size:11px;letter-spacing:0.2em;color:#64748b;">RAMPEX EDUCATION SERVICES</div>
  <p style="font-size:12px;color:#475569;">This is proudly presented to</p>
  <div class="who">${esc(c.student_name)}</div>
  <p style="font-size:12.5px;">for successful completion of <b>${esc(c.program_name || 'the training program')}</b><br>with batch <b>${esc(c.batch_id)}</b></p>
  <div class="detail">Attendance <b>${c.attendance_pct}%</b> &nbsp;·&nbsp; Assessment <b>${c.avg_score ?? '—'}${c.avg_score != null ? '%' : ''}</b> &nbsp;·&nbsp; Issued <b>${dstr(c.issued_on)}</b><br>Verification Code <b>${esc(c.certificate_no)}</b> · Verify at <b>/verify</b></div>
  <div class="sig"><div>Program Director</div><div>Authorised Signatory</div></div>
</div>`;

  openDoc(shell({
    docTitle: 'Certificate of Completion', docSub: `${c.student_name || ''} · ${c.certificate_no || ''}`, preparedFor: c.student_name || 'Student', body,
  }), `Certificate ${c.certificate_no || ''}`);
}
