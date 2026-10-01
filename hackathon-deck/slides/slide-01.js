// slide-01.js — Cover (dark hero)
const pptxgen = require("pptxgenjs");
const H = require("./_helpers.js");

const slideConfig = { type: "cover", index: 1, title: "Mira — Cover" };

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.primary };

  // decorative depth shapes (solid + transparency, no gradients)
  slide.addShape(pres.shapes.OVAL, {
    x: 7.2, y: -1.6, w: 4.6, h: 4.6,
    fill: { color: theme.secondary, transparency: 86 }
  });
  slide.addShape(pres.shapes.OVAL, {
    x: -1.4, y: 3.3, w: 3.4, h: 3.4,
    fill: { color: theme.accent, transparency: 88 }
  });

  // left accent bar
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 0.92, w: 0.1, h: 2.02,
    fill: { color: theme.accent }
  });

  slide.addText("MIRA", {
    x: 0.85, y: 0.82, w: 6, h: 1.12,
    fontSize: 68, fontFace: H.HEAD, bold: true,
    color: "FFFFFF", align: "left", valign: "middle", margin: 0
  });

  slide.addText("One Platform. Every EduTech Operation Connected.", {
    x: 0.87, y: 1.96, w: 8.4, h: 0.44,
    fontSize: 21, fontFace: H.HEAD,
    color: theme.light, align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  slide.addText("CRM + Training Delivery + Finance — in one traceable workspace.", {
    x: 0.87, y: 2.44, w: 8.4, h: 0.36,
    fontSize: 12.5, fontFace: H.BODY,
    color: "FFFFFF", align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  // lifecycle strip
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.6, y: 3.42, w: 8.8, h: 0.82,
    fill: { color: H.C.panelDark2 },
    rectRadius: 0.1
  });
  slide.addText("LIFECYCLE", {
    x: 0.78, y: 3.5, w: 2, h: 0.22,
    fontSize: 8, fontFace: H.HEAD, bold: true, charSpacing: 2.5,
    color: theme.accent, align: "left", valign: "middle", margin: 0
  });
  slide.addText("ENQUIRY  \u2192  LEAD  \u2192  FOLLOW-UP  \u2192  CONVERSION  \u2192  CUSTOMER  \u2192  PROGRAM  \u2192  BATCH  \u2192  STUDENTS  \u2192  ATTENDANCE  \u2192  QUOTATION  \u2192  INVOICE  \u2192  PAYMENT  \u2192  DASHBOARD", {
    x: 0.78, y: 3.72, w: 8.44, h: 0.44,
    fontSize: 9, fontFace: H.HEAD, bold: true,
    color: "FFFFFF", align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  // footer
  slide.addText("RAMPeX Hackathon  \u00b7  Team Mira", {
    x: 0.6, y: 4.72, w: 4.6, h: 0.3,
    fontSize: 11, fontFace: H.HEAD, bold: true,
    color: "FFFFFF", align: "left", valign: "middle", margin: 0
  });
  slide.addText("React 18 + Vite  \u00b7  Node.js + Express  \u00b7  SQLite / MySQL 8", {
    x: 4.4, y: 4.72, w: 5.0, h: 0.3,
    fontSize: 10, fontFace: H.BODY,
    color: theme.light, align: "right", valign: "middle", margin: 0, fit: "shrink"
  });

  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 5.12, w: 8.8, h: 0.02,
    fill: { color: theme.secondary, transparency: 40 }
  });

  return slide;
}

module.exports = { createSlide, slideConfig };

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = { primary: "023047", secondary: "219EBC", accent: "FB8500", light: "8ECAE6", bg: "FFFFFF" };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-01-preview.pptx" });
}
