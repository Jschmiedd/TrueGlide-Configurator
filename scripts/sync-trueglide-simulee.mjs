// TrueGlide : copie les cartes simulées (firmware exact d'une carte, TrueGlide ou Betaflight, compilé pour le
// navigateur par vraie_carte.py dans le dépôt du firmware) dans le logiciel : simulee/<CARTE>/<FIRMWARE>/.
// Chaque carte est démarrée une fois ici pour lire son identité (nom, firmware, version d'API), ajoutée à
// simulee/cartes.json : le logiciel n'utilise une carte simulée que pour une carte récoltée avec le même firmware.
// Un seul code : on ne modifie pas les copies, on relance ce script.
// Usage : node scripts/sync-trueglide-simulee.mjs ../firmware-trueglide/obj/vraie_carte/SPEEDYBEEF405MINI/wasm [...]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dest = "simulee";
const FICHIERS = ["carte.js", "carte.wasm"];
const WORKER = "carte_worker.js";

function attendre(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// trame MSP v1 vers la carte
function requete(code) {
    return Buffer.from([0x24, 0x4d, 0x3c, 0, code, code]);
}

// réponse MSP v1 de la carte : contenu, ou null
function reponse(octets, code) {
    for (let i = 0; i + 5 < octets.length; i++) {
        if (octets[i] === 0x24 && octets[i + 1] === 0x4d && octets[i + 2] === 0x3e && octets[i + 4] === code) {
            return octets.subarray(i + 5, i + 5 + octets[i + 3]);
        }
    }
    return null;
}

// identité de la carte, au même format que src/js/trueglide/offline/identity.js
async function identite(dossier) {
    const TrueGlideCarte = require(path.resolve(dossier, "carte.js"));
    let sortie = Buffer.alloc(0);
    const carte = await TrueGlideCarte({
        print: () => {},
        printErr: () => {},
        arguments: [],
        tgSortie: (port, octets) => {
            if (port === 0) {
                sortie = Buffer.concat([sortie, Buffer.from(octets)]);
            }
        },
    });
    const demander = async (code) => {
        sortie = Buffer.alloc(0);
        const b = requete(code);
        const p = carte._malloc(b.length);
        carte.HEAPU8.set(b, p);
        carte._tg_entree(0, p, b.length);
        carte._free(p);
        for (let i = 0; i < 200; i++) {
            await attendre(10);
            const r = reponse(sortie, code);
            if (r) {
                return r;
            }
        }
        throw new Error(`${dossier} : pas de réponse au code MSP ${code}`);
    };
    await attendre(2500);
    const api = await demander(1); // MSP_API_VERSION
    const variante = await demander(2); // MSP_FC_VARIANT
    const version = await demander(3); // MSP_FC_VERSION
    // MSP_BOARD_INFO : identifiant (4), révision (2), type (1), capacités (1), puis nom de la cible et nom de la carte
    const info = await demander(4);
    const longueurCible = info[8];
    const longueurNom = info[9 + longueurCible];
    const debutNom = 10 + longueurCible;
    return {
        nom: info.subarray(debutNom, debutNom + longueurNom).toString("latin1"),
        // version : comme MSPHelper (MSP_FC_VERSION) : 3 octets, ou, si le premier vaut 10 ou plus, le texte qui suit
        firmware: `${variante.toString("latin1")} ${
            version[0] < 10
                ? `${version[0]}.${version[1]}.${version[2]}`
                : version.subarray(4, 4 + version[3]).toString("latin1")
        }`,
        api: `${api[1]}.${api[2]}.0`,
    };
}

const sources = process.argv.slice(2);
if (!sources.length) {
    throw new Error("indiquer au moins un dossier de carte simulée (…/obj/vraie_carte/<CARTE>/wasm)");
}
const fichierManifeste = path.join(dest, "cartes.json");
const manifeste = fs.existsSync(fichierManifeste) ? JSON.parse(fs.readFileSync(fichierManifeste, "utf8")) : {};
for (const dossier of sources) {
    const id = await identite(dossier);
    if (!/^[A-Z0-9_]+$/.test(id.nom)) {
        throw new Error(`${dossier} : nom de carte inattendu « ${id.nom} »`);
    }
    const cle = `${id.nom}/${id.firmware.replace(/[^A-Za-z0-9.]+/g, "_")}`;
    const cible = path.join(dest, cle);
    fs.rmSync(cible, { recursive: true, force: true });
    fs.mkdirSync(cible, { recursive: true });
    for (const f of FICHIERS) {
        fs.copyFileSync(path.join(dossier, f), path.join(cible, f));
    }
    // Web Worker : celui du dépôt du firmware (trueglide/), sinon la copie à côté de la carte
    const worker = [
        path.resolve(dossier, "../../../../trueglide/essai_navigateur", WORKER),
        path.resolve(dossier, "../../../../trueglide", WORKER),
        path.join(dossier, WORKER),
    ].find((f) => fs.existsSync(f));
    fs.copyFileSync(worker, path.join(cible, WORKER));
    manifeste[cle] = { ...id, dossier: `${dest}/${cle}/` };
    console.log(`${dossier} -> ${cible}/ (${id.firmware}, API ${id.api})`);
}
// cartes dont le dossier n'existe plus : retirées
for (const [cle, s] of Object.entries(manifeste)) {
    if (!fs.existsSync(path.join(s.dossier, "carte.wasm"))) {
        delete manifeste[cle];
    }
}
fs.writeFileSync(fichierManifeste, `${JSON.stringify(manifeste, null, 2)}\n`);
fs.writeFileSync(
    path.join(dest, "LISEZMOI.txt"),
    "Cartes simulées : firmware exact d'une carte (TrueGlide ou Betaflight), compilé pour le navigateur par\n" +
        "vraie_carte.py (dépôt du firmware TrueGlide). Copiées par scripts/sync-trueglide-simulee.mjs : ne pas modifier\n" +
        "ici. Licence : GPL-3.0, comme les firmwares ; sources dans le dépôt du firmware TrueGlide.\n",
);
process.exit(0);
