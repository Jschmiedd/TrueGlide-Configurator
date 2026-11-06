// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide (audit du 06/11/2026) : protection de la configuration de la vraie carte quand la carte hors ligne ou
// Studio lui envoient des réglages.
//  - avant toute écriture : « diff all » de la carte, enregistré dans un fichier sur l'ordinateur (restauration :
//    coller ce fichier dans l'onglet CLI, puis « save ») ;
//  - comparaison avec la récolte : la carte a-t-elle été changée depuis ?
//  - après « save » : attente de la reconnexion, puis nouveau « diff all » ; une configuration perdue (coupure
//    pendant l'enregistrement, carte revenue aux réglages d'usine) est signalée avec le fichier de sauvegarde.

import { send, saveAndReconnect } from "../../composables/useMspCliSession.js";
import { getConnectionState, State } from "../connection_state.js";
import { isUsableDiff } from "./studio_tab.js";

// Lignes de réglage d'un « diff all », comparables d'une lecture à l'autre (sans commentaires ni lignes d'identité).
export function settingLines(lines) {
    return (lines ?? [])
        .map((l) => String(l).trim())
        .filter(
            (l) =>
                l &&
                !l.startsWith("#") &&
                !/^(batch|defaults|save|board_name|manufacturer_id|mcu_id|signature|diff|dump|version)\b/i.test(l),
        );
}

// Différences entre deux « diff all » : lignes disparues et lignes nouvelles.
export function compareDiffs(before, after) {
    const a = new Set(settingLines(before));
    const b = new Set(settingLines(after));
    return { missing: [...a].filter((l) => !b.has(l)), added: [...b].filter((l) => !a.has(l)) };
}

// Configuration perdue après l'enregistrement : la lecture n'est pas utilisable, ou la plupart des réglages de la
// sauvegarde ont disparu (carte revenue aux réglages d'usine).
export function looksLost(backup, after) {
    if (!isUsableDiff(after)) {
        return true;
    }
    const before = settingLines(backup).length;
    return before >= 10 && settingLines(after).length < before / 2;
}

export function backupFileName(label, date = new Date()) {
    const d = date.toISOString().replace(/[:T]/g, "-").slice(0, 19);
    return `${String(label || "carte").replace(/[^A-Za-z0-9_-]+/g, "_")}_sauvegarde_avant_envoi_${d}.txt`;
}

function download(name, lines) {
    if (typeof document === "undefined") {
        return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`${lines.join("\n")}\n`], { type: "text/plain" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// « diff all » de la carte branchée, enregistré sur l'ordinateur. { ok, lines, file } ou { ok: false, reason }.
export async function backupBeforeWrite(label) {
    let lines;
    try {
        lines = await send("diff all", { timeoutMs: 20000 });
    } catch (e) {
        return { ok: false, reason: String(e?.message ?? e) };
    }
    if (!isUsableDiff(lines)) {
        return { ok: false, reason: "diff all illisible" };
    }
    const file = backupFileName(label);
    download(file, lines);
    return { ok: true, lines, file };
}

function waitFor(test, timeoutMs) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const tick = () => {
            if (test()) {
                resolve(true);
            } else if (Date.now() - t0 > timeoutMs) {
                resolve(false);
            } else {
                setTimeout(tick, 250);
            }
        };
        tick();
    });
}

// « save », reconnexion, puis vérification. { ok, verified, lost, after } ou { ok: false, reason: "save", error }.
export async function saveAndVerify(backupLines, { timeoutMs = 45000 } = {}) {
    const saved = await saveAndReconnect();
    if (!saved.ok) {
        return { ok: false, reason: "save", error: saved.error };
    }
    const state = () => getConnectionState().state;
    // la carte redémarre : d'abord la déconnexion, puis la reconnexion
    await waitFor(() => state() !== State.CONNECTED, 8000);
    // reconnexion, ou abandon de la reconnexion (logiciel revenu au repos pendant plusieurs secondes)
    let idleSince = null;
    await waitFor(() => {
        const s = state();
        if (s === State.IDLE || s === State.FAILED) {
            idleSince ??= Date.now();
        } else {
            idleSince = null;
        }
        return s === State.CONNECTED || (idleSince !== null && Date.now() - idleSince > 6000);
    }, timeoutMs);
    const back = state() === State.CONNECTED;
    if (!back) {
        return { ok: true, verified: false, lost: false };
    }
    let after;
    try {
        after = await send("diff all", { timeoutMs: 20000 });
    } catch {
        return { ok: true, verified: false, lost: false };
    }
    return { ok: true, verified: true, lost: looksLost(backupLines, after), after };
}
