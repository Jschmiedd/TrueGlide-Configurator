// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : contrôle des ports série de la carte hors ligne, comme le firmware (src/main/io/serial.c,
// isSerialConfigValid, appelé par validateAndFixConfig). Une configuration refusée par le firmware est remise
// entièrement par défaut au redémarrage de la vraie carte (PG_RESET(serialConfig)), récepteur compris : la carte hors
// ligne, qui rejoue la récolte, ne le ferait pas d'elle-même. On le signale et on n'envoie pas.

import { fromHex } from "./frames.js";

export const FUNCTION = {
    MSP: 1 << 0,
    GPS: 1 << 1,
    TELEMETRY_FRSKY_HUB: 1 << 2,
    TELEMETRY_HOTT: 1 << 3,
    TELEMETRY_LTM: 1 << 4,
    TELEMETRY_SMARTPORT: 1 << 5,
    RX_SERIAL: 1 << 6,
    BLACKBOX: 1 << 7,
    TELEMETRY_MAVLINK: 1 << 9,
    TELEMETRY_IBUS: 1 << 12,
    VTX_MSP: 1 << 17,
};
const F = FUNCTION;
// numéros des ports (src/main/io/serial.h) : USB 20, ports logiciels 30 à 39, LPUART 40 à 49, UART 50 à 69
// (UART1 = 51, ou UART0 = 50 sur les processeurs qui en ont un), ports PIO 70 et plus
const SERIAL_PORT_USB_VCP = 20;
const SOFTSERIAL_FIRST = 30;
const LPUART_FIRST = 40;
const UART_FIRST = 50;
const PIOUART_FIRST = 70;
const isSoftSerial = (id) => id >= SOFTSERIAL_FIRST && id < LPUART_FIRST;
const MAX_MSP_PORT_COUNT = 3;
const TELEMETRY_SHAREABLE = F.TELEMETRY_FRSKY_HUB | F.TELEMETRY_LTM | F.TELEMETRY_MAVLINK;
const TELEMETRY_PORT_FUNCTIONS = TELEMETRY_SHAREABLE | F.TELEMETRY_HOTT | F.TELEMETRY_SMARTPORT;
const SHARABLE_WITH_MSP = F.BLACKBOX | TELEMETRY_PORT_FUNCTIONS | F.VTX_MSP;
// récepteurs série dont la ligne TX peut porter une télémétrie partagée (telemetryCheckRxPortShared)
const SERIALRX_SHARED_TELEMETRY = new Set([1, 2, 3, 4, 5, 6, 7, 15, 16]); // SPEKTRUM2048, SBUS, SUMD, SUMH, XBUS ×2, IBUS, SPEKTRUM1024, MAVLINK
const SERIALRX_IBUS = 7;

function bitCount(mask) {
    let n = 0;
    for (let m = mask >>> 0; m; m >>>= 1) {
        n += m & 1;
    }
    return n;
}

function portName(id) {
    if (id === SERIAL_PORT_USB_VCP) {
        return "USB";
    }
    if (isSoftSerial(id)) {
        return `SOFTSERIAL${id - SOFTSERIAL_FIRST + 1}`;
    }
    if (id >= LPUART_FIRST && id < UART_FIRST) {
        return `LPUART${id - LPUART_FIRST + 1}`;
    }
    if (id >= UART_FIRST && id < PIOUART_FIRST) {
        return `UART${id - UART_FIRST}`;
    }
    if (id >= PIOUART_FIRST) {
        return `PIOUART${id - PIOUART_FIRST}`;
    }
    return `port ${id}`;
}

function rxSharesTelemetry(mask, serialrxProvider) {
    if (mask & F.RX_SERIAL && mask & TELEMETRY_SHAREABLE && SERIALRX_SHARED_TELEMETRY.has(serialrxProvider)) {
        return true;
    }
    return Boolean(mask & F.TELEMETRY_IBUS && mask & F.RX_SERIAL && serialrxProvider === SERIALRX_IBUS);
}

/**
 * Même règle que le firmware. Rend la raison du refus (texte), ou null si la configuration est acceptée.
 * @param {{identifier: number, mask: number}[]} ports
 * @param {number} serialrxProvider valeur de serialrx_provider (MSP_RX_CONFIG, octet 0)
 */
export function serialPortsProblem(ports, serialrxProvider) {
    let mspPorts = 0;
    for (const { identifier, mask: raw } of ports) {
        // ports logiciels : le firmware retire de lui-même MSP et récepteur, sans refuser
        const mask = isSoftSerial(identifier) ? (raw & ~(F.MSP | F.RX_SERIAL)) >>> 0 : raw >>> 0;
        if (mask & F.MSP) {
            mspPorts++;
        }
        if (identifier === SERIAL_PORT_USB_VCP && !(mask & F.MSP)) {
            return "le port USB doit garder MSP";
        }
        const bits = bitCount(mask);
        if (mask & F.VTX_MSP && bits === 1) {
            return `${portName(identifier)} : VTX (MSP) doit partager le port avec MSP ou le récepteur`;
        }
        if (bits > 1) {
            if (bits > bitCount(F.MSP | SHARABLE_WITH_MSP)) {
                return `${portName(identifier)} : trop de fonctions sur le même port`;
            }
            const mspShared = mask & F.MSP && mask & SHARABLE_WITH_MSP;
            if (!mspShared && !rxSharesTelemetry(mask, serialrxProvider)) {
                return `${portName(identifier)} : ces fonctions ne peuvent pas partager le même port`;
            }
        }
    }
    if (mspPorts === 0) {
        return "aucun port avec MSP";
    }
    if (mspPorts > MAX_MSP_PORT_COUNT) {
        return `MSP sur ${mspPorts} ports (${MAX_MSP_PORT_COUNT} au plus)`;
    }
    return null;
}

/** Ports lus dans la réponse MSP2_COMMON_SERIAL_CONFIG : nombre, puis par port : id, masque 32 bits, 4 vitesses. */
export function parseSerialConfig(bytes) {
    if (!bytes?.length) {
        return null;
    }
    const count = bytes[0];
    if (!count) {
        return [];
    }
    const size = Math.floor((bytes.length - 1) / count);
    if (size < 5) {
        return null;
    }
    const ports = [];
    for (let i = 0; i < count; i++) {
        const at = 1 + i * size;
        const mask = (bytes[at + 1] | (bytes[at + 2] << 8) | (bytes[at + 3] << 16) | (bytes[at + 4] << 24)) >>> 0;
        ports.push({ identifier: bytes[at], mask });
    }
    return ports;
}

/**
 * Raison du refus pour la carte hors ligne (fichier carte), ou null : configuration acceptée, ou pas de lecture des
 * ports dans la récolte (rien à juger).
 */
export function recordingSerialProblem(rec, MSPCodes) {
    const serial = rec?.msp?.[`${MSPCodes.MSP2_COMMON_SERIAL_CONFIG}:`];
    const rx = rec?.msp?.[`${MSPCodes.MSP_RX_CONFIG}:`];
    const ports = serial ? parseSerialConfig(fromHex(serial)) : null;
    if (!ports) {
        return null;
    }
    const provider = rx ? fromHex(rx)[0] : 0;
    return serialPortsProblem(ports, provider);
}
