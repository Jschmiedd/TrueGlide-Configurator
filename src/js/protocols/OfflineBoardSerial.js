// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : transport « carte hors ligne ». Il se comporte comme un port branché sur une carte : le logiciel lui
// envoie ses demandes, il répond avec la récolte de la carte (src/js/trueglide/offline/board.js).

import { OfflineBoard, writeCodes } from "../trueglide/offline/board.js";
import { loadBoard, saveBoard } from "../trueglide/offline/store.js";
import { boardChanged } from "../trueglide/offline/harvest_state.js";
import MSPCodes from "../msp/MSPCodes.js";

export const OFFLINE_PATH = "offline";

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
        this.logHead = "[OFFLINE]";
    }

    async connect() {
        const recording = loadBoard();
        if (!recording) {
            console.warn(`${this.logHead} no harvested board`);
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
        this.board = new OfflineBoard(recording, writeCodes(MSPCodes));
        this.connected = true;
        this.connectionId = OFFLINE_PATH;
        this.bitrate = 115200;
        this.dispatchEvent(new CustomEvent("connect", { detail: { connectionId: OFFLINE_PATH } }));
        return true;
    }

    async disconnect() {
        if (!this.connectionId) {
            return false;
        }
        this.connected = false;
        this.connectionId = false;
        this.bitrate = 0;
        this.board = null;
        this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        return true;
    }

    async send(data) {
        if (!this.board) {
            return { bytesSent: 0 };
        }
        const octets = new Uint8Array(data);
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

    getConnectedDevice() {
        return this.connectionId ? { path: OFFLINE_PATH, displayName: "Carte hors ligne" } : null;
    }

    async getDevices() {
        return loadBoard() ? [{ path: OFFLINE_PATH, displayName: "Carte hors ligne" }] : [];
    }
}

export default OfflineBoardSerial;
