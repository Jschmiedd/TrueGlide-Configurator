// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : carte hors ligne. Après une écriture, la réponse de la lecture correspondante est mise à jour comme le
// ferait le firmware (src/main/msp/msp.c, mspProcessInCommand / mspProcessOutCommand) : en rouvrant l'onglet, on
// retrouve la valeur changée, et rien de plus (un champ que le firmware ignore reste tel qu'il était).

import { fromHex, hex } from "./frames.js";

const PWM_PULSE_MIN = 750;
const PWM_PULSE_MAX = 2250;
const MAX_NAME_LENGTH = 16;
const MAX_PROFILE_NAME_LENGTH = 8;
const FEATURE_ESC_SENSOR_BIT = 27;
// MSP2_GET_TEXT / MSP2_SET_TEXT : type -> place réservée dans le firmware
const TEXT_SPACE = {
    1: MAX_NAME_LENGTH,
    2: MAX_NAME_LENGTH,
    3: MAX_PROFILE_NAME_LENGTH,
    4: MAX_PROFILE_NAME_LENGTH,
    5: 8,
};
const TEXT_CRAFT_NAME = 2;

function u16(b, i) {
    return b[i] | (b[i + 1] << 8);
}

function put16(b, i, v) {
    b[i] = v & 0xff;
    b[i + 1] = (v >> 8) & 0xff;
}

export class ResponseStore {
    constructor(rec) {
        this.rec = rec;
    }

    get(code, req = "") {
        const v = this.rec.msp[`${code}:${req}`];
        return v === undefined ? null : fromHex(v);
    }

    set(code, bytes, req = "") {
        this.rec.msp[`${code}:${req}`] = hex(bytes);
    }

    // copie la réponse, la modifie, la garde ; false si la lecture n'a jamais été récoltée
    patch(code, fn, req = "") {
        const b = this.get(code, req);
        if (!b) {
            return false;
        }
        const copy = Uint8Array.from(b);
        const out = fn(copy);
        this.set(code, out ?? copy, req);
        return true;
    }
}

// Écrit src dans dst à partir de offset, sans dépasser dst.
function overlay(dst, src, offset = 0) {
    for (let i = 0; i < src.length && offset + i < dst.length; i++) {
        dst[offset + i] = src[i];
    }
    return dst;
}

function textResponse(type, payload) {
    const length = Math.min(TEXT_SPACE[type] ?? MAX_NAME_LENGTH, payload[1] ?? 0, Math.max(0, payload.length - 2));
    return Uint8Array.from([type, length, ...payload.slice(2, 2 + length)]);
}

