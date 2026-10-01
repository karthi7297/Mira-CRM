// slide-09.js — The 6 signature innovations + positioning
const pptxgen = require("pptxgenjs");
const H = require("./_helpers.js");

const slideConfig = { type: "content", index: 9, title: "The 6 Innovations That Set Mira Apart" };

const SIX = [
  ["Customer 360", "Sales + delivery + finance on one screen \u2014 the question \u201chow is this college doing?\u201d answered in one view."],
  ["Trigger-Guaranteed Money Math", "total = subtotal + tax \u2212 discount is enforced in SQL, so totals can't drift and overpayments are rejected."],
  ["Public Enquiry \u2192 Auto-Lead", "A no-login form turns every website visitor into a tracked lead with a system follow-up."],
  ["Certificates + Public Verification", "Issued only at \u2265 75% attendance; anyone can verify a code at /verify with no login."],
  ["Cold-Mail Outreach Engine", "Built-in prospecting with throttling, suppression, unsubscribe and open-tracking \u2014 no Mailchimp needed."],
  ["Role-Scoped AI + 4-Role Access", "Scope resolves server-side, so a student can never see another student's data. Isolation by design."]
];

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  H.addHeader(
    slide, theme,
    "07  \u00b7  WHAT WE INNOVATED",
    "The 6 Innovations That Set Mira Apart",
    "Built, tested and demoable \u2014 this is the difference between Mira and an off-the-shelf CRM."
  );

  const colW = 2.8533;
  const gap = 0.22;
  const cardH = 1.5;
  const rowY = [1.42, 3.06];

  SIX.forEach(function (it, i) {
    const x = 0.5 + (i % 3) * (colW + gap);
    const y = rowY[Math.floor(i / 3)];

    H.addCard(slide, pres, {
      x: x, y: y, w: colW, h: cardH,
      fill: H.C.white, radius: 0.1, line: H.C.rule, lineWidth: 0.75
    });

    slide.addText("0" + (i + 1), {
      x: x + 0.16, y: y + 0.1, w: 0.9, h: 0.42,
      fontSize: 24, fontFace: H.HEAD, bold: true,
      color: theme.accent, align: "left", valign: "middle", margin: 0
    });

    slide.addText(it[0], {
      x: x + 0.16, y: y + 0.5, w: colW - 0.3, h: 0.34,
      fontSize: 10.5, fontFace: H.HEAD, bold: true,
      color: theme.primary, align: "left", valign: "middle", margin: 0, fit: "shrink"
    });

    slide.addText(it[1], {
      x: x + 0.16, y: y + 0.82, w: colW - 0.3, h: cardH - 0.92,
      fontSize: 8, fontFace: H.BODY, color: H.C.muted,
      align: "left", valign: "top", margin: 0
    });
  });

  // positioning strip
  H.addCard(slide, pres, {
    x: 0.5, y: 4.66, w: 9.0, h: 0.46,
    fill: theme.primary, radius: 0.1, shadow: false
  });
  slide.addText([
    { text: "vs typical CRMs:  ", options: { bold: true, color: theme.accent, fontSize: 9, fontFace: H.HEAD } },
    { text: "native education objects \u00b7 1-click conversions \u00b7 DB-guaranteed money math \u00b7 built-in collections & outreach \u00b7 MIT-licensed and self-hostable \u2014 where Zoho / HubSpot need add-ons and paid tiers.", options: { color: "FFFFFF", fontSize: 9, fontFace: H.BODY } }
  ], {
    x: 0.68, y: 4.66, w: 8.64, h: 0.46,
    align: "left", valign: "middle", margin: 0, fit: "shrink"
  });

  H.addBadge(slide, pres, theme, 9);
  return slide;
}

module.exports = { createSlide, slideConfig };

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = { primary: "023047", secondary: "219EBC", accent: "FB8500", light: "8ECAE6", bg: "FFFFFF" };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-09-preview.pptx" });
}
