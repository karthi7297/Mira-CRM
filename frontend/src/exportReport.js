/**
 * Assessment export helpers.
 *   exportAssessmentPDF(report)  → branded, analytical PDF (jsPDF + autotable)
 *   exportAssessmentExcel(report)→ multi-sheet .xlsx (summary / marks / distribution / insights)
 *   exportBatchPDF(report)       → same professional style, one batch in scope
 *   exportOverallPDF(report)     → same professional style, all batches in scope
 *
 * `report` is the payload from GET /api/assessments/:id/report,
 * GET /api/reports/batch/:id, or GET /api/reports/overall
 * (see learning.service assessmentReport / batchReport / overallReport).
 */
import { jsPDF } from 'jspdf';
import autoTableImport from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// jspdf-autotable's UMD build exports the function as `exports.default`, so the
// default-imported binding is a namespace, not callable, under strict ESM/Node.
// Normalize to the function (or fall back to the auto-registered doc.autoTable).
function applyAutoTable(doc, opts) {
  const fn = (typeof autoTableImport === 'function' ? autoTableImport : autoTableImport?.default)
    || (typeof doc.autoTable === 'function' ? doc.autoTable.bind(doc) : null);
  if (!fn) throw new Error('jspdf-autotable failed to load');
  fn(doc, opts);
}

const BRAND = [15, 42, 64];   // deep navy
const ACCENT = [14, 165, 140]; // teal
const MUTED = [90, 102, 120];
const LIGHT = [238, 242, 246];
const DARK = [30, 41, 59];

const safe = (v, d = '—') => (v === null || v === undefined || v === '' ? d : v);
const slug = (t) => String(t || 'assessment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function sectionTitle(doc, text, x, y) {
  doc.setFillColor(...ACCENT);
  doc.rect(x, y - 8, 3, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...BRAND);
  doc.text(text, x + 10, y + 2);
}

function paintHeader(doc, W, M, title, subtitle, meta) {
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 92, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, 92, W, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(title, M, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(String(subtitle || ''), M, 64);
  doc.setFontSize(9.5);
  doc.setTextColor(200, 220, 230);
  doc.text(String(meta || ''), M, 80);
  let y = 116;
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  return y;
}

function paintKpis(doc, W, M, y, cards) {
  const cw = (W - M * 2 - 3 * 10) / 4;
  cards.forEach((c, i) => {
    const x = M + i * (cw + 10);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, cw, 56, 6, 6, 'F');
    doc.setFillColor(...c.color);
    doc.roundedRect(x, y, 4, 56, 2, 2, 'F');
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(c.label.toUpperCase(), x + 12, y + 18);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(String(c.value), x + 12, y + 42);
  });
  return y + 78;
}

function paintDistribution(doc, W, M, y, distribution, scoredCount) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text('Score Distribution', M, y);
  y += 8;
  const barMax = (W - M * 2) * 0.62;
  const rowH = 18;
  distribution.forEach((d) => {
    const bw = d.count ? (d.count / Math.max(1, scoredCount)) * barMax : 0;
    doc.setFillColor(...LIGHT);
    doc.rect(M, y, barMax + 52, rowH - 4, 'F');
    if (bw > 0) { doc.setFillColor(...ACCENT); doc.rect(M, y, bw, rowH - 4, 'F'); }
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(d.label, M + bw + 6, y + 11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`${d.count} (${d.pctOfScored}%)`, M + bw + 56, y + 11);
    y += rowH;
  });
  return y + 16;
}

function paintBullets(doc, W, M, y, lines) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(40, 50, 65);
  lines.forEach((line) => {
    const wrapped = doc.splitTextToSize('•  ' + line, W - M * 2 - 8);
    wrapped.forEach((ww) => {
      if (y > 770) { doc.addPage(); y = 60; }
      doc.text(ww, M + 4, y);
      y += 13;
    });
  });
  return y;
}

