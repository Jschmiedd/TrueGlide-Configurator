// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : carte hors ligne. La récolte enregistre, carte branchée, chaque demande du logiciel et la réponse de la
// carte. Hors ligne, la carte hors ligne rend ces mêmes réponses : le logiciel affiche ses onglets exactement comme
// carte branchée. Les écritures sont gardées dans l'ordre, pour être envoyées plus tard à la vraie carte.
// Format du fichier carte : « trueglide-carte » (propre à TrueGlide).

import { FrameReader, encodeCli, encodeResponse, fromHex, hex } from "./frames.js";

export const FORMAT = "trueglide-carte";
export const VERSION = 1;

export function key(code, payload) {
    return `${code}:${typeof payload === "string" ? payload : hex(payload)}`;
}

export function emptyRecording() {
    return { format: FORMAT, version: VERSION, date: "", carte: {}, msp: {}, unsupported: {}, cli: {}, writes: [] };
}

// Enregistreur : branché sur le port pendant que la carte est connectée.
export class Recorder {
    constructor() {
        this.requests = new FrameReader("request");
        this.responses = new FrameReader("response");
        this.lastRequest = new Map();
        this.cliQueue = [];
        this.data = emptyRecording();
    }

    sent(octets) {
        for (const m of this.requests.feed(octets)) {
            if (m.type === "msp") {
                this.lastRequest.set(m.code, hex(m.payload));
            } else {
                this.cliQueue.push(m.command);
            }
        }
    }

    received(octets) {
        for (const m of this.responses.feed(octets)) {
            if (m.type === "cli") {
                const command = this.cliQueue.shift();
                if (command !== undefined) {
                    this.data.cli[command] = m.lines;
                }
                continue;
            }
            const k = key(m.code, this.lastRequest.get(m.code) ?? "");
            if (m.error) {
                this.data.unsupported[k] = true;
                delete this.data.msp[k];
            } else {
                this.data.msp[k] = hex(m.payload);
                delete this.data.unsupported[k];
            }
        }
    }
}

// Commandes qui agissent tout de suite sur la carte (moteurs, voies radio, horloge, étalonnage, passerelle ESC,
// effacement de la mémoire) : jamais gardées pour l'envoi, ni exécutées hors ligne.
export const LIVE_CODE_NAMES = [
    "MSP_SET_MOTOR",
    "MSP_SET_RAW_RC",
    "MSP_SET_RTC",
    "MSP_ARMING_DISABLE",
    "MSP_SET_REBOOT",
    "MSP_EEPROM_WRITE",
    "MSP_ACC_CALIBRATION",
    "MSP_MAG_CALIBRATION",
    "MSP_SET_PASSTHROUGH",
    "MSP_DATAFLASH_ERASE",
    "MSP_SET_RESET_CURR_PID",
    "MSP2_SEND_DSHOT_COMMAND",
];

// Commandes du CLI qui ne changent pas la configuration : rendues depuis la récolte.
const CLI_READ =
    /^(get|diff|dump|version|status|help|tasks|resource|serial$|feature$|map$|aux$|mmix$|smix$|vtxtable$|led$|color$|mode_color$|adjrange$|rxrange$|rxfail$|profile$|rateprofile$|batch\s+end|#)/i;

// Carte hors ligne. codes : { writes: Set des codes d'écriture, live: Set des codes immédiats, eepromWrite, reboot }.
export class OfflineBoard {
    constructor(recording, codes) {
        this.rec = recording;
        this.codes = codes;
        this.reader = new FrameReader("request");
        if (!Array.isArray(this.rec.writes)) {
            this.rec.writes = [];
        }
    }

    // Octets reçus du logiciel -> { replies: [Uint8Array], events: ["reboot" | "save"] }
    handle(octets) {
        const replies = [];
        const events = [];
        for (const m of this.reader.feed(octets)) {
            if (m.type === "cli") {
                replies.push(encodeCli(this.cli(m.command)));
                continue;
            }
            const { reply, event } = this.msp(m);
            replies.push(reply);
            if (event) {
                events.push(event);
            }
        }
        return { replies, events };
    }

    msp(m) {
        const k = key(m.code, m.payload);
        const { writes, live, eepromWrite, reboot } = this.codes;
        if (writes.has(m.code) && !live.has(m.code)) {
            this.rec.writes.push({ code: m.code, payload: hex(m.payload) });
            return { reply: encodeResponse(m.version, m.code) };
        }
        if (live.has(m.code)) {
            const event = m.code === reboot ? "reboot" : m.code === eepromWrite ? "save" : null;
            return { reply: encodeResponse(m.version, m.code), event };
        }
        if (k in this.rec.msp) {
            return { reply: encodeResponse(m.version, m.code, fromHex(this.rec.msp[k])) };
        }
        // même demande avec d'autres paramètres : la réponse sans paramètre, sinon la dernière enregistrée
        const prefix = `${m.code}:`;
        const keys = Object.keys(this.rec.msp).filter((x) => x.startsWith(prefix));
        if (keys.length) {
            const best = keys.includes(prefix) ? prefix : keys[keys.length - 1];
            return { reply: encodeResponse(m.version, m.code, fromHex(this.rec.msp[best])) };
        }
        return { reply: encodeResponse(m.version, m.code, new Uint8Array(0), true) };
    }

    cli(command) {
        const c = command.trim();
        if (c in this.rec.cli) {
            return this.rec.cli[c];
        }
        if (!c || CLI_READ.test(c)) {
            return [`# ${c}`, "# (carte hors ligne : pas de réponse récoltée pour cette commande)"];
        }
        if (/^(save|exit|defaults|bl|dfu|reboot|flash_erase)\b/i.test(c)) {
            return [`# ${c} : impossible hors ligne`];
        }
        this.rec.writes.push({ cli: c });
        return [`# ${c}`];
    }
}

export function writeCodes(MSPCodes) {
    const writes = new Set();
    const live = new Set();
    for (const [name, code] of Object.entries(MSPCodes)) {
        if (/^MSP2?_(COMMON_)?SET_|^MSP2?_SET_|^MSP_COPY_PROFILE$|^MSP_SELECT_SETTING$|^MSP_EEPROM_WRITE$/.test(name)) {
            writes.add(code);
        }
        if (LIVE_CODE_NAMES.includes(name)) {
            live.add(code);
            writes.add(code);
        }
    }
    return { writes, live, eepromWrite: MSPCodes.MSP_EEPROM_WRITE, reboot: MSPCodes.MSP_SET_REBOOT };
}
