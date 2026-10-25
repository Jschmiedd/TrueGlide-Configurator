// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : carte hors ligne gardée dans ce navigateur (une carte à la fois). Le fichier carte s'enregistre aussi
// sur l'ordinateur pour la garder ou la donner.

import { FORMAT, VERSION } from "./board.js";

const KEY = "trueglide-carte-hors-ligne";

export function loadBoard(storage = globalThis.localStorage) {
    try {
        const o = JSON.parse(storage?.getItem(KEY) ?? "null");
        return o && o.format === FORMAT ? o : null;
    } catch {
        return null;
    }
}

export function saveBoard(recording, storage = globalThis.localStorage) {
    storage.setItem(KEY, JSON.stringify(recording));
}

export function clearBoard(storage = globalThis.localStorage) {
    storage?.removeItem(KEY);
}

// Ouvre un fichier carte (texte JSON) ; refuse un autre format ou une autre version.
export function parseBoardFile(text) {
    let o;
    try {
        o = JSON.parse(text);
    } catch {
        throw new Error("Fichier carte illisible (JSON abîmé).");
    }
    if (o?.format !== FORMAT) {
        throw new Error("Ce fichier n'est pas un fichier carte TrueGlide.");
    }
    if (o.version !== VERSION) {
        throw new Error(`Version du fichier carte non prise en charge : ${o.version}.`);
    }
    return o;
}