function paintFooter(doc, W, M, label) {
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(220, 225, 230);
    doc.line(M, 800, W - M, 800);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label, M, 812);
    doc.text(`Page ${p} of ${pages}`, W - M, 812, { align: 'right' });
  }
}

/** Narrative bullets for a batch report — same detailed analysis voice. */
function buildBatchInsights(r) {
  const s = r.stats;
  const out = [];
  if (!s.scored_count) {
    out.push('No scores have been recorded for this batch yet, so no performance analysis is available. Once trainers enter marks, this report will populate automatically.');
    return out;
  }
  out.push(
    `Across ${r.batch.assessment_count} assessment(s), ${s.scored_count} score(s) were recorded for ${s.total_enrolled} enrolled student(s). The batch averaged ${s.mean_pct}% (median ${s.median_pct}%), ranging from ${s.min_pct}% to ${s.max_pct}%.`
  );
  if (s.stddev_pct != null) {
    const label = s.stddev_pct < 12 ? 'tight, consistent' : s.stddev_pct < 20 ? 'moderate' : 'wide';
    out.push(`Score dispersion (standard deviation) was ${s.stddev_pct}%, indicating ${label} variation across the batch.`);
  }
  out.push(`${s.pass_count} score(s) (${s.pass_rate}%) met or exceeded the 50% pass mark; ${s.fail_count} fell below it.`);
  const ranked = (r.assessments || []).filter((a) => a.mean_pct != null).sort((a, b) => b.mean_pct - a.mean_pct);
  if (ranked.length) {
    out.push(`Strongest assessment: ${ranked[0].title} at ${ranked[0].mean_pct}% average. Weakest: ${ranked[ranked.length - 1].title} at ${ranked[ranked.length - 1].mean_pct}% — consider a revision session there.`);
  }
  if (r.top_performers.length) {
    out.push(`Top student(s): ${r.top_performers.map((t) => `${t.student_name} (${t.pct}%)`).join(', ')}.`);
  }
  if (r.weak_students.length) {
    out.push(`Student(s) averaging below 50% and needing remediation: ${r.weak_students.map((w) => `${w.student_name} (${w.pct}%)`).join(', ')}.`);
  } else {
    out.push('Every ranked student averages at or above the pass mark — no batch-wide remediation required.');
  }
  const topBucket = [...r.distribution].sort((a, b) => b.count - a.count)[0];
  if (topBucket) out.push(`The largest concentration of scores fell in the ${topBucket.label} band (${topBucket.count} scores, ${topBucket.pctOfScored}%).`);
  return out;
}

