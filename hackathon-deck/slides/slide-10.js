// slide-10.js — Impact, roadmap and closing (dark)
const pptxgen = require("pptxgenjs");
const H = require("./_helpers.js");

const slideConfig = { type: "summary", index: 10, title: "Impact, Scalability & What's Next" };

const IMPACT = [
  ["Time", "Single entry, zero re-entry: an enquiry typed once flows to lead \u2192 customer \u2192 batch \u2192 invoice. 1-click conversions remove the two most error-prone copy-paste jobs, and bulk CSV import onboards a whole batch in minutes."],
  ["Cash", "Public enquiry capture stops lead leakage; the cold-mail engine builds pipeline with no extra tool; the collections queue focuses effort on HIGH-risk dues first."],
  ["Trust", "A 75% certificate gate plus public verification makes credentials checkable; per-student weak-area reports improve outcomes; colleges see proof of delivery without seeing each other's data."],
  ["Governance", "Every number reconciles (dashboard = invoices \u2212 payments) and the activity feed audits who did what."]
];

const ROADMAP = [
  "Payment gateway + UPI / cards, with WhatsApp & email dunning wired to the collections queue",
  "Timetable clash detection + trainer workload balancing",
  "Fee-installment plans + automated receipts",
  "Mobile-first attendance and a parent / institution portal",
  "Deeper Mira AI \u2014 anomaly alerts (\u201cBatch B-104 attendance dropped 12%\u201d), still scoped and read-only",
  "GST-ready invoicing beyond the 18% default"
];

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.primary };

  slide.addShape(pres.shapes.OVAL, {
    x: 8.0, y: -1.9, w: 4.2, h: 4.2,
    fill: { color: theme.secondary, transparency: 88 }
  });

  // header (dark variant)
  slide.addText("08  \u00b7  IMPACT & SCALABILITY", {
    x: 0.5, y: 0.26, w: 9, h: 0.24,
    fontSize: 10, fontFace: H.HEAD, bold: true, charSpacing: 3,
    color: theme.accent, align: "left", valign: "middle", margin: 0
  });
  slide.addText("Why Mira Wins \u2014 and What's Next", {
    x: 0.5, y: 0.48, w: 9, h: 0.5,
    fontSize: 25, fontFace: H.HEAD, bold: true,
    color: "FFFFFF", align: "left", valign: "middle", margin: 0, fit: "shrink"
  });
  slide.addText("Replaces 4 tools (lead tracker + attendance sheets + billing + mail tool) with one traceable pipeline.", {
    x: 0.5, y: 0.98, w: 9, h: 0.3,
    fontSize: 10.5, fontFace: H.BODY,
    color: theme.light, align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  // ---- left: impact
  H.addCard(slide, pres, {
    x: 0.5, y: 1.4, w: 4.4, h: 2.9,
    fill: H.C.panelDark, radius: 0.1, shadow: false
  });
  slide.addText("IMPACT", {
    x: 0.68, y: 1.5, w: 2, h: 0.24,
    fontSize: 9.5, fontFace: H.HEAD, bold: true, charSpacing: 2,
    color: theme.accent, align: "left", valign: "middle", margin: 0
  });

  IMPACT.forEach(function (it, i) {
    const y = 1.78 + i * 0.63;
    slide.addText([
      { text: it[0] + " \u2014 ", options: { bold: true, color: theme.light, fontSize: 8.5, fontFace: H.HEAD } },
      { text: it[1], options: { color: "FFFFFF", fontSize: 8, fontFace: H.BODY } }
    ], {
      x: 0.68, y: y, w: 4.06, h: 0.6,
      align: "left", valign: "top", margin: 0
    });
  });

  // ---- right: roadmap
  H.addCard(slide, pres, {
    x: 5.1, y: 1.4, w: 4.4, h: 2.9,
    fill: H.C.panelDark, radius: 0.1, shadow: false
  });
  slide.addText("ROADMAP", {
    x: 5.28, y: 1.5, w: 2, h: 0.24,
    fontSize: 9.5, fontFace: H.HEAD, bold: true, charSpacing: 2,
    color: theme.accent, align: "left", valign: "middle", margin: 0
  });

  ROADMAP.forEach(function (t, i) {
    const y = 1.78 + i * 0.42;
    H.addNumCircle(slide, pres, 5.28, y + 0.03, 0.24, theme.secondary, i + 1, 8.5);
    slide.addText(t, {
      x: 5.6, y: y, w: 3.78, h: 0.4,
      fontSize: 8, fontFace: H.BODY, color: "FFFFFF",
      align: "left", valign: "top", margin: 0
    });
  });

  // ---- closing band
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.42, w: 9.0, h: 0.4,
    fill: { color: theme.accent }
  });
  slide.addText("From first enquiry to final payment \u2014 one platform, every EduTech operation connected.", {
    x: 0.5, y: 4.42, w: 9.0, h: 0.4,
    fontSize: 12, fontFace: H.HEAD, bold: true,
    color: "FFFFFF", align: "center", valign: "middle", margin: 0, fit: "shrink"
  });

  // ---- demo logins
  slide.addText([
    { text: "Demo logins:  ", options: { bold: true, color: theme.light, fontSize: 8.5, fontFace: H.HEAD } },
    { text: "org@rampex.demo / org123   \u00b7   abc@college.edu / abc123   \u00b7   trainer@rampex.demo / trainer123   \u00b7   arun@student.edu / arun123", options: { color: "FFFFFF", fontSize: 8.5, fontFace: H.BODY } }
  ], {
    x: 0.5, y: 4.92, w: 8.6, h: 0.3,
    align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  H.addBadge(slide, pres, theme, 10);
  return slide;
}

module.exports = { createSlide, slideConfig };

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = { primary: "023047", secondary: "219EBC", accent: "FB8500", light: "8ECAE6", bg: "FFFFFF" };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-10-preview.pptx" });
}
