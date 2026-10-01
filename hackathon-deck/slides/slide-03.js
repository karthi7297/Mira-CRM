// slide-03.js — Our Solution: what Mira is
const pptxgen = require("pptxgenjs");
const H = require("./_helpers.js");

const slideConfig = { type: "content", index: 3, title: "Mira — One Traceable Pipeline" };

const PHASES = [
  { n: "01", name: "ACQUIRE", color: "219EBC", items: ["Enquiry", "Lead", "Follow-up", "Conversion"] },
  { n: "02", name: "DELIVER", color: "2A9D8F", items: ["Program", "Batch", "Students", "Attendance"] },
  { n: "03", name: "BILL", color: "FB8500", items: ["Quotation", "Invoice", "Payment"] },
  { n: "04", name: "DECIDE", color: "023047", items: ["Customer 360", "Dashboard"] }
];

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  H.addHeader(
    slide, theme,
    "02  \u00b7  THE SOLUTION",
    "Mira: One Traceable Pipeline",
    "A full-stack EduTech operations platform \u2014 not just a lead tracker. Data is created once and flows forward."
  );

  const cardW = 2.0625;
  const cardH = 1.72;
  const gap = 0.25;
  const startX = 0.5;
  const y = 1.42;

  PHASES.forEach(function (ph, i) {
    const x = startX + i * (cardW + gap);

    H.addCard(slide, pres, {
      x: x, y: y, w: cardW, h: cardH,
      fill: H.C.white, radius: 0.1, line: H.C.rule, lineWidth: 0.75
    });

    // header band
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x, y: y, w: cardW, h: 0.44,
      fill: { color: ph.color }
    });
    slide.addText(ph.n + "   " + ph.name, {
      x: x + 0.14, y: y, w: cardW - 0.24, h: 0.44,
      fontSize: 10.5, fontFace: H.HEAD, bold: true, charSpacing: 1,
      color: "FFFFFF", align: "left", valign: "middle", margin: 0
    });

    slide.addText(ph.items.map(function (t, k) {
      return {
        text: t,
        options: { bullet: true, breakLine: true, fontSize: 10, color: H.C.ink, paraSpaceAfter: 4 }
      };
    }), {
      x: x + 0.16, y: y + 0.5, w: cardW - 0.28, h: cardH - 0.56,
      align: "left", valign: "top", margin: 0
    });

    if (i < PHASES.length - 1) {
      slide.addText("\u203a", {
        x: x + cardW + 0.005, y: y + 0.62, w: gap - 0.01, h: 0.5,
        fontSize: 20, fontFace: H.HEAD, bold: true,
        color: theme.secondary, align: "center", valign: "middle", margin: 0
      });
    }
  });

  // traceability panel
  H.addCard(slide, pres, {
    x: 0.5, y: 3.34, w: 9.0, h: 1.05,
    fill: theme.primary, radius: 0.1, shadow: false
  });
  slide.addText("ONE CUSTOMER, FULLY TRACEABLE", {
    x: 0.72, y: 3.44, w: 5, h: 0.24,
    fontSize: 9, fontFace: H.HEAD, bold: true, charSpacing: 2,
    color: theme.accent, align: "left", valign: "middle", margin: 0
  });
  slide.addText("A manager follows any account end-to-end: enquiry \u2192 sales \u2192 conversion \u2192 training \u2192 attendance \u2192 invoice \u2192 payment \u2192 financial outcome \u2014 with no re-entry anywhere in the chain.", {
    x: 0.72, y: 3.68, w: 8.56, h: 0.34,
    fontSize: 10, fontFace: H.BODY, color: "FFFFFF",
    align: "left", valign: "middle", margin: 0, fit: "shrink"
  });
  slide.addText("4 logins  \u00b7  1 backend  \u00b7  server-side scope enforcement (scope.js)  \u00b7  13 lifecycle stages  \u00b7  3 modules", {
    x: 0.72, y: 4.06, w: 8.56, h: 0.26,
    fontSize: 9, fontFace: H.HEAD, bold: true,
    color: theme.light, align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  // what it is NOT
  slide.addText([
    { text: "What Mira is NOT:  ", options: { bold: true, color: theme.primary, fontSize: 9.5, fontFace: H.HEAD } },
    { text: "not a full accounting suite \u00b7 not payroll/HR \u00b7 not a GST engine \u00b7 not microservices \u2014 deliberately scoped to the operating lifecycle.", options: { color: H.C.muted, fontSize: 9.5, fontFace: H.BODY } }
  ], {
    x: 0.5, y: 4.5, w: 8.6, h: 0.3,
    align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  H.addBadge(slide, pres, theme, 3);
  return slide;
}

module.exports = { createSlide, slideConfig };

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = { primary: "023047", secondary: "219EBC", accent: "FB8500", light: "8ECAE6", bg: "FFFFFF" };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-03-preview.pptx" });
}
