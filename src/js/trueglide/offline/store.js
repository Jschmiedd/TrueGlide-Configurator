// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : cartes hors ligne gardées dans ce navigateur, jusqu'à MAX_BOARDS (une par drone, reconnue par le
// numéro unique de la carte). Une seule est « active » : c'est elle que la carte hors ligne ouvre, et que
// loadBoard() / saveBoard() lisent et écrivent. Le fichier carte s'enregistre aussi sur l'ordinateur.

import { FORMAT, VERSION } from "./board.js";

export const MAX_BOARDS = 3;
const KEY = "trueglide-cartes-hors-ligne";
const LEGACY_KEY = "trueglide-carte-hors-ligne"; // avant le 02/11/2026 : une seule carte

function valid(o) {
    return o && o.format === FORMAT ? o : null;
}

function readAll(storage) {
    try {
        const o = JSON.parse(storage?.getItem(KEY) ?? "null");
        if (o && Array.isArray(o.slots)) {
            const slots = Array.from({ length: MAX_BOARDS }, (_, i) => valid(o.slots[i]));
            const active = Number.isInteger(o.active) && slots[o.active] ? o.active : slots.findIndex(Boolean);
            return { active, slots };
        }
    } catch {
        // illisible : on repart de l'ancienne carte unique, s'il y en a une
    }
    let legacy = null;
    try {
        legacy = valid(JSON.parse(storage?.getItem(LEGACY_KEY) ?? "null"));
    } catch {
        legacy = null;
    }
    const slots = Array.from({ length: MAX_BOARDS }, (_, i) => (i === 0 ? legacy : null));
    return { active: legacy ? 0 : -1, slots };
}

function writeAll(state, storage) {
    try {
        storage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
        throw new Error(`Cartes hors ligne non enregistrées (mémoire du navigateur pleine ?) : ${e?.message ?? e}`);
    }
    storage.removeItem?.(LEGACY_KEY);
}

/** Les cartes gardées : [{ index, rec, active }], places libres omises. */
export function listBoards(storage = globalThis.localStorage) {
    const { active, slots } = readAll(storage);
    return slots.map((rec, index) => (rec ? { index, rec, active: index === active } : null)).filter(Boolean);
}

/** Carte active, ou null. */
export function loadBoard(storage = globalThis.localStorage) {
    const { active, slots } = readAll(storage);
    return active >= 0 ? slots[active] : null;
}

/** Garde la carte active (écritures préparées, carte simulée…). Sans carte active, prend une place comme une récolte. */
export function saveBoard(recording, storage = globalThis.localStorage) {
    const state = readAll(storage);
    if (state.active < 0) {
        addBoard(recording, storage);
        return;
    }
    state.slots[state.active] = recording;
    writeAll(state, storage);
}

/** Place de la carte de ce numéro unique, ou -1. */
export function findBoardIndex(uid, storage = globalThis.localStorage) {
    if (!uid) {
        return -1;
    }
    return readAll(storage).slots.findIndex((rec) => rec?.carte?.uid === uid);
}

/**
 * Place que prendrait une nouvelle récolte de cette carte : la sienne (même numéro unique), sinon une place libre ;
 * -1 si les MAX_BOARDS places sont prises par d'autres cartes.
 */
export function placeFor(uid, storage = globalThis.localStorage) {
    const { slots } = readAll(storage);
    const own = uid ? slots.findIndex((rec) => rec?.carte?.uid === uid) : -1;
    return own >= 0 ? own : slots.findIndex((rec) => !rec);
}

/** Récolte ou fichier ouvert : remplace la carte du même drone, sinon prend une place libre ; devient la carte active. */
export function addBoard(recording, storage = globalThis.localStorage) {
    const state = readAll(storage);
    const index = placeFor(recording?.carte?.uid, storage);
    if (index < 0) {
        throw new Error(
            `${MAX_BOARDS} cartes hors ligne sont déjà gardées : en supprimer une (Tableau de bord) avant d'en ajouter une autre.`,
        );
    }
    state.slots[index] = recording;
    state.active = index;
    writeAll(state, storage);
    return index;
}

/** Choisit la carte active (celle qu'ouvre la carte hors ligne). */
export function setActiveBoard(index, storage = globalThis.localStorage) {
    const state = readAll(storage);
    if (!state.slots[index]) {
        return false;
    }
    state.active = index;
    writeAll(state, storage);
    return true;
}

/** Supprime une carte gardée ; la première restante devient active. */
export function removeBoard(index, storage = globalThis.localStorage) {
    const state = readAll(storage);
    state.slots[index] = null;
    if (state.active === index) {
        state.active = state.slots.findIndex(Boolean);
    }
    writeAll(state, storage);
}

/** Supprime la carte active. */
export function clearBoard(storage = globalThis.localStorage) {
    const { active } = readAll(storage);
    if (active >= 0) {
        removeBoard(active, storage);
    }
}

/** Nom affiché d'une carte gardée : nom du drone (craft_name) s'il est connu, puis la carte. */
export function boardLabel(rec) {
    const carte = rec?.carte ?? {};
    const drone = carte.drone || craftNameFromRecording(rec);
    return drone ? `${drone} (${carte.nom || "?"})` : carte.nom || "?";
}

// craft_name lu dans la récolte quand le fichier date d'avant le champ « drone » : MSP2_GET_TEXT type 2
// (« 02, longueur, texte »), sinon l'ancien MSP_NAME (code 10, le texte seul)
const MSP2_GET_TEXT = 0x3006;
function textOf(hexText) {
    let s = "";
    for (let i = 0; i + 1 < hexText.length; i += 2) {
        const c = Number.parseInt(hexText.slice(i, i + 2), 16);
        if (c >= 32) {
            s += String.fromCharCode(c);
        }
    }
    return s.trim();
}
function craftNameFromRecording(rec) {
    const text = rec?.msp?.[`${MSP2_GET_TEXT}:02`];
    if (text && text.length >= 4) {
        return textOf(text.slice(4));
    }
    const name = rec?.msp?.["10:"];
    return name ? textOf(name) : "";
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
