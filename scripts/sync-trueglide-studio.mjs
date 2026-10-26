// TrueGlide : copie TrueGlide Studio (dépôt du firmware, trueglide/studio) dans l'application.
//  - les calculs (js/) convertis en modules ES, pour l'assistant de réglage : src/js/trueglide/studio/ ;
//  - la page entière, affichée par l'onglet Studio et livrée avec le logiciel : studio/ (copiée dans dist/studio).
// Un seul code : on ne modifie pas les copies, on relance ce script.
// Usage : node scripts/sync-trueglide-studio.mjs [chemin/vers/firmware/trueglide/studio/js]
import fs from "node:fs";
import path from "node:path";

const source = process.argv[2] || "../firmware-trueglide/trueglide/studio/js";
const dest = "src/js/trueglide/studio";
const MODULES = { "tune.js": "TFTune", "analyse.js": "TFAnalyse", "nav.js": "TFNav", "settings_db.js": "TF_SETTINGS", "cartes.js": "TF_CARTES" };

fs.mkdirSync(dest, { recursive: true });
for (const [file, name] of Object.entries(MODULES)) {
    let code = fs.readFileSync(path.join(source, file), "utf8");
    if (!/\}\)\(this\);\s*$/.test(code)) {
        throw new Error(`${file} : fin de module inattendue`);
    }
    code = code.replace(/\}\)\(this\);\s*$/, "})(root);\n");
    const out = `// Copie générée par scripts/sync-trueglide-studio.mjs depuis le firmware TrueGlide : ne pas modifier.\n/* eslint-disable */\nconst root = {};\n${code}export default root.${name};\n`;
    fs.writeFileSync(path.join(dest, file), out);
    console.log(`${file} -> ${dest}/${file}`);
}

// Page entière de Studio (index.html, js/, logos, exemples), telle quelle
const page = path.dirname(path.resolve(source));
const pageDest = "studio";
fs.rmSync(pageDest, { recursive: true, force: true });
for (const item of ["index.html", "js", "exemples", "logo_talktruefpv_128.png", "logo_talktruefpv_512.png"]) {
    fs.cpSync(path.join(page, item), path.join(pageDest, item), { recursive: true });
}
fs.writeFileSync(
    path.join(pageDest, "LISEZMOI.txt"),
    "Copie de TrueGlide Studio (dépôt du firmware TrueGlide, trueglide/studio), générée par\n" +
        "scripts/sync-trueglide-studio.mjs : ne pas modifier ici, modifier Studio dans le dépôt du firmware.\n",
);
console.log(`${page} -> ${pageDest}/`);

