// TrueGlide : la carte simulée (carte.js + carte.wasm) tourne dans ce Web Worker, hors du fil de la page.
// Messages de la page : { type: 'demarrer', eeprom, uid } (eeprom : Uint8Array ou null ; uid : identifiant unique de
// la puce, 3 nombres, ou null) ; { type: 'entree', octets } ; { type: 'lire' } (mémoire des réglages enregistrée).
// Messages vers la page : { type: 'prete' } ; { type: 'sortie', port, octets } ; { type: 'redemarrage', eeprom } ;
// { type: 'memoire', eeprom } (réponse à « lire » ; eeprom null si rien n'est encore enregistré).
/* global TrueGlideCarte */
importScripts('carte.js');

let carte = null;

// les octets sortent un par un du firmware : on les regroupe et on les envoie à la page une fois par tour de boucle
const enAttente = new Map();
function sortie(port, octets) {
    if (!enAttente.size) {
        queueMicrotask(vider);
    }
    const liste = enAttente.get(port) || [];
    liste.push(octets);
    enAttente.set(port, liste);
}
function vider() {
    for (const [port, liste] of enAttente) {
        const octets = new Uint8Array(liste.reduce((n, o) => n + o.length, 0));
        let i = 0;
        for (const o of liste) {
            octets.set(o, i);
            i += o.length;
        }
        self.postMessage({ type: 'sortie', port, octets }, [octets.buffer]);
    }
    enAttente.clear();
}

self.addEventListener('message', async (e) => {
    const m = e.data;
    if (!m || typeof m !== 'object') {
        return; // messages internes d'Emscripten (« setimmediate »)
    }
    if (m.type === 'demarrer') {
        carte = await TrueGlideCarte({
            print: () => {},
            printErr: () => {},
            arguments: [],
            preRun: [(M) => { if (m.eeprom) M.FS.writeFile('/eeprom.bin', m.eeprom); }],
            // avant le démarrage du firmware : l'identifiant unique de la carte récoltée (vraie carte seulement)
            onRuntimeInitialized() {
                if (m.uid && this._tg_definir_uid) this._tg_definir_uid(m.uid[0] >>> 0, m.uid[1] >>> 0, m.uid[2] >>> 0);
            },
            tgSortie: sortie,
            tgRedemarrage: () => {
                vider();
                const eeprom = carte.FS.readFile('/eeprom.bin');
                carte = null;
                self.postMessage({ type: 'redemarrage', eeprom }, [eeprom.buffer]);
            },
        });
        self.postMessage({ type: 'prete' });
    } else if (m.type === 'lire' && carte) {
        // enregistrement sans redémarrage (MSP_EEPROM_WRITE) : la page relit la mémoire des réglages
        const eeprom = carte.FS.analyzePath('/eeprom.bin').exists ? carte.FS.readFile('/eeprom.bin') : null;
        self.postMessage({ type: 'memoire', eeprom }, eeprom ? [eeprom.buffer] : []);
    } else if (m.type === 'entree' && carte) {
        const p = carte._malloc(m.octets.length);
        carte.HEAPU8.set(m.octets, p);
        carte._tg_entree(0, p, m.octets.length);
        carte._free(p);
    }
});
