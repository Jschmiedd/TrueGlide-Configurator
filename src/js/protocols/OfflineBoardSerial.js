// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : transport « carte hors ligne ». Il se comporte comme un port branché sur une carte. Deux façons :
//  - carte simulée : pour les cartes livrées dans simulee/ (même firmware que la carte récoltée), c'est le firmware
//    TrueGlide exact de la carte qui répond, dans un Web Worker (src/js/trueglide/offline/simulation.js) ;
//  - récolte : sinon, il répond avec ce que la carte a répondu pendant la récolte (src/js/trueglide/offline/board.js).

import { OfflineBoard, writeCodes } from "../trueglide/offline/board.js";
import { FrameReader, encodeResponse } from "../trueglide/offline/frames.js";
import {
    CarteSimulee,
    cartesSimulees,
    commandesPreparees,
    depuisBase64,
    preparer,
    simulationPour,
    uidNombres,
    versBase64,
} from "../trueglide/offline/simulation.js";
import { loadBoard, saveBoard } from "../trueglide/offline/store.js";
import { boardChanged, offlineState } from "../trueglide/offline/harvest_state.js";
import MSPCodes from "../msp/MSPCodes.js";

export const OFFLINE_PATH = "offline";

// Carte simulée : demandes qui n'ont de sens que sur la vraie carte. Les étalonnages sont refusés (ils écriraient
// des valeurs mesurées sur une carte simulée immobile) ; les moteurs et le passage vers les ESC ne font rien.
const REFUSEES = new Set([MSPCodes.MSP_ACC_CALIBRATION, MSPCodes.MSP_MAG_CALIBRATION]);
const SANS_EFFET = new Set([MSPCodes.MSP_SET_MOTOR, MSPCodes.MSP_SET_PASSTHROUGH, MSPCodes.MSP2_SEND_DSHOT_COMMAND]);

class OfflineBoardSerial extends EventTarget {
    constructor() {
        super();
        this.connected = false;
        this.connectionId = false;
        this.bitrate = 0;
        this.bytesReceived = 0;
        this.bytesSent = 0;
        this.failed = 0;
        this.board = null;
        this.carte = null;
        this.logHead = "[OFFLINE]";
    }

