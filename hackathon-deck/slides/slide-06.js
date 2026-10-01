// slide-06.js — The 2-minute hero demo + Customer 360
const pptxgen = require("pptxgenjs");
const H = require("./_helpers.js");

const slideConfig = { type: "content", index: 6, title: "The 2-Minute Hero Demo" };

const STEPS = [
  "Public enquiry (/enquire) \u2192 auto-captured lead with an AUTO badge",
  "Lead NEW \u2192 CONTACTED \u2192 QUALIFIED \u2192 1-click Convert \u2192 CUST-XXX, lead_id preserved",
  "Create Program \u2192 Create Batch (customer + trainer + dates + capacity)",
  "Trainer enrols a student \u2192 marks attendance (PRESENT / ABSENT / LATE)",
  "Create Quotation \u2192 1-click Convert to Invoice (line items carried over)",
  "Record Payment \u2192 UNPAID \u2192 PARTIALLY_PAID \u2192 PAID; overpayment rejected",
  "Dashboard + Customer 360 update live"
];

const TREE = [
  ["Lead origin", "enquiry, follow-ups, conversion"],
  ["Training", "programs, batches, attendance %, students"],
  ["Finance", "quotations, invoices, payments, outstanding"],
  ["Summary", "revenue, collected, outstanding, net"]
];

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  H.addHeader(
    slide, theme,
    "05  \u00b7  LIVE DEMO",
    "The 2-Minute Hero Demo",
    "\u201cHere is one customer. Watch what happens to it throughout the whole organization.\u201d"
  );

  // ---- left: numbered flow
  slide.addText("THE FLOW \u2014 run live, one feature at a time", {
    x: 0.5, y: 1.42, w: 5.0, h: 0.26,
    fontSize: 8.5, fontFace: H.HEAD, bold: true, charSpacing: 1.5,
    color: H.C.muted, align: "left", valign: "middle", margin: 0
  });

  const stepH = 0.47;
  STEPS.forEach(function (s, i) {
    const y = 1.72 + i * stepH;
    H.addNumCircle(slide, pres, 0.5, y + 0.06, 0.3, i === 6 ? theme.accent : theme.secondary, i + 1, 10);
    slide.addText(s, {
      x: 0.9, y: y, w: 4.72, h: stepH,
      fontSize: 9.5, fontFace: H.BODY, color: H.C.ink,
      align: "left", valign: "middle", margin: 0, fit: "shrink"
    });
  });

  // ---- right: Customer 360 panel
  H.addCard(slide, pres, {
    x: 5.78, y: 1.42, w: 3.72, h: 3.55,
    fill: theme.primary, radius: 0.1, shadow: false
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 5.78, y: 1.42, w: 3.72, h: 0.46,
    fill: { color: theme.accent }
  });
  slide.addText("SIGNATURE FEATURE  \u00b7  CUSTOMER 360", {
    x: 5.92, y: 1.42, w: 3.46, h: 0.46,
    fontSize: 9, fontFace: H.HEAD, bold: true, charSpacing: 1,
    color: "FFFFFF", align: "left", valign: "middle", margin: 0
  });

  slide.addText("ABC COLLEGE  (CUST-001)", {
    x: 5.94, y: 1.98, w: 3.42, h: 0.28,
    fontSize: 12, fontFace: H.HEAD, bold: true,
    color: "FFFFFF", align: "left", valign: "middle", margin: 0
  });

  TREE.forEach(function (t, i) {
    const y = 2.34 + i * 0.44;
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 5.96, y: y + 0.07, w: 0.06, h: 0.3,
      fill: { color: theme.secondary }
    });
    slide.addText([
      { text: t[0], options: { bold: true, breakLine: true, fontSize: 9.5, color: theme.light, fontFace: H.HEAD } },
      { text: t[1], options: { fontSize: 8.5, color: "FFFFFF", fontFace: H.BODY } }
    ], {
      x: 6.12, y: y, w: 3.24, h: 0.42,
      align: "left", valign: "middle", margin: 0, paraSpaceAfter: 1
    });
  });

  slide.addText("Institution sees its own College 360 \u00b7 Org sees every institution + a comparison table \u00b7 the student roster inside is read-only \u2014 the batch trainer owns the records.", {
    x: 5.94, y: 4.12, w: 3.42, h: 0.76,
    fontSize: 8, fontFace: H.BODY, italic: true, color: theme.light,
    align: "left", valign: "top", margin: 0
  });

  // ---- bottom strip
  slide.addText([
    { text: "Demo login:  ", options: { bold: true, color: theme.primary, fontSize: 9.5, fontFace: H.HEAD } },
    { text: "org@rampex.demo / org123  \u2014  exercises every invariant: 18% tax math, outstanding calculation, status transitions.", options: { color: H.C.muted, fontSize: 9.5, fontFace: H.BODY } }
  ], {
    x: 0.5, y: 5.13, w: 8.6, h: 0.3,
    align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  H.addBadge(slide, pres, theme, 6);
  return slide;
}

module.exports = { createSlide, slideConfig };

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = { primary: "023047", secondary: "219EBC", accent: "FB8500", light: "8ECAE6", bg: "FFFFFF" };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-06-preview.pptx" });
}
