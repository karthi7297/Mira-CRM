// slide-04.js — The 4-role access model
const pptxgen = require("pptxgenjs");
const H = require("./_helpers.js");

const slideConfig = { type: "content", index: 4, title: "Four Operationally Distinct Roles" };

const ROLES = [
  {
    name: "Organization", sub: "Rampex  \u00b7  org@rampex.demo",
    color: "023047",
    scope: "Everything \u2014 all institutions",
    can: "Only role that creates & converts: leads, programs, batches, invoices, expenses. Student data is aggregate-only."
  },
  {
    name: "Institution", sub: "College / Rampex Direct  \u00b7  abc@college.edu",
    color: "219EBC",
    scope: "Own customer_id only",
    can: "Own dashboard, batches and finance; can view + pay invoices. No student management."
  },
  {
    name: "Trainer", sub: "Rampex staff  \u00b7  trainer@rampex.demo",
    color: "2A9D8F",
    scope: "Assigned trainer_id batches",
    can: "Owns student management \u2014 adds students, marks attendance, runs assessments, per-student reports, own payouts."
  },
  {
    name: "Student", sub: "arun@student.edu",
    color: "FB8500",
    scope: "Own student_id only",
    can: "My Learning: profile, attendance, scores + weak areas, materials, interests, fees & dues."
  }
];

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  H.addHeader(
    slide, theme,
    "03  \u00b7  ACCESS MODEL",
    "Four Operationally Distinct Roles",
    "\u201cRampex operates, institutions consume.\u201d Scope is enforced server-side \u2014 spoofed headers can't widen access."
  );

  // column labels
  slide.addText("ROLE  /  LOGIN", { x: 0.5, y: 1.42, w: 2.5, h: 0.26, fontSize: 8, fontFace: H.HEAD, bold: true, charSpacing: 1.5, color: H.C.muted, align: "left", valign: "middle", margin: 0 });
  slide.addText("SCOPE", { x: 3.15, y: 1.42, w: 1.7, h: 0.26, fontSize: 8, fontFace: H.HEAD, bold: true, charSpacing: 1.5, color: H.C.muted, align: "left", valign: "middle", margin: 0 });
  slide.addText("CAN DO", { x: 5.0, y: 1.42, w: 4.5, h: 0.26, fontSize: 8, fontFace: H.HEAD, bold: true, charSpacing: 1.5, color: H.C.muted, align: "left", valign: "middle", margin: 0 });

  const rowH = 0.78;
  const gapY = 0.06;
  const startY = 1.72;

  ROLES.forEach(function (r, i) {
    const y = startY + i * (rowH + gapY);

    // role block
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y: y, w: 2.55, h: rowH,
      fill: { color: r.color }
    });
    slide.addText([
      { text: r.name, options: { bold: true, breakLine: true, fontSize: 12, color: "FFFFFF", fontFace: H.HEAD } },
      { text: r.sub, options: { fontSize: 8, color: "FFFFFF", fontFace: H.BODY } }
    ], {
      x: 0.62, y: y + 0.04, w: 2.35, h: rowH - 0.08,
      align: "left", valign: "middle", margin: 0, paraSpaceAfter: 2
    });

    // scope
    H.addCard(slide, pres, {
      x: 3.15, y: y, w: 1.75, h: rowH,
      fill: theme.light, transparency: 78, radius: 0.07, shadow: false, line: H.C.rule, lineWidth: 0.5
    });
    slide.addText(r.scope, {
      x: 3.27, y: y, w: 1.55, h: rowH,
      fontSize: 8.5, fontFace: H.BODY, bold: true, color: theme.primary,
      align: "left", valign: "middle", margin: 0, fit: "shrink"
    });

    // can do
    H.addCard(slide, pres, {
      x: 5.0, y: y, w: 4.5, h: rowH,
      fill: H.C.white, radius: 0.07, shadow: false, line: H.C.rule, lineWidth: 0.5
    });
    slide.addText(r.can, {
      x: 5.12, y: y, w: 4.28, h: rowH,
      fontSize: 8.5, fontFace: H.BODY, color: H.C.ink,
      align: "left", valign: "middle", margin: 0, fit: "shrink"
    });
  });

  slide.addText([
    { text: "Why this is unusual:  ", options: { bold: true, color: theme.accent, fontSize: 9.5, fontFace: H.HEAD } },
    { text: "most CRMs have just admin / user. Mira has 4 roles at different levels of aggregation \u2014 platform \u2192 college \u2192 batch \u2192 self.", options: { color: H.C.muted, fontSize: 9.5, fontFace: H.BODY } }
  ], {
    x: 0.5, y: 5.13, w: 8.6, h: 0.3,
    align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  H.addBadge(slide, pres, theme, 4);
  return slide;
}

module.exports = { createSlide, slideConfig };

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = { primary: "023047", secondary: "219EBC", accent: "FB8500", light: "8ECAE6", bg: "FFFFFF" };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-04-preview.pptx" });
}
