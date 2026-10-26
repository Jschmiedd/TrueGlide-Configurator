// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : carte hors ligne sur le vrai firmware. Pour les cartes listées dans simulee/cartes.json (copiées par
// scripts/sync-trueglide-simulee.mjs), le firmware exact de la carte (TrueGlide ou Betaflight) tourne dans un Web Worker de la page.
//  - préparation : la carte simulée démarre vierge, reçoit le « diff all » récolté sur la vraie carte, enregistre ;
//    (avec d'abord l'état des fonctions « feature » du « dump all » récolté) ; son « dump all » doit alors être celui de la vraie carte, sinon la carte simulée n'est pas utilisée ;
//  - réglage hors ligne : le logiciel parle à la carte simulée comme à une carte branchée ;
//  - envoi : les commandes sont l'écart entre le « dump all » de départ et celui de la carte simulée réglée.

import { dumpDelta, dumpLines } from "./delta.js";

let manifeste = null;

// Cartes simulées livrées avec le logiciel : { "NOM/FIRMWARE": { nom, firmware, api, dossier } }
export async function cartesSimulees(base = globalThis.location?.href) {
    if (!manifeste) {
        try {
            const r = await fetch(new URL("simulee/cartes.json", base));
            manifeste = r.ok ? await r.json() : {};
        } catch {
            manifeste = {};
        }
    }
    return manifeste;
}

// Carte simulée pour cette carte récoltée : même carte, même firmware, même version d'API ; sinon null.
// Une même carte peut avoir plusieurs cartes simulées (une par firmware : TrueGlide, Betaflight…).
export function simulationPour(carte, cartes) {
    return (
        Object.values(cartes ?? {}).find(
            (s) => s.nom === carte?.nom && s.firmware === carte.firmware && s.api === carte.api,
        ) ?? null
    );
}

// identifiant unique (24 chiffres hexadécimaux, comme identity.js) -> [3 nombres], ou null
export function uidNombres(uid) {
    return /^[0-9a-f]{24}$/i.test(uid ?? "") ? [0, 8, 16].map((i) => Number.parseInt(uid.slice(i, i + 8), 16)) : null;
}

export function versBase64(octets) {
    let s = "";
    for (const o of octets) {
        s += String.fromCharCode(o);
    }
    return btoa(s);
}

export function depuisBase64(texte) {
    return Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));
}

