// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : carte hors ligne. La récolte enregistre, carte branchée, chaque demande du logiciel et la réponse de la
// carte. Hors ligne, la carte hors ligne rend ces mêmes réponses : le logiciel affiche ses onglets exactement comme
// carte branchée. Les écritures sont gardées dans l'ordre, pour être envoyées plus tard à la vraie carte.
// Format du fichier carte : « trueglide-carte » (propre à TrueGlide).

import { isSettingCommand } from "../cli_safety.js";
import { FrameReader, encodeCli, encodeResponse, fromHex, hex } from "./frames.js";
import { applyCliSet, applyWrite } from "./writes.js";

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
    // TrueGlide (audit du 07/11/2026, F4) : nom réel du code 245 (passerelle ESC) ; « MSP_SET_PASSTHROUGH » n'existe
    // pas dans MSPCodes. Identité de la carte (écrite pour toujours) et GPS / cap / points de passage simulés.
    "MSP_SET_4WAY_IF",
    "MSP_SET_BOARD_INFO",
    "MSP_SET_SIGNATURE",
    "MSP_SET_RAW_GPS",
    "MSP_SET_HEADING",
    "MSP_SET_WP",
    "MSP_DATAFLASH_ERASE",
    "MSP2_SEND_DSHOT_COMMAND",
];

// Changement, copie ou remise à zéro d'un profil : la récolte ne connaît que le profil actif, la carte hors ligne ne
// peut pas montrer les autres. Refusées hors ligne (le logiciel affiche l'erreur habituelle).
export const OFFLINE_REFUSED_NAMES = ["MSP_SELECT_SETTING", "MSP_COPY_PROFILE", "MSP_SET_RESET_CURR_PID"];

const HASH = 0x23;
const LF = 0x0a;
const CR = 0x0d;
const TAB = 0x09;

// Commandes du CLI qui ne changent pas la configuration : rendues depuis la récolte.
const CLI_READ =
    /^(get|diff|dump|version|status|help|tasks|resource|serial$|feature$|map$|aux$|mmix$|smix$|vtxtable$|led$|color$|mode_color$|adjrange$|rxrange$|rxfail$|profile$|rateprofile$|batch\s+end|#)|^(mixer|feature|beeper|beacon|timer|dma|resource|mmix|smix|servo)\s+(list|show)\b|^(timer|dma|beeper|beacon|mixer)$/i;

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
        for (const o of octets) {
            // onglet CLI : texte brut (« # » pour entrer, puis des lignes), comme le CLI série de la vraie carte
            if (this.rawCli || (o === HASH && this.reader.state === "idle")) {
                const text = this.rawCliByte(o);
                if (text !== null) {
                    replies.push(Uint8Array.from(Array.from(text, (c) => c.charCodeAt(0) & 0xff)));
                }
                continue;
            }
            this.handleMessages(this.reader.feed([o]), replies, events);
        }
        return { replies, events };
    }

    // Onglet CLI hors ligne : mêmes réponses et même liste blanche que le CLI par MSP (cli()). « exit » quitte le mode
    // texte sans redémarrer (rien n'est enregistré sur une carte : les réglages restent gardés pour l'envoi).
    rawCliByte(o) {
        if (!this.rawCli) {
            this.rawCli = true;
            this.rawLine = [];
            return "\r\nEntering CLI Mode (carte hors ligne : les réglages tapés sont gardés pour l'envoi), type 'exit' to return\r\n\r\n# ";
        }
        if (o === CR || o === TAB) {
            return null;
        }
        if (o !== LF) {
            this.rawLine.push(o);
            return null;
        }
        const line = String.fromCharCode(...this.rawLine).trim();
        this.rawLine = [];
        if (/^exit$/i.test(line)) {
            this.rawCli = false;
            return "\r\nLeaving CLI mode (carte hors ligne)\r\n";
        }
        if (/^save$/i.test(line)) {
            return "\r\n# save : rien à enregistrer hors ligne, les réglages sont déjà gardés. Envoi à la vraie carte : Tableau de bord.\r\n# ";
        }
        const lines = line ? this.cli(line) : [];
        return `\r\n${lines.join("\r\n")}${lines.length ? "\r\n" : ""}# `;
    }

    handleMessages(messages, replies, events) {
        for (const m of messages) {
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
    }

    msp(m) {
        const k = key(m.code, m.payload);
        const { writes, live, eepromWrite, reboot } = this.codes;
        if (this.codes.refused?.has(m.code)) {
            return { reply: encodeResponse(m.version, m.code, new Uint8Array(0), true) };
        }
        // écriture d'une fonction que la carte récoltée n'a pas (lecture refusée à la récolte) : refusée aussi
        if (writes.has(m.code) && !live.has(m.code) && this.readRefused(m.code)) {
            return { reply: encodeResponse(m.version, m.code, new Uint8Array(0), true) };
        }
        if (writes.has(m.code) && !live.has(m.code)) {
            this.rec.writes.push({ code: m.code, payload: hex(m.payload) });
            // la lecture correspondante rend la nouvelle valeur ; sinon, elle est notée (affichage pas à jour)
            if (this.codes.names && !applyWrite(this.rec, this.codes.names, m.code, m.payload)) {
                this.rec.notReread = [...new Set([...(this.rec.notReread ?? []), m.code])];
            }
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

    readRefused(code) {
        const name = Object.keys(this.codes.names ?? {}).find((k) => this.codes.names[k] === code);
        const read = this.codes.names?.[name?.replace("_COMMON_SET_", "_COMMON_").replace("_SET_", "_")];
        return read !== undefined && `${read}:` in this.rec.unsupported;
    }

    cli(command) {
        const c = command.trim();
        if (c in this.rec.cli) {
            return this.rec.cli[c];
        }
        if (!c || CLI_READ.test(c)) {
            return [`# ${c}`, "# (carte hors ligne : pas de réponse récoltée pour cette commande)"];
        }
        if (/^(save|exit|defaults|bl|dfu|reboot|flash_erase)\b|^(profile|rateprofile|battery_profile)\s+\d/i.test(c)) {
            return [`# ${c} : impossible hors ligne`];
        }
        // seulement des réglages : jamais une commande qui agit tout de suite sur la carte (moteurs, passerelle…)
        if (!isSettingCommand(c)) {
            return [`# ${c} : refusée hors ligne (seuls les réglages sont gardés pour l'envoi)`];
        }
        this.rec.writes.push({ cli: c });
        applyCliSet(this.rec, c);
        return [`# ${c}`];
    }
}

export function writeCodes(MSPCodes) {
    const writes = new Set();
    const live = new Set();
    const refused = new Set(OFFLINE_REFUSED_NAMES.map((n) => MSPCodes[n]).filter((c) => c !== undefined));
    for (const [name, code] of Object.entries(MSPCodes)) {
        if (/^MSP2?_(COMMON_)?SET_|^MSP2?_SET_|^MSP_COPY_PROFILE$|^MSP_SELECT_SETTING$|^MSP_EEPROM_WRITE$/.test(name)) {
            writes.add(code);
        }
        if (LIVE_CODE_NAMES.includes(name)) {
            live.add(code);
            writes.add(code);
        }
    }
    return {
        writes,
        live,
        eepromWrite: MSPCodes.MSP_EEPROM_WRITE,
        reboot: MSPCodes.MSP_SET_REBOOT,
        names: MSPCodes,
        refused,
    };
}
