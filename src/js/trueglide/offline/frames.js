// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : carte hors ligne. Lecture des demandes envoyées par le logiciel (MSP v1, MSP v2, CLI sur MSP) et
// écriture des réponses, au même format que le firmware (src/main/msp/msp_serial.c).

const DOLLAR = 0x24;
const M = 0x4d;
const X = 0x58;
const TO_FC = 0x3c; // <
const FROM_FC = 0x3e; // >
const ERROR = 0x21; // !
const STX = 0x02;
const ETX = 0x03;
const JUMBO = 255;

export function crc8(crc, octet) {
    crc ^= octet;
    for (let i = 0; i < 8; i++) {
        crc = crc & 0x80 ? ((crc << 1) & 0xff) ^ 0xd5 : (crc << 1) & 0xff;
    }
    return crc;
}

export function hex(octets) {
    return Array.from(octets ?? [], (o) => o.toString(16).padStart(2, "0")).join("");
}

export function fromHex(texte) {
    const out = new Uint8Array((texte?.length ?? 0) / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(texte.slice(2 * i, 2 * i + 2), 16);
    }
    return out;
}

// Lecteur en continu : feed(octets) rend la liste des messages complets. Sens « request » (logiciel -> carte) :
// { type: "msp", version, code, payload } ou { type: "cli", command }. Sens « response » (carte -> logiciel) :
// { type: "msp", version, code, payload, error } ou { type: "cli", lines }.
export class FrameReader {
    constructor(direction = "request") {
        this.direction = direction;
        this.reset();
    }

    reset() {
        this.state = "idle";
        this.buffer = [];
    }

    feed(octets) {
        const out = [];
        for (const o of octets) {
            const r = this._octet(o);
            if (r) {
                out.push(r);
            }
        }
        return out;
    }

    _octet(o) {
        const b = this.buffer;
        switch (this.state) {
            case "idle":
                if (o === DOLLAR) {
                    this.state = "proto";
                } else if (o === STX) {
                    this.state = "cli";
                    this.text = [];
                }
                return null;
            case "proto":
                this.version = o === M ? 1 : o === X ? 2 : 0;
                this.state = this.version ? "dir" : "idle";
                return null;
            case "dir": {
                const ok = this.direction === "request" ? o === TO_FC : o === FROM_FC || o === ERROR;
                this.error = o === ERROR;
                this.state = ok ? (this.version === 1 ? "v1len" : "v2flag") : "idle";
                b.length = 0;
                return null;
            }
            case "cli":
                if (o === ETX) {
                    this.state = "idle";
                    const text = String.fromCharCode(...this.text);
                    return this.direction === "request"
                        ? { type: "cli", command: text.replace(/[\r\n]+$/, "") }
                        : { type: "cli", lines: text.replace(/\r/g, "").split("\n") };
                }
                this.text.push(o);
                return null;
            case "v1len":
                this.length = o;
                this.state = "v1code";
                return null;
            case "v1code":
                this.code = o;
                if (this.length === JUMBO) {
                    this.state = "v1jlo";
                    return null;
                }
                return this._payloadStart("v1sum");
            case "v1jlo":
                this.length = o;
                this.state = "v1jhi";
                return null;
            case "v1jhi":
                this.length |= o << 8;
                return this._payloadStart("v1sum");
            case "v2flag":
                this.state = "v2clo";
                return null;
            case "v2clo":
                this.code = o;
                this.state = "v2chi";
                return null;
            case "v2chi":
                this.code |= o << 8;
                this.state = "v2llo";
                return null;
            case "v2llo":
                this.length = o;
                this.state = "v2lhi";
                return null;
            case "v2lhi":
                this.length |= o << 8;
                return this._payloadStart("v2sum");
            case "payload":
                b.push(o);
                if (b.length >= this.length) {
                    this.state = this.after;
                }
                return null;
            case "v1sum":
            case "v2sum": {
                this.state = "idle";
                const message = { type: "msp", version: this.version, code: this.code, payload: Uint8Array.from(b) };
                if (this.direction === "response") {
                    message.error = this.error;
                }
                return message;
            }
            default:
                this.state = "idle";
                return null;
        }
    }

    _payloadStart(after) {
        this.after = after;
        this.state = this.length > 0 ? "payload" : after;
        this.buffer.length = 0;
        return null;
    }
}

// Réponse du firmware : « $M> » (v1, cadre jumbo au-delà de 254 octets) ou « $X> » (v2) ; « ! » si non pris en charge.
export function encodeResponse(version, code, payload = new Uint8Array(0), error = false) {
    const data = payload ?? new Uint8Array(0);
    const dir = error ? ERROR : FROM_FC;
    if (version === 2) {
        const head = [
            DOLLAR,
            X,
            dir,
            0,
            code & 0xff,
            (code >> 8) & 0xff,
            data.length & 0xff,
            (data.length >> 8) & 0xff,
        ];
        let crc = 0;
        for (const o of head.slice(3)) {
            crc = crc8(crc, o);
        }
        for (const o of data) {
            crc = crc8(crc, o);
        }
        return Uint8Array.from([...head, ...data, crc]);
    }
    const jumbo = data.length >= JUMBO;
    const head = jumbo
        ? [DOLLAR, M, dir, JUMBO, code, data.length & 0xff, (data.length >> 8) & 0xff]
        : [DOLLAR, M, dir, data.length, code];
    let sum = 0;
    for (const o of head.slice(3)) {
        sum ^= o;
    }
    for (const o of data) {
        sum ^= o;
    }
    return Uint8Array.from([...head, ...data, sum]);
}

// Réponse du CLI sur MSP : STX, lignes séparées par « \r\n », ETX.
export function encodeCli(lines) {
    const text = (lines ?? []).join("\r\n");
    return Uint8Array.from([STX, ...Array.from(text, (c) => c.charCodeAt(0) & 0xff), ETX]);
}
