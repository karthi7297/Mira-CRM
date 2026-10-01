// slide-02.js — The Problem: why existing CRMs break for EduTech
const pptxgen = require("pptxgenjs");
const H = require("./_helpers.js");

const slideConfig = { type: "content", index: 2, title: "Existing CRMs Break for EduTech" };

const PROBLEMS = [
  ["Sales disconnected from delivery", "Lead closes, then training runs in another tool \u2014 re-entry, lost context."],
  ["No education objects", "No programs, batches, sessions or attendance \u2014 teams hack custom fields."],
  ["Finance disconnected from training", "Invoices don't know which batch or student they bill \u2014 manual reconciliation."],
  ["No single customer view", "History split across 4 tools. Can't answer \u201chow is ABC College doing?\u201d"],
  ["One-size-fits-all roles", "Colleges, trainers, students share one login \u2014 data leaks or email chaos."],
  ["Money math in the UI, not the DB", "Totals drift between screens; overpayments get accepted."],
  ["Collections are manual", "No ranked follow-up list \u2014 cash sits in overdue invoices."],
  ["No trust layer", "Certificates anyone can forge; enquiries never enter the pipeline."]
];

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  H.addHeader(
    slide, theme,
    "01  \u00b7  THE PROBLEM",
    "Existing CRMs Break for EduTech",
    "Generic CRMs (Salesforce, HubSpot, Zoho) and spreadsheets fail education operators on 8 counts."
  );

  const colX = [0.5, 5.15];
  const cardW = 4.35;
  const cardH = 0.82;
  const gapY = 0.11;
  const startY = 1.42;

  PROBLEMS.forEach(function (p, i) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = colX[col];
    const y = startY + row * (cardH + gapY);

    H.addCard(slide, pres, {
      x: x, y: y, w: cardW, h: cardH,
      fill: theme.light, transparency: 82, radius: 0.09, shadow: false,
      line: H.C.rule, lineWidth: 0.5
    });

    H.addNumCircle(slide, pres, x + 0.13, y + 0.16, 0.32, H.C.red, i + 1, 10.5);

    slide.addText([
      { text: p[0], options: { bold: true, breakLine: true, fontSize: 10.5, color: theme.primary, fontFace: H.HEAD } },
      { text: p[1], options: { fontSize: 8.5, color: H.C.muted, fontFace: H.BODY } }
    ], {
      x: x + 0.55, y: y + 0.06, w: cardW - 0.68, h: cardH - 0.1,
      align: "left", valign: "top", margin: 0, paraSpaceAfter: 1
    });
  });

  slide.addText("Reality check: every EduTech team we looked at runs sales in one tool, attendance in sheets, billing in Tally \u2014 and pays a human to glue it together.", {
    x: 0.5, y: 5.13, w: 8.6, h: 0.3,
    fontSize: 9, fontFace: H.BODY, italic: true, color: H.C.muted,
    align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  H.addBadge(slide, pres, theme, 2);
  return slide;
}

module.exports = { createSlide, slideConfig };

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = { primary: "023047", secondary: "219EBC", accent: "FB8500", light: "8ECAE6", bg: "FFFFFF" };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-02-preview.pptx" });
}
