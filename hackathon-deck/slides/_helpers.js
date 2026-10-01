// _helpers.js — shared design tokens + builders for the Mira hackathon deck
// Palette (professional tech blue + warm accent):
//   primary   023047  deep blue   -> dark backgrounds, titles
//   secondary 219EBC  blue        -> sub-headings, accents
//   accent    FB8500  orange      -> highlights, badges, key numbers
//   light     8ECAE6  pale blue   -> panels / subtle fills
//   bg        FFFFFF  white       -> content background

const C = {
  ink: "0B1F2A",       // near-black body text
  muted: "5A7184",     // captions / secondary text
  red: "D90429",       // semantic: problem
  green: "2A9D8F",     // semantic: solved
  panelDark: "03263A", // card fill on dark slides
  panelDark2: "06344D",
  white: "FFFFFF",
  chip: "E8F4FA",      // very light blue chip
  rule: "D8E6EE"       // hairline
};

const HEAD = "Trebuchet MS";
const BODY = "Calibri";

function makeShadow() {
  return { type: "outer", color: "03263A", blur: 9, offset: 2, angle: 135, opacity: 0.16 };
}

function addBadge(slide, pres, theme, num) {
  slide.addShape(pres.shapes.OVAL, {
    x: 9.32, y: 5.14, w: 0.34, h: 0.34,
    fill: { color: theme.accent }
  });
  slide.addText(String(num).padStart(2, "0"), {
    x: 9.32, y: 5.14, w: 0.34, h: 0.34,
    fontSize: 10.5, fontFace: HEAD, color: "FFFFFF",
    bold: true, align: "center", valign: "middle", margin: 0
  });
}

// kicker + title + subtitle header block (no accent underline — by design)
function addHeader(slide, theme, kicker, title, subtitle) {
  slide.addText(kicker, {
    x: 0.5, y: 0.28, w: 9, h: 0.24,
    fontSize: 10, fontFace: HEAD, bold: true, charSpacing: 3,
    color: theme.accent, align: "left", valign: "middle", margin: 0
  });
  slide.addText(title, {
    x: 0.5, y: 0.50, w: 9, h: 0.5,
    fontSize: 26, fontFace: HEAD, bold: true,
    color: theme.primary, align: "left", valign: "middle", margin: 0, fit: "shrink"
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 1.00, w: 9, h: 0.32,
      fontSize: 11, fontFace: BODY, color: C.muted,
      align: "left", valign: "middle", margin: 0, fit: "shrink"
    });
  }
}

// rounded card
function addCard(slide, pres, opts) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: opts.x, y: opts.y, w: opts.w, h: opts.h,
    fill: { color: opts.fill || C.white, transparency: opts.transparency || 0 },
    line: opts.line ? { color: opts.line, width: opts.lineWidth || 0.75 } : { color: opts.fill || C.white, width: 0 },
    rectRadius: opts.radius === undefined ? 0.1 : opts.radius,
    shadow: opts.shadow === false ? undefined : makeShadow()
  });
}

// small numbered circle
function addNumCircle(slide, pres, x, y, d, fill, label, fontSize, textColor) {
  slide.addShape(pres.shapes.OVAL, {
    x: x, y: y, w: d, h: d,
    fill: { color: fill }
  });
  slide.addText(String(label), {
    x: x, y: y, w: d, h: d,
    fontSize: fontSize || 11, fontFace: HEAD, bold: true,
    color: textColor || "FFFFFF", align: "center", valign: "middle", margin: 0
  });
}

// rounded pill label
function addPill(slide, pres, x, y, w, h, fill, label, fontSize, textColor) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: x, y: y, w: w, h: h,
    fill: { color: fill },
    rectRadius: h / 2
  });
  slide.addText(label, {
    x: x, y: y, w: w, h: h,
    fontSize: fontSize || 8.5, fontFace: HEAD, bold: true,
    color: textColor || "FFFFFF", align: "center", valign: "middle", margin: 0
  });
}

function bulletItems(items, opts) {
  const o = opts || {};
  return items.map(function (t, i) {
    return {
      text: t,
      options: {
        bullet: true,
        breakLine: true,
        fontSize: o.fontSize || 9.5,
        color: o.color || C.ink,
        paraSpaceAfter: o.paraSpaceAfter === undefined ? 5 : o.paraSpaceAfter
      }
    };
  });
}

module.exports = { C, HEAD, BODY, makeShadow, addBadge, addHeader, addCard, addNumCircle, addPill, bulletItems };