// Écritures dont la lecture n'a pas le même format.
function specialHandlers(C) {
    return {
        [C.MSP_SET_PID]: (s, p) => s.patch(C.MSP_PID, (g) => overlay(g, p)),
        [C.MSP_SET_BLACKBOX_CONFIG]: (s, p) => s.patch(C.MSP_BLACKBOX_CONFIG, (g) => overlay(g, p, 1)),
        // l'alignement du gyroscope envoyé ici est ignoré par le firmware (octets 0 et 1)
        [C.MSP_SET_SENSOR_ALIGNMENT]: (s, p) =>
            s.patch(C.MSP_SENSOR_ALIGNMENT, (g) => {
                g[2] = p[2];
                g[4] = p[3];
                if (p.length >= 10) {
                    overlay(g, p.slice(4, 10), 5);
                }
            }),
        // minthrottle ignoré ; le nombre de moteurs est en lecture seule
        [C.MSP_SET_MOTOR_CONFIG]: (s, p) =>
            s.patch(C.MSP_MOTOR_CONFIG, (g) => {
                overlay(g, p.slice(2, 6), 2);
                if (p.length >= 8) {
                    g[7] = p[6];
                    g[8] = p[7];
                }
            }),
        [C.MSP_SET_FEATURE_CONFIG]: (s, p) => {
            const done = s.patch(C.MSP_FEATURE_CONFIG, (g) => overlay(g, p));
            const mask = (p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24)) >>> 0;
            s.patch(C.MSP_MOTOR_CONFIG, (g) => {
                if (g.length >= 10) {
                    g[9] = (mask >>> FEATURE_ESC_SENSOR_BIT) & 1;
                }
            });
            return done;
        },
        [C.MSP_SET_MODE_RANGE]: (s, p) => {
            const i = p[0];
            const done = s.patch(C.MSP_MODE_RANGES, (g) => overlay(g, p.slice(1, 5), i * 4));
            if (p.length >= 7) {
                s.patch(C.MSP_MODE_RANGES_EXTRA, (g) => overlay(g, [p[1], p[5], p[6]], 1 + i * 3));
            } else {
                s.patch(C.MSP_MODE_RANGES_EXTRA, (g) => overlay(g, [p[1]], 1 + i * 3));
            }
            return done;
        },
        [C.MSP_SET_ADJUSTMENT_RANGE]: (s, p) =>
            s.patch(C.MSP_ADJUSTMENT_RANGES, (g) => {
                const at = p[0] * 10;
                overlay(g, [0, ...p.slice(2, 7)], at);
                if (p.length >= 11) {
                    overlay(g, p.slice(7, 11), at + 6);
                }
            }),
        // valeur de repli arrondie au pas de 25 du firmware (RXFAIL_STEP_TO_CHANNEL_VALUE)
        [C.MSP_SET_RXFAIL_CONFIG]: (s, p) =>
            s.patch(C.MSP_RXFAIL_CONFIG, (g) => {
                const at = p[0] * 3;
                const value = Math.min(PWM_PULSE_MAX, Math.max(PWM_PULSE_MIN, u16(p, 2)));
                const step = Math.floor((value - PWM_PULSE_MIN) / 25);
                if (at + 3 <= g.length) {
                    g[at] = p[1];
                    put16(g, at + 1, PWM_PULSE_MIN + 25 * step);
                }
            }),
        [C.MSP_SET_NAME]: (s, p) => {
            const name = p.slice(0, MAX_NAME_LENGTH);
            const done = s.patch(C.MSP_NAME, () => Uint8Array.from(name));
            s.patch(
                C.MSP2_GET_TEXT,
                () => Uint8Array.from([TEXT_CRAFT_NAME, name.length, ...name]),
                hex([TEXT_CRAFT_NAME]),
            );
            return done;
        },
        [C.MSP2_SET_TEXT]: (s, p) => {
            const type = p[0];
            const text = textResponse(type, p);
            const done = s.patch(C.MSP2_GET_TEXT, () => text, hex([type]));
            if (type === TEXT_CRAFT_NAME) {
                s.patch(C.MSP_NAME, () => text.slice(2));
            }
            return done;
        },
    };
}

// Applique une écriture à la carte hors ligne. Rend true si la lecture correspondante a été mise à jour.
export function applyWrite(rec, MSPCodes, code, payload) {
    const store = new ResponseStore(rec);
    const handlers = specialHandlers(MSPCodes);
    if (handlers[code]) {
        return handlers[code](store, payload);
    }
    // même format : la lecture rend ce qui a été écrit (et garde ses champs en plus, en lecture seule)
    const name = Object.keys(MSPCodes).find((k) => MSPCodes[k] === code);
    const readName = name?.replace("_COMMON_SET_", "_COMMON_").replace("_SET_", "_");
    const read = MSPCodes[readName];
    if (read === undefined) {
        return false;
    }
    return store.patch(read, (g) => overlay(g, payload));
}

// « set nom = valeur » du CLI : les réponses récoltées de « get … » qui montrent ce réglage sont mises à jour, comme
// les affiche le firmware (src/main/cli/cli.c) : « nom = valeur », « Allowed range… », puis « Default value: … »
// seulement quand la valeur n'est plus celle d'usine.
export function applyCliSet(rec, command) {
    const m = command.match(/^set\s+(\w+)\s*=\s*(.*)$/i);
    if (!m) {
        return false;
    }
    const name = m[1].toLowerCase();
    const value = m[2].trim();
    let done = false;
    for (const lines of Object.values(rec.cli)) {
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i].match(/^(\w+)\s*=\s*(.*)$/);
            if (!l || l[1].toLowerCase() !== name) {
                continue;
            }
            const old = l[2].trim();
            lines[i] = `${l[1]} = ${value}`;
            done = true;
            // fin du bloc de ce réglage : première ligne vide ou réglage suivant
            let end = i + 1;
            while (end < lines.length && lines[end] !== "" && !/^\w+\s*=/.test(lines[end])) {
                end++;
            }
            const d = lines.slice(i + 1, end).findIndex((x) => /^Default value:/.test(x));
            const fallback = d >= 0 ? lines[i + 1 + d].replace(/^Default value:\s*/, "") : old;
            if (d >= 0) {
                lines.splice(i + 1 + d, 1);
                end--;
            }
            if (value.toLowerCase() !== fallback.toLowerCase()) {
                lines.splice(end, 0, `Default value: ${fallback}`);
            }
        }
    }
    return done;
}