export async function exportBatchPDF(report) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const s = report.stats;

  let y = paintHeader(doc, W, M,
    'Batch Performance Report',
    `${report.batch.id} — ${safe(report.batch.program_name)}`,
    `${safe(report.batch.customer_name)}  •  ${report.batch.assessment_count} assessment(s)  •  ${safe(report.batch.batch_status)}`);
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text(
    `Trainer: ${safe(report.batch.trainer_name)}    |    Enrolled: ${safe(report.batch.enrollment_total)}    |    Generated: ${new Date().toLocaleString()}`,
    M, y
  );
  y += 18;

  y = paintKpis(doc, W, M, y, [
    { label: 'Average', value: `${safe(s.mean_pct, '—')}%`, color: BRAND },
    { label: 'Median', value: `${safe(s.median_pct, '—')}%`, color: BRAND },
    { label: 'Pass Rate', value: `${safe(s.pass_rate, '—')}%`, color: ACCENT },
    { label: 'Scores', value: `${safe(s.scored_count)}/${safe(s.total_enrolled)}`, color: BRAND },
  ]);

  sectionTitle(doc, 'Assessments in this Batch', M, y);
  y += 6;
  applyAutoTable(doc, {
    startY: y,
    head: [['Assessment', 'Date', 'Scored', 'Average', 'Pass Rate']],
    body: report.assessments.length
      ? report.assessments.map((a) => [safe(a.title), safe(a.assessed_on), a.scored_count, a.mean_pct != null ? `${a.mean_pct}%` : '—', a.pass_rate != null ? `${a.pass_rate}%` : '—'])
      : [['No assessments in this batch yet', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    margin: { left: M, right: M },
    styles: { cellPadding: 5 },
  });
  y = doc.lastAutoTable.finalY + 26;

  if (y > 620) { doc.addPage(); y = 60; }
  sectionTitle(doc, 'Student Leaderboard (Batch Average)', M, y);
  y += 6;
  applyAutoTable(doc, {
    startY: y,
    head: [['Rank', 'Student', 'Student ID', 'Taken', 'Average', 'Attendance']],
    body: report.students.length
      ? report.students.map((r, i) => [i + 1, safe(r.student_name), r.student_id, r.assessments_taken, r.avg_pct != null ? `${r.avg_pct}%` : '—', r.attendance_pct != null ? `${r.attendance_pct}%` : '—'])
      : [['', 'No students enrolled', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    margin: { left: M, right: M },
    styles: { cellPadding: 5 },
  });
  y = doc.lastAutoTable.finalY + 26;

  if (y > 660) { doc.addPage(); y = 60; }
  sectionTitle(doc, 'Analysis & Insights', M, y);
  y += 12;
  y = paintDistribution(doc, W, M, y, report.distribution, s.scored_count);
  y = paintBullets(doc, W, M, y, buildBatchInsights(report));

  paintFooter(doc, W, M, 'Mira CRM — Confidential batch performance report');
  doc.save(`${report.batch.id}_${slug(report.batch.program_name)}_batch_report.pdf`);
}

/** Narrative bullets for the overall (all-batches) report. */
function buildOverallInsights(r) {
  const s = r.stats;
  const out = [];
  if (!s.scored_count) {
    out.push('No scores have been recorded across these batches yet, so no performance analysis is available.');
    return out;
  }
  out.push(
    `Across ${r.scope.batch_count} batch(es) and ${r.scope.assessment_count} assessment(s), ${s.scored_count} score(s) were recorded for ${s.total_enrolled} enrolled student(s). The overall average is ${s.mean_pct}% (median ${s.median_pct}%), with a pass rate of ${s.pass_rate}%.`
  );
  const ranked = (r.batches || []).filter((b) => b.mean_pct != null).sort((a, b) => b.mean_pct - a.mean_pct);
  if (ranked.length) {
    out.push(`Strongest batch: ${ranked[0].batch_id} (${ranked[0].program_name}) at ${ranked[0].mean_pct}% average with a ${ranked[0].pass_rate}% pass rate. Weakest: ${ranked[ranked.length - 1].batch_id} at ${ranked[ranked.length - 1].mean_pct}% — prioritise academic support there.`);
  }
  if (r.top_performers.length) {
    out.push(`Top student(s) overall: ${r.top_performers.map((t) => `${t.student_name} (${t.pct}%)`).join(', ')}.`);
  }
  if (r.weak_students.length) {
    out.push(`Student(s) averaging below 50% overall and needing remediation: ${r.weak_students.slice(0, 10).map((w) => `${w.student_name} (${w.pct}%)`).join(', ')}${r.weak_students.length > 10 ? ` and ${r.weak_students.length - 10} more` : ''}.`);
  } else {
    out.push('Every ranked student averages at or above the pass mark across all batches.');
  }
  const topBucket = [...r.distribution].sort((a, b) => b.count - a.count)[0];
  if (topBucket) out.push(`The largest concentration of scores fell in the ${topBucket.label} band (${topBucket.count} scores, ${topBucket.pctOfScored}%).`);
  return out;
}

export async function exportOverallPDF(report) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const s = report.stats;

  let y = paintHeader(doc, W, M,
    'Overall Performance Report',
    safe(report.scope.name),
    `${report.scope.batch_count} batch(es)  •  ${report.scope.assessment_count} assessment(s)  •  Generated ${new Date().toLocaleDateString()}`);
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text(`Enrolled students (across batches): ${safe(report.scope.enrollment_total)}`, M, y);
  y += 18;

  y = paintKpis(doc, W, M, y, [
    { label: 'Average', value: `${safe(s.mean_pct, '—')}%`, color: BRAND },
    { label: 'Pass Rate', value: `${safe(s.pass_rate, '—')}%`, color: ACCENT },
    { label: 'Batches', value: `${safe(report.scope.batch_count)}`, color: BRAND },
    { label: 'Scores', value: `${safe(s.scored_count)}/${safe(s.total_enrolled)}`, color: BRAND },
  ]);

  sectionTitle(doc, 'Batch-wise Summary', M, y);
  y += 6;
  applyAutoTable(doc, {
    startY: y,
    head: [['Batch', 'Program', 'Assessments', 'Enrolled', 'Average', 'Pass Rate']],
    body: report.batches.length
      ? report.batches.map((b) => [b.batch_id, safe(b.program_name), b.assessment_count, b.enrollment_total, b.mean_pct != null ? `${b.mean_pct}%` : '—', b.pass_rate != null ? `${b.pass_rate}%` : '—'])
      : [['No batches in scope', '', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    margin: { left: M, right: M },
    styles: { cellPadding: 5 },
  });
  y = doc.lastAutoTable.finalY + 26;

  if (y > 620) { doc.addPage(); y = 60; }
  sectionTitle(doc, 'Top Students (Overall Average)', M, y);
  y += 6;
  applyAutoTable(doc, {
    startY: y,
    head: [['Rank', 'Student', 'Student ID', 'Taken', 'Average']],
    body: report.students.length
      ? report.students.slice(0, 30).map((r, i) => [i + 1, safe(r.student_name), r.student_id, r.assessments_taken, `${r.avg_pct}%`])
      : [['', 'No scored students yet', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    margin: { left: M, right: M },
    styles: { cellPadding: 5 },
  });
  y = doc.lastAutoTable.finalY + 26;

  if (y > 660) { doc.addPage(); y = 60; }
  sectionTitle(doc, 'Analysis & Insights', M, y);
  y += 12;
  y = paintDistribution(doc, W, M, y, report.distribution, s.scored_count);
  y = paintBullets(doc, W, M, y, buildOverallInsights(report));

  paintFooter(doc, W, M, 'Mira CRM — Confidential overall performance report');
  doc.save(`overall_${slug(report.scope.name)}_report.pdf`);
}
function buildInsights(r) {
  const s = r.stats;
  const out = [];
  if (!s.scored_count) {
    out.push('No scores have been recorded for this assessment yet, so no performance analysis is available. Enter marks to generate the full report.');
    return out;
  }
  const enrolled = s.total_enrolled || 1;
  out.push(
    `A total of ${s.scored_count} of ${s.total_enrolled} enrolled students (${Math.round((s.scored_count / enrolled) * 100)}%) were assessed; ${s.pending_count} score(s) are still pending entry.`
  );
  out.push(
    `The cohort averaged ${s.mean_pct}% (median ${s.median_pct}%), with marks ranging from ${s.min_pct}% to ${s.max_pct}% — a spread of ${s.range_pct} percentage points.`
  );
  if (s.stddev_pct != null) {
    const label = s.stddev_pct < 12 ? 'tight, consistent' : s.stddev_pct < 20 ? 'moderate' : 'wide';
    out.push(`Score dispersion (standard deviation) was ${s.stddev_pct}%, indicating ${label} variation in student performance.`);
  }
  out.push(`${s.pass_count} student(s) (${s.pass_rate}%) met or exceeded the 50% pass mark; ${s.fail_count} fell below it.`);
  if (r.top_performers.length) {
    const rest = r.top_performers.slice(1).map((t) => `${t.student_name} (${t.pct}%)`).join(', ');
    out.push(`Top performer: ${r.top_performers[0].student_name} at ${r.top_performers[0].pct}%. Other strong results: ${rest || '—'}.`);
  }
  if (r.weak_students.length) {
    const names = r.weak_students.map((w) => `${w.student_name} (${w.pct}%)`).join(', ');
    out.push(`Student(s) below the pass mark needing remediation: ${names}.`);
  } else {
    out.push('Every scored student met the pass threshold — no immediate remediation required.');
  }
  const cmp = r.batch_comparison;
  if (cmp.batch_avg_all != null) {
    const dir = cmp.delta > 0 ? 'above' : cmp.delta < 0 ? 'below' : 'in line with';
    out.push(
      `This assessment's average (${cmp.this_avg}%) sits ${dir} the batch-wide average of ${cmp.batch_avg_all}% across ${r.batch.assessment_count} assessment(s) in the program.`
    );
  }
  const topBucket = [...r.distribution].sort((a, b) => b.count - a.count)[0];
  if (topBucket) out.push(`The largest concentration of scores fell in the ${topBucket.label} band (${topBucket.count} students, ${topBucket.pctOfScored}%).`);
  return out;
}

export async function exportAssessmentPDF(report) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const s = report.stats;

  // ---- Header band ----
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 92, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, 92, W, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Assessment Performance Report', M, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(safe(report.assessment.title), M, 64);
  doc.setFontSize(9.5);
  doc.setTextColor(200, 220, 230);
  doc.text(
    `${safe(report.batch.program_name)}  •  ${safe(report.assessment.batch_id)}  •  ${safe(report.assessment.assessed_on)}`,
    M, 80
  );

  let y = 116;
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text(
    `Institution: ${safe(report.batch.customer_name)}    |    Trainer: ${safe(report.batch.trainer_name)}    |    Generated: ${new Date().toLocaleString()}`,
    M, y
  );
  y += 18;

  // ---- KPI cards ----
  const cards = [
    { label: 'Average', value: `${safe(s.mean_pct, '—')}%`, color: BRAND },
    { label: 'Median', value: `${safe(s.median_pct, '—')}%`, color: BRAND },
    { label: 'Pass Rate', value: `${safe(s.pass_rate, '—')}%`, color: ACCENT },
    { label: 'Scored', value: `${safe(s.scored_count)}/${safe(s.total_enrolled)}`, color: BRAND },
  ];
  const cw = (W - M * 2 - 3 * 10) / 4;
  cards.forEach((c, i) => {
    const x = M + i * (cw + 10);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, cw, 56, 6, 6, 'F');
    doc.setFillColor(...c.color);
    doc.roundedRect(x, y, 4, 56, 2, 2, 'F');
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(c.label.toUpperCase(), x + 12, y + 18);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(String(c.value), x + 12, y + 42);
  });
  y += 78;

  // ---- Performance Summary table ----
  sectionTitle(doc, 'Performance Summary', M, y);
  y += 6;
  applyAutoTable(doc, {
    startY: y,
    head: [['Rank', 'Student', 'Student ID', 'Score', 'Max', '%']],
    body: report.scores.length
      ? report.scores.map((r, i) => [i + 1, safe(r.student_name), r.student_id, r.score, r.max_score, `${r.pct}%`])
      : [['', 'No scores recorded yet', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    margin: { left: M, right: M },
    styles: { cellPadding: 5 },
  });
  y = doc.lastAutoTable.finalY + 26;

  // ---- Analysis & Insights ----
  if (y > 660) { doc.addPage(); y = 60; }
  sectionTitle(doc, 'Analysis & Insights', M, y);
  y += 12;

  // Distribution mini bar-chart
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text('Score Distribution', M, y);
  y += 8;
  const chartX = M;
  const barMax = (W - M * 2) * 0.62;
  const rowH = 18;
  report.distribution.forEach((d) => {
    const bw = d.count ? (d.count / Math.max(1, s.scored_count)) * barMax : 0;
    doc.setFillColor(...LIGHT);
    doc.rect(chartX, y, barMax + 52, rowH - 4, 'F');
    if (bw > 0) { doc.setFillColor(...ACCENT); doc.rect(chartX, y, bw, rowH - 4, 'F'); }
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(d.label, chartX + bw + 6, y + 11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`${d.count} (${d.pctOfScored}%)`, chartX + bw + 56, y + 11);
    y += rowH;
  });
  y += 16;

  // Narrative
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(40, 50, 65);
  buildInsights(report).forEach((line) => {
    const wrapped = doc.splitTextToSize('•  ' + line, W - M * 2 - 8);
    wrapped.forEach((ww) => {
      if (y > 770) { doc.addPage(); y = 60; }
      doc.text(ww, M + 4, y);
      y += 13;
    });
  });

  // ---- Footer (all pages) ----
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(220, 225, 230);
    doc.line(M, 800, W - M, 800);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('Mira CRM — Confidential training assessment report', M, 812);
    doc.text(`Page ${p} of ${pages}`, W - M, 812, { align: 'right' });
  }

  doc.save(`${report.assessment.id}_${slug(report.assessment.title)}_report.pdf`);
}

export function exportAssessmentExcel(report) {
  const wb = XLSX.utils.book_new();
  const s = report.stats;

  // Sheet 1 — Summary
  const summary = [
    ['Assessment Performance Report'],
    [],
    ['Title', report.assessment.title],
    ['Assessment ID', report.assessment.id],
    ['Batch', report.assessment.batch_id],
    ['Program', report.batch.program_name],
    ['Institution', report.batch.customer_name],
    ['Trainer', report.batch.trainer_name],
    ['Assessment Date', report.assessment.assessed_on],
    ['Max Score', report.assessment.max_score],
    ['Pass Threshold (50%)', `${report.assessment.pass_threshold} / ${report.assessment.max_score}`],
    [],
    ['Metric', 'Value'],
    ['Students Scored', s.scored_count],
    ['Total Enrolled', s.total_enrolled],
    ['Pending', s.pending_count],
    ['Average %', s.mean_pct],
    ['Median %', s.median_pct],
    ['Highest %', s.max_pct],
    ['Lowest %', s.min_pct],
    ['Range %', s.range_pct],
    ['Std Dev %', s.stddev_pct],
    ['Passed (>=50%)', s.pass_count],
    ['Failed', s.fail_count],
    ['Pass Rate %', s.pass_rate],
    ['Batch Avg (all assessments)', report.batch_comparison.batch_avg_all],
    ['Delta vs Batch Avg', report.batch_comparison.delta],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  // Sheet 2 — Marks
  const marks = [['Rank', 'Student ID', 'Student Name', 'Score', 'Max Score', 'Percentage']];
  if (report.scores.length) {
    report.scores.forEach((r, i) => marks.push([i + 1, r.student_id, r.student_name, r.score, r.max_score, `${r.pct}%`]));
  } else {
    marks.push(['', '', 'No scores recorded', '', '', '']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(marks), 'Marks');

  // Sheet 3 — Distribution
  const dist = [['Band', 'Count', '% of Scored']];
  report.distribution.forEach((d) => dist.push([d.label, d.count, `${d.pctOfScored}%`]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dist), 'Distribution');

  // Sheet 4 — Insights
  const ins = buildInsights(report).map((line) => [line]);
  ins.unshift(['Analysis & Insights']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ins), 'Insights');

  XLSX.writeFile(wb, `${report.assessment.id}_${slug(report.assessment.title)}_report.xlsx`);
}