    async connect() {
        const recording = loadBoard();
        if (!recording) {
            console.warn(`${this.logHead} no harvested board`);
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
        const simulation = simulationPour(recording.carte, await cartesSimulees());
        if (simulation && !recording.simulee?.erreur) {
            try {
                await this.connecterSimulee(recording, simulation);
                return true;
            } catch (e) {
                // la carte simulée n'est pas utilisable : la carte hors ligne rejoue la récolte, comme avant
                console.warn(`${this.logHead} carte simulée inutilisable :`, e);
                this.carte?.arreter();
                this.carte = null;
                recording.simulee = { erreur: String(e?.message ?? e) };
                saveBoard(recording);
                boardChanged();
            }
        }
        this.board = new OfflineBoard(recording, writeCodes(MSPCodes));
        this.annoncer();
        return true;
    }

    annoncer() {
        this.connected = true;
        this.connectionId = OFFLINE_PATH;
        this.bitrate = 115200;
        this.dispatchEvent(new CustomEvent("connect", { detail: { connectionId: OFFLINE_PATH } }));
    }

    async connecterSimulee(recording, simulation) {
        if (!recording.simulee?.eeprom) {
            offlineState.preparing = true;
            try {
                const { eeprom, base } = await preparer(recording, simulation);
                recording.simulee = { eeprom: versBase64(eeprom), base, commandes: [], date: new Date().toISOString() };
                saveBoard(recording);
                boardChanged();
            } finally {
                offlineState.preparing = false;
            }
        }
        const uid = uidNombres(recording.carte?.uid);
        this.carte = new CarteSimulee(simulation);
        this.carte.addEventListener("sortie", (e) => {
            this.bytesReceived += e.detail.byteLength;
            this.dispatchEvent(new CustomEvent("receive", { detail: e.detail }));
        });
        this.carte.addEventListener("redemarrage", (e) => this.redemarrage(e.detail, simulation, uid));
        this.simulation = simulation;
        this.uid = uid;
        await this.carte.demarrer(depuisBase64(recording.simulee.eeprom), uid);
        this.reader = new FrameReader("request");
        this.annoncer();
    }

    // la carte simulée a enregistré et redémarre : sa mémoire est gardée, le port se ferme (comme une vraie carte),
    // puis les commandes à envoyer sont recalculées
    async redemarrage(eeprom, simulation, uid) {
        this.carte?.arreter();
        this.carte = null;
        setTimeout(() => this.disconnect(), 50);
        await this.memoireEnregistree(eeprom, simulation, uid);
    }

    // enregistrement sans redémarrage (bouton « Sauvegarder » d'un onglet : MSP_EEPROM_WRITE) : la carte reste
    // connectée ; sa mémoire est relue un peu après, quand le firmware a fini d'écrire
    enregistrementSansRedemarrage() {
        const carte = this.carte;
        setTimeout(async () => {
            if (this.carte !== carte || !carte) {
                return;
            }
            const eeprom = await carte.lireMemoire();
            if (eeprom && this.carte === carte) {
                await this.memoireEnregistree(eeprom, this.simulation, this.uid);
            }
        }, 1000);
    }

    // mémoire des réglages de la carte simulée gardée, et commandes à envoyer recalculées
    async memoireEnregistree(eeprom, simulation, uid) {
        const rec = loadBoard();
        if (!rec?.simulee) {
            return;
        }
        rec.simulee.eeprom = versBase64(eeprom);
        saveBoard(rec);
        try {
            const { commandes, dump } = await commandesPreparees(rec.simulee, simulation, uid);
            const now = loadBoard();
            if (now?.simulee && now.simulee.eeprom === rec.simulee.eeprom) {
                now.simulee.commandes = commandes;
                now.simulee.baseApres = dump;
                saveBoard(now);
                boardChanged();
            }
        } catch (e) {
            console.warn(`${this.logHead} commandes non recalculées :`, e);
        }
    }

    async disconnect() {
        if (!this.connectionId) {
            return false;
        }
        this.connected = false;
        this.connectionId = false;
        this.bitrate = 0;
        this.board = null;
        this.carte?.arreter();
        this.carte = null;
        this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        return true;
    }

    async send(data) {
        const octets = new Uint8Array(data);
        if (this.carte) {
            return this.envoyerSimulee(octets);
        }
        if (!this.board) {
            return { bytesSent: 0 };
        }
        this.bytesSent += octets.byteLength;
        const avant = this.board.rec.writes.length;
        const { replies, events } = this.board.handle(octets);
        if (this.board.rec.writes.length !== avant) {
            // les écritures gardées restent dans la carte hors ligne, même après une fermeture du logiciel
            saveBoard(this.board.rec);
            boardChanged();
        }
        // réponse un peu plus tard, comme une vraie carte
        setTimeout(() => {
            for (const reply of replies) {
                this.bytesReceived += reply.byteLength;
                this.dispatchEvent(new CustomEvent("receive", { detail: reply }));
            }
            if (events.includes("reboot")) {
                // une vraie carte redémarre : le port se ferme
                setTimeout(() => this.disconnect(), 50);
            }
        }, 2);
        return { bytesSent: octets.byteLength };
    }

    envoyerSimulee(octets) {
        this.bytesSent += octets.byteLength;
        const messages = this.reader.feed(octets);
        if (messages.some((m) => m.type === "msp" && m.code === MSPCodes.MSP_EEPROM_WRITE)) {
            this.enregistrementSansRedemarrage();
        }
        const gardees = messages.filter((m) => m.type === "msp" && (REFUSEES.has(m.code) || SANS_EFFET.has(m.code)));
        if (!gardees.length) {
            this.carte.envoyer(octets);
            return { bytesSent: octets.byteLength };
        }
        setTimeout(() => {
            for (const m of gardees) {
                const reply = encodeResponse(m.version, m.code, new Uint8Array(0), REFUSEES.has(m.code));
                this.bytesReceived += reply.byteLength;
                this.dispatchEvent(new CustomEvent("receive", { detail: reply }));
            }
        }, 2);
        return { bytesSent: octets.byteLength };
    }

    getConnectedDevice() {
        return this.connectionId ? { path: OFFLINE_PATH, displayName: "Carte hors ligne" } : null;
    }

    async getDevices() {
        return loadBoard() ? [{ path: OFFLINE_PATH, displayName: "Carte hors ligne" }] : [];
    }
}

export default OfflineBoardSerial;
