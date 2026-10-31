// TrueGlide : copie les calculs de TrueGlide Studio (dépôt du firmware, trueglide/studio/js) dans l'application,
// convertis en modules ES. Un seul code de calcul : on ne modifie pas les copies, on relance ce script.
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
    // module ES : jamais « module.exports » (sous l'outil de test, « module » existe et n'accepte pas l'affectation)
    code = code.replace(/typeof module !== (['"])undefined\1/, "false");
    const out = `// Copie générée par scripts/sync-trueglide-studio.mjs depuis le firmware TrueGlide : ne pas modifier.\n/* eslint-disable */\nconst root = {};\n${code}export default root.${name};\n`;
    fs.writeFileSync(path.join(dest, file), out);
    console.log(`${file} -> ${dest}/${file}`);
}
