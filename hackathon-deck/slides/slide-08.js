// slide-08.js — Extra innovations (5-8)
const pptxgen = require("pptxgenjs");
const H = require("./_helpers.js");

const slideConfig = { type: "content", index: 8, title: "Beyond a Standard CRM — Innovations 5-8" };

const INNOV = [
  {
    n: "IN-5", flow: "OUTREACH", color: "FB8500",
    title: "Cold-Mail Outreach Engine",
    desc: "Built-in lead generation, org-only: Templates \u2192 Campaigns \u2192 Audience \u2192 throttled send queue. A server-side scheduler means closing the browser never stops a campaign (DRAFT \u2192 RUNNING \u2192 PAUSED \u2192 COMPLETED), with suppression list, 2-step unsubscribe, open-tracking pixel and bounce handling."
  },
  {
    n: "IN-6", flow: "AI", color: "219EBC",
    title: "Mira AI \u2014 Role-Scoped Read-Only Assistant",
    desc: "A floating \u201cAsk Mira AI\u201d panel on every screen with role-shaped starter prompts. The client sends only the conversation; scope resolves server-side from auth headers \u2014 a student can never ask about another student's data. Read-only by design: it answers from data your role can already see."
  },
  {
    n: "IN-7", flow: "NOTIFICATIONS", color: "2A9D8F",
    title: "Actionable Notifications + Announcements",
    desc: "Every business event \u2014 invoice raised, payment recorded, leave request, ticket reply \u2014 emits a notification aimed at one user or a whole role, with a per-user read count. Each item deep-links to its record, so it is an action, not a badge. Org broadcasts announcements to all roles."
  },
  {
    n: "IN-8", flow: "EVERY LIST", color: "023047",
    title: "Universal List Toolkit",
    desc: "One toolkit gives every list the same power: search, filters, date range, sort, pagination, bulk select with bulk actions, CSV export, an archive toggle and saved views \u2014 applied across leads, batches, students, invoices and more. Consistent UX with zero duplicated list code."
  }
];

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  H.addHeader(
    slide, theme,
    "06  \u00b7  INNOVATION (2/2)",
    "Beyond a Standard CRM \u2014 Part 2",
    "Built-in prospecting, scoped AI, an actionable notification inbox and a toolkit shared by every list."
  );

  const colX = [0.5, 5.15];
  const cardW = 4.35;
  const cardH = 1.66;
  const rowY = [1.42, 3.18];

  INNOV.forEach(function (it, i) {
    const x = colX[i % 2];
    const y = rowY[Math.floor(i / 2)];

    H.addCard(slide, pres, {
      x: x, y: y, w: cardW, h: cardH,
      fill: H.C.white, radius: 0.1, line: H.C.rule, lineWidth: 0.75
    });

    slide.addShape(pres.shapes.RECTANGLE, {
      x: x, y: y + 0.16, w: 0.07, h: cardH - 0.32,
      fill: { color: it.color }
    });

    H.addPill(slide, pres, x + 0.2, y + 0.16, 0.62, 0.24, it.color, it.n, 8.5);
    slide.addText(it.flow, {
      x: x + 0.88, y: y + 0.16, w: 1.6, h: 0.24,
      fontSize: 8, fontFace: H.HEAD, bold: true, charSpacing: 1,
      color: H.C.muted, align: "left", valign: "middle", margin: 0
    });

    slide.addText(it.title, {
      x: x + 0.2, y: y + 0.44, w: cardW - 0.36, h: 0.3,
      fontSize: 11.5, fontFace: H.HEAD, bold: true,
      color: theme.primary, align: "left", valign: "middle", margin: 0, fit: "shrink"
    });

    slide.addText(it.desc, {
      x: x + 0.2, y: y + 0.74, w: cardW - 0.36, h: cardH - 0.86,
      fontSize: 8.5, fontFace: H.BODY, color: H.C.ink,
      align: "left", valign: "top", margin: 0
    });
  });

  slide.addText([
    { text: "Honest by design:  ", options: { bold: true, color: theme.accent, fontSize: 9.5, fontFace: H.HEAD } },
    { text: "collections ranking is rule-based (not ML) and Mira AI is read-only Q&A over scoped data \u2014 we never overclaim.", options: { color: H.C.muted, fontSize: 9.5, fontFace: H.BODY } }
  ], {
    x: 0.5, y: 5.13, w: 8.6, h: 0.3,
    align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  H.addBadge(slide, pres, theme, 8);
  return slide;
}

module.exports = { createSlide, slideConfig };

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = { primary: "023047", secondary: "219EBC", accent: "FB8500", light: "8ECAE6", bg: "FFFFFF" };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-08-preview.pptx" });
}
