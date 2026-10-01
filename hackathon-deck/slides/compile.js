// compile.js — assemble all 10 slides into the final deck
const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Team Mira";
pres.company = "RAMPeX Hackathon";
pres.title = "Mira - One Platform. Every EduTech Operation Connected.";
pres.subject = "EduTech operations CRM - hackathon pitch";

const theme = {
  primary: "023047",
  secondary: "219EBC",
  accent: "FB8500",
  light: "8ECAE6",
  bg: "FFFFFF"
};

for (let i = 1; i <= 10; i++) {
  const num = String(i).padStart(2, "0");
  const mod = require(`./slide-${num}.js`);
  mod.createSlide(pres, theme);
  console.log("built slide-" + num);
}

pres.writeFile({ fileName: "./output/Mira-Hackathon-Deck.pptx" })
  .then(function (f) { console.log("WROTE:", f); })
  .catch(function (e) { console.error("FAILED:", e); process.exit(1); });
