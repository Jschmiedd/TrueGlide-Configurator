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
    // aussi gardée dans le navigateur : le téléchargement peut être bloqué sans que le logiciel le sache
    keepBackup(file, lines);
    download(file, lines);
    return { ok: true, lines, file };
}

// Sauvegardes avant envoi gardées dans le navigateur (les 10 dernières), téléchargeables depuis le Tableau de bord.
const BACKUPS_KEY = "trueglide-sauvegardes-avant-envoi";
export const MAX_KEPT_BACKUPS = 10;

export function keptBackups(storage = globalThis.localStorage) {
    try {
        const list = JSON.parse(storage?.getItem(BACKUPS_KEY) ?? "[]");
        return Array.isArray(list) ? list.filter((b) => b && typeof b.file === "string" && Array.isArray(b.lines)) : [];
    } catch {
        return [];
    }
}

export function keepBackup(file, lines, storage = globalThis.localStorage) {
    const list = [{ file, date: new Date().toISOString(), lines }, ...keptBackups(storage)].slice(0, MAX_KEPT_BACKUPS);
    try {
        storage?.setItem(BACKUPS_KEY, JSON.stringify(list));
    } catch {
        // stockage plein ou indisponible : le fichier téléchargé reste la sauvegarde
    }
}

export function downloadKeptBackup(backup) {
    download(backup.file, backup.lines);
}

// Commandes à risque (moteurs, mélangeur, ressources, failsafe, armement, orientation) avec leur valeur avant
// (lue dans la sauvegarde) : [{ command, before }]. Contre-audit N4.
const RISKY_SET =
    /^set\s+(failsafe_\w+|yaw_motors_reversed|motor_output_reordering|3d_\w+|motor_pwm_protocol|align_board_\w+|small_angle|runaway_takeoff_\w+|mixer_type)\s*=/i;
const RISKY_LINE = /^(mixer|mmix|smix|resource|timer|dma|map|aux)\b|^feature\s+-?3D\b/i;

export function riskyChanges(commands, backupLines) {
    const before = settingLines(backupLines);
    const out = [];
    for (const command of commands ?? []) {
        const c = String(command).trim();
        let previous = null;
        const set = c.match(/^set\s+(\w+)\s*=/i);
        if (set && RISKY_SET.test(c)) {
            const name = set[1].toLowerCase();
            previous = before.find((l) => new RegExp(`^set\\s+${name}\\s*=`, "i").test(l)) ?? null;
        } else if (RISKY_LINE.test(c)) {
            const words = c.split(/\s+/);
            // même réglage : « resource MOTOR 1 », « aux 0 », « mmix 0 », « mixer », « feature 3D »
            const key = /^(resource|timer|dma)$/i.test(words[0])
                ? words.slice(0, 3)
                : /^(mixer|map|feature)$/i.test(words[0])
                    ? words.slice(0, 1)
                    : words.slice(0, 2);
            const prefix = key.join(" ").toLowerCase();
            previous = /^feature$/i.test(words[0])
                ? before.filter((l) => /^feature\s+-?3D\b/i.test(l)).join(" · ") || null
                : (before.find((l) => l.toLowerCase() === prefix || l.toLowerCase().startsWith(`${prefix} `)) ?? null);
        } else {
            continue;
        }
        if (previous !== c) {
            out.push({ command: c, before: previous });
        }
    }
    return out;
}

// Réglages envoyés relus après l'enregistrement : chaque « set x = v » hors changement de profil est relu par
// « get x » ; les autres lignes sont cherchées dans le « diff all » relu. { checked, mismatches, unchecked }.
export async function verifySent(commands, afterDiff, getFn = (c) => send(c, { timeoutMs: 5000 })) {
    const after = new Set(settingLines(afterDiff).map((l) => l.toLowerCase()));
    const result = { checked: 0, mismatches: [], unchecked: 0 };
    let inProfile = false;
    for (const command of commands ?? []) {
        const c = String(command).trim();
        if (/^(profile|rateprofile|battery_profile|osd_profile)\s+\d+$/i.test(c)) {
            inProfile = true;
            continue;
        }
        const set = c.match(/^set\s+(\w+)\s*=\s*(.*)$/i);
        if (set && !inProfile) {
            const reply = await getFn(`get ${set[1]}`);
            const line = (reply ?? []).map(String).find((l) => l.toLowerCase().startsWith(`${set[1].toLowerCase()} =`));
            const value = line ? line.slice(line.indexOf("=") + 1).trim() : null;
            result.checked++;
            if (value === null || value.toLowerCase() !== set[2].trim().toLowerCase()) {
                result.mismatches.push(`${set[1]} : envoyé ${set[2].trim()}, relu ${value ?? "?"}`);
            }
        } else if (!set && after.has(c.toLowerCase())) {
            result.checked++;
        } else {
            result.unchecked++;
        }
    }
    return result;
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
export async function saveAndVerify(backupLines, { timeoutMs = 45000, commands = [] } = {}) {
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
    const lost = looksLost(backupLines, after);
    let check = { checked: 0, mismatches: [], unchecked: 0 };
    if (!lost && commands.length) {
        try {
            check = await verifySent(commands, after);
        } catch {
            check = { checked: 0, mismatches: [], unchecked: commands.length };
        }
    }
    return { ok: true, verified: true, lost, after, ...check };
}

// Codes MSP des onglets qui touchent les moteurs, le mélangeur, le failsafe, l'armement ou l'orientation.
export const RISKY_MSP_NAMES = [
    "MSP_SET_MIXER_CONFIG",
    "MSP_SET_MOTOR_CONFIG",
    "MSP_SET_MOTOR_3D_CONFIG",
    "MSP2_SET_MOTOR_OUTPUT_REORDERING",
    "MSP_SET_FAILSAFE_CONFIG",
    "MSP_SET_FEATURE_CONFIG",
    "MSP_SET_BOARD_ALIGNMENT_CONFIG",
    "MSP_SET_MODE_RANGE",
    "MSP_SET_ARMING_CONFIG",
    "MSP_SET_RX_MAP",
];

// Texte de la confirmation des changements à risque (msg : (clé, [args]) -> texte).
export function riskyQuestion(risky, msg) {
    // before : ligne de la sauvegarde ; null : valeur par défaut ; "onglet" : réglage d'onglet (MSP), voir la sauvegarde
    const label = (b) => (b === null ? msg("tfRiskyDefault") : b === "onglet" ? msg("tfRiskyTabSetting") : b);
    const lines = risky.map((r) => `• ${r.command}\n   ${msg("tfRiskyBefore", [label(r.before)])}`).join("\n");
    return msg("tfRiskyConfirm", [lines]);
}

// Message du résultat après l'enregistrement (msg : (clé, [args]) -> texte).
export function verificationMessage(saved, file, msg) {
    if (saved.lost) {
        return msg("tfOfflineSentLost", [file]);
    }
    if (!saved.verified) {
        return msg("tfOfflineSentNotVerified", [file]);
    }
    if (saved.mismatches?.length) {
        return msg("tfVerifyMismatch", [saved.mismatches.length, saved.mismatches.slice(0, 5).join(" ; "), file]);
    }
    if (!saved.checked) {
        return msg("tfVerifyNone");
    }
    return saved.unchecked
        ? msg("tfVerifyPartial", [saved.checked, saved.unchecked])
        : msg("tfVerifyAllOk", [saved.checked]);
}