function attendre(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Une carte simulée dans un Web Worker. Événements : « sortie » (detail : Uint8Array), « redemarrage » (detail :
// mémoire des réglages, Uint8Array).
export class CarteSimulee extends EventTarget {
    constructor(simulation, base = globalThis.location?.href) {
        super();
        this.url = new URL(`${simulation.dossier}carte_worker.js`, base);
        this.worker = null;
        this.texte = "";
    }

    // Démarre la carte ; rendu quand son firmware répond (comme une carte qui vient d'être branchée).
    async demarrer(eeprom, uid) {
        this.arreter();
        this.worker = new Worker(this.url);
        this.worker.onmessage = (e) => {
            const m = e.data;
            if (m.type === "sortie" && m.port === 0) {
                this.texte += String.fromCharCode(...m.octets);
                this.dispatchEvent(new CustomEvent("sortie", { detail: m.octets }));
            } else if (m.type === "redemarrage") {
                this.dispatchEvent(new CustomEvent("redemarrage", { detail: m.eeprom }));
            }
        };
        const prete = new Promise((resolve) => {
            const ecoute = (e) => {
                if (e.data?.type === "prete") {
                    this.worker.removeEventListener("message", ecoute);
                    resolve();
                }
            };
            this.worker.addEventListener("message", ecoute);
        });
        this.worker.postMessage({ type: "demarrer", eeprom: eeprom ? eeprom.slice() : null, uid });
        await prete;
        // le firmware démarre : il répond à MSP_API_VERSION quand il est prêt
        for (let i = 0; i < 100; i++) {
            this.texte = "";
            this.envoyer(Uint8Array.from([0x24, 0x4d, 0x3c, 0, 1, 1]));
            await attendre(100);
            if (this.texte.includes("$M>")) {
                return;
            }
        }
        throw new Error("la carte simulée ne répond pas");
    }

    envoyer(octets) {
        this.worker?.postMessage({ type: "entree", octets: Uint8Array.from(octets) });
    }

    // Une commande du CLI ; rend sa réponse (lignes, sans l'invite).
    async cli(commande, delaiMs = 20000) {
        this.texte = "";
        this.envoyer(new TextEncoder().encode(`${commande}\r\n`));
        const debut = Date.now();
        while (Date.now() - debut < delaiMs) {
            await attendre(20);
            if (/\r?\n# $/.test(this.texte)) {
                break;
            }
        }
        return this.texte.replace(/\r/g, "");
    }

    async entrerCli() {
        this.texte = "";
        this.envoyer(new TextEncoder().encode("#"));
        for (let i = 0; i < 50 && !this.texte.includes("#"); i++) {
            await attendre(20);
        }
        await attendre(200);
    }

    // « save » : la carte enregistre et redémarre ; rend sa mémoire des réglages
    async enregistrer() {
        const fin = new Promise((resolve) =>
            this.addEventListener("redemarrage", (e) => resolve(e.detail), { once: true }),
        );
        this.envoyer(new TextEncoder().encode("save\r\n"));
        const eeprom = await fin;
        this.arreter();
        return eeprom;
    }

    arreter() {
        this.worker?.terminate();
        this.worker = null;
    }
}

// réponse du CLI qui refuse la commande
function refus(texte) {
    return (
        texte.split("\n").find((l) => /###ERROR|Invalid|out of range|Unknown command|PARSING FAILED/i.test(l)) ?? null
    );
}

// Prépare la carte simulée d'une carte récoltée : configuration de la vraie carte, enregistrée.
// Rend { eeprom, base } (base : « dump all » de départ) ; erreur si la carte simulée diffère de la vraie carte.
export async function preparer(rec, simulation, base = globalThis.location?.href) {
    const diff = rec.cli?.["diff all"];
    const dumpVraie = rec.cli?.["dump all"];
    if (!diff || !dumpVraie) {
        throw new Error("récolte sans « diff all » ni « dump all »");
    }
    const uid = uidNombres(rec.carte?.uid);
    const carte = new CarteSimulee(simulation, base);
    try {
        await carte.demarrer(null, uid);
        await carte.entrerCli();
        // état des fonctions (feature) de la vraie carte d'abord : une carte neuve en met certaines en marche
        // d'elle-même au premier démarrage (LED_STRIP…), le « diff all » ne les coupe pas
        const fonctions = dumpLines(dumpVraie.join("\n")).filter((l) => /^feature\s/.test(l));
        for (const ligne of [...fonctions, ...dumpLines(diff.join("\n"))]) {
            if (/^(batch|defaults|save|exit|diff|dump|version)\b/.test(ligne)) {
                continue;
            }
            const r = refus(await carte.cli(ligne));
            if (r) {
                throw new Error(`commande refusée par la carte simulée : ${ligne} (${r})`);
            }
        }
        let eeprom = await carte.enregistrer();
        await carte.demarrer(eeprom, uid);
        await carte.entrerCli();
        const dump = await carte.cli("dump all");
        const ecarts = dumpDelta(dumpVraie.join("\n"), dump);
        if (ecarts.length) {
            throw new Error(
                `la carte simulée diffère de la vraie carte (${ecarts.length} : ${ecarts.slice(0, 3).join(" ; ")})`,
            );
        }
        // sortir du CLI enregistrerait : on arrête la carte telle qu'elle est enregistrée
        carte.arreter();
        return { eeprom, base: dump };
    } finally {
        carte.arreter();
    }
}

// Commandes à envoyer : écart entre le départ et la carte simulée réglée (mémoire des réglages `eeprom`).
export async function commandesPreparees(simulee, simulation, uid, base = globalThis.location?.href) {
    const carte = new CarteSimulee(simulation, base);
    try {
        await carte.demarrer(depuisBase64(simulee.eeprom), uid);
        await carte.entrerCli();
        const dump = await carte.cli("dump all");
        return { commandes: dumpDelta(simulee.base, dump), dump };
    } finally {
        carte.arreter();
    }
}
