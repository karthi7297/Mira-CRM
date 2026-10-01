// slide-07.js — Extra innovations (1-4)
const pptxgen = require("pptxgenjs");
const H = require("./_helpers.js");

const slideConfig = { type: "content", index: 7, title: "Beyond a Standard CRM — Innovations 1-4" };

const INNOV = [
  {
    n: "IN-1", flow: "FLOW W", color: "219EBC",
    title: "Public Enquiry \u2192 Auto-Lead Capture",
    desc: "A no-login /enquire form creates a lead (source = Website, status NEW) plus a system follow-up entry. Zero-friction demand capture \u2014 the demo literally starts here."
  },
  {
    n: "IN-2", flow: "FLOW X", color: "2A9D8F",
    title: "Risk-Ranked Collections Queue",
    desc: "Outstanding invoices ranked HIGH / MEDIUM / LOW by explicit rules (overdue days + ticket size + payment history), with the reason shown on every row. Honestly rule-based \u2014 never claimed as ML."
  },
  {
    n: "IN-3", flow: "FLOW Y", color: "FB8500",
    title: "Certificates + Public Verification",
    desc: "Org issues certificates (CERT-XXX, code RNX-YYYY-NNNN) only when batch attendance \u2265 75% \u2014 otherwise a 422 with the reason. Anyone verifies at /verify with no login. Kills credential forgery."
  },
  {
    n: "IN-4", flow: "SERVICE DESK", color: "023047",
    title: "Support Desk & Institution Requests",
    desc: "Institutions raise tickets and change requests \u2014 schedule, trainer, student transfer, billing, access \u2014 with priority (LOW \u2192 URGENT) and a status flow OPEN \u2192 IN_PROGRESS \u2192 RESOLVED \u2192 CLOSED. Org replies in-thread, so escalations sit beside the customer they are about."
  }
];

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  H.addHeader(
    slide, theme,
    "06  \u00b7  INNOVATION (1/2)",
    "Beyond a Standard CRM \u2014 Part 1",
    "The screens that separate Mira from Zoho and spreadsheets. Each one is implemented and demoable \u2014 not a mockup."
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

    // left accent bar
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x, y: y + 0.16, w: 0.07, h: cardH - 0.32,
      fill: { color: it.color }
    });

    H.addPill(slide, pres, x + 0.2, y + 0.16, 0.62, 0.24, it.color, it.n, 8.5);
    slide.addText(it.flow, {
      x: x + 0.88, y: y + 0.16, w: 1.4, h: 0.24,
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
    { text: "All four are live in the build:  ", options: { bold: true, color: theme.accent, fontSize: 9.5, fontFace: H.HEAD } },
    { text: "public enquiry capture, collections ranking, certificate verification and the institution support desk.", options: { color: H.C.muted, fontSize: 9.5, fontFace: H.BODY } }
  ], {
    x: 0.5, y: 5.13, w: 8.6, h: 0.3,
    align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  H.addBadge(slide, pres, theme, 7);
  return slide;
}

module.exports = { createSlide, slideConfig };

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = { primary: "023047", secondary: "219EBC", accent: "FB8500", light: "8ECAE6", bg: "FFFFFF" };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-07-preview.pptx" });
}
