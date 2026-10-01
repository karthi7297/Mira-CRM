// slide-05.js — Key features by module
const pptxgen = require("pptxgenjs");
const H = require("./_helpers.js");

const slideConfig = { type: "content", index: 5, title: "Key Features — Three Modules, One Backend" };

const MODULES = [
  {
    name: "CRM", tag: "Acquire & convert", color: "219EBC",
    items: [
      "Lead pipeline with enforced status flow: NEW \u2192 CONTACTED \u2192 QUALIFIED \u2192 PROPOSAL \u2192 CONVERTED (terminal: LOST, CLOSED)",
      "Search, filter and a follow-up timeline (date, method, notes, next action)",
      "1-click Lead \u2192 Customer conversion \u2014 CUST-XXX generated, lead_id preserved, no duplicates",
      "Auto-captured leads from the public enquiry form, flagged with an AUTO badge",
      "Customer list + Customer 360"
    ]
  },
  {
    name: "TRAINING", tag: "Deliver & track", color: "2A9D8F",
    items: [
      "Programs, trainers and batches (program + customer + trainer + dates + capacity + status)",
      "Students & enrollments \u2014 trainer-owned workflow; org / institution see aggregates only",
      "Bulk student import from CSV / Excel with preview",
      "Session scheduling + attendance PRESENT / ABSENT / LATE per student; batch % recalculated",
      "Assessments & scores, per-student report, Top Students report",
      "Trainer leave requests + org approval flow"
    ]
  },
  {
    name: "FINANCE", tag: "Bill & collect", color: "FB8500",
    items: [
      "Quotations with line items; 1-click Quotation \u2192 Invoice conversion",
      "Money math enforced in SQL triggers, not just the UI: total = subtotal + tax \u2212 discount",
      "Payment recording with overpayment rejection",
      "Status flow UNPAID \u2192 PARTIALLY_PAID \u2192 PAID (+ OVERDUE by due date)",
      "Expenses with categories + trainer-linked payouts; printable receipts",
      "Risk-ranked Collections Queue"
    ]
  }
];

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  H.addHeader(
    slide, theme,
    "04  \u00b7  KEY FEATURES",
    "Three Modules, One Backend",
    "Everything an EduTech operator needs \u2014 and every screen is role-scoped, so each user sees only their slice."
  );

  const colW = 2.8333;
  const gap = 0.25;
  const y = 1.42;
  const cardH = 3.61;

  MODULES.forEach(function (m, i) {
    const x = 0.5 + i * (colW + gap);

    H.addCard(slide, pres, {
      x: x, y: y, w: colW, h: cardH,
      fill: H.C.white, radius: 0.1, line: H.C.rule, lineWidth: 0.75
    });

    slide.addShape(pres.shapes.RECTANGLE, {
      x: x, y: y, w: colW, h: 0.52,
      fill: { color: m.color }
    });
    slide.addText(m.name, {
      x: x + 0.16, y: y + 0.02, w: colW - 0.32, h: 0.3,
      fontSize: 14, fontFace: H.HEAD, bold: true, charSpacing: 1,
      color: "FFFFFF", align: "left", valign: "middle", margin: 0
    });
    slide.addText(m.tag, {
      x: x + 0.16, y: y + 0.28, w: colW - 0.32, h: 0.2,
      fontSize: 8, fontFace: H.BODY, color: "FFFFFF",
      align: "left", valign: "middle", margin: 0
    });

    slide.addText(H.bulletItems(m.items, { fontSize: 8.5, paraSpaceAfter: 6 }), {
      x: x + 0.16, y: y + 0.62, w: colW - 0.3, h: cardH - 0.72,
      align: "left", valign: "top", margin: 0
    });
  });

  slide.addText([
    { text: "Role-scoped everywhere:  ", options: { bold: true, color: theme.primary, fontSize: 9.5, fontFace: H.HEAD } },
    { text: "org sees platform totals, institution sees its own college, trainer sees my batches, student sees My Learning.", options: { color: H.C.muted, fontSize: 9.5, fontFace: H.BODY } }
  ], {
    x: 0.5, y: 5.13, w: 8.6, h: 0.3,
    align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  H.addBadge(slide, pres, theme, 5);
  return slide;
}

module.exports = { createSlide, slideConfig };

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = { primary: "023047", secondary: "219EBC", accent: "FB8500", light: "8ECAE6", bg: "FFFFFF" };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-05-preview.pptx" });
}
