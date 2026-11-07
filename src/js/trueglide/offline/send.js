// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : envoi à la vraie carte des changements préparés hors ligne. Seulement vers la carte récoltée, avec le
// même firmware. Les écritures partent dans l'ordre où elles ont été faites ; à la première refusée, rien n'est
// enregistré (la carte redémarre sans sauvegarder) ; sinon « save ».

import MSP from "../../msp.js";
import MSPCodes from "../../msp/MSPCodes.js";
import FC from "../../fc.js";
import { send, isConnectionClosedError } from "../../../composables/useMspCliSession.js";
import {
    RISKY_MSP_NAMES,
    pidMspRisky,
    backupBeforeWrite,
    compareDiffs,
    riskyChanges,
    saveAndVerify,
    settingLines,
} from "../write_guard.js";
import { fromHex } from "./frames.js";
import { boardIdentity, sameBoard } from "./identity.js";
import { recordingSerialProblem } from "./serial_rules.js";
import { findBoardIndex, loadBoard, saveBoard, setActiveBoard } from "./store.js";
import { boardChanged } from "./harvest_state.js";
import { cliRefused } from "../studio_tab.js";
import { forbiddenWrite } from "./safety.js";

// Rend { ok } ou { ok: false, reason, index, write, reply }.
export async function sendPrepared({ onProgress, force = false, risksOk = false, backup: earlier = null } = {}) {
    // la carte hors ligne de ce drone (même numéro unique que la carte branchée), parmi celles gardées
    const own = findBoardIndex(boardIdentity(FC.CONFIG).uid);
    if (own >= 0) {
        setActiveBoard(own);
    }
    const rec = loadBoard();
    // carte simulée : commandes du CLI tirées des « dump all » ; sinon, écritures gardées par la carte hors ligne
    const writes = rec?.simulee?.commandes?.length
        ? rec.simulee.commandes.map((cli) => ({ cli }))
        : (rec?.writes ?? []);
    if (!writes.length) {
        return { ok: false, reason: "vide" };
    }
    // jamais une commande qui agit tout de suite sur la carte (fichier carte modifié à la main, par exemple)
    const forbidden = forbiddenWrite(writes, MSPCodes);
    if (forbidden) {
        return { ok: false, reason: "interdit", write: forbidden };
    }
    const check = sameBoard(rec.carte, boardIdentity(FC.CONFIG));
    if (!check.ok) {
        return { ok: false, reason: check.reason };
    }
    // ports que le firmware refuserait (il les remettrait tous par défaut, récepteur compris) : rien n'est envoyé.
    // La carte simulée fait tourner le vrai firmware : elle les a déjà jugés elle-même.
    const ports = rec.simulee?.commandes?.length ? null : recordingSerialProblem(rec, MSPCodes);
    if (ports) {
        return { ok: false, reason: "ports", reply: ports };
    }
    // sauvegarde de la vraie carte sur l'ordinateur avant toute écriture (audit du 06/11/2026)
    // (la sauvegarde faite juste avant la question « envoyer quand même ? » est reprise : un seul fichier)
    const backup = earlier?.ok ? earlier : await backupBeforeWrite(rec.carte?.drone || rec.carte?.nom);
    if (!backup.ok) {
        return { ok: false, reason: "sauvegarde", reply: backup.reason };
    }
    // la carte a-t-elle changé depuis la récolte (ou depuis le dernier envoi vérifié) ? L'envoi écraserait ces
    // changements : le pilote décide, en connaissance de cause.
    const reference = rec.reference ?? (rec.envoye ? null : rec.cli?.["diff all"]);
    const changes = reference ? compareDiffs(reference, backup.lines) : null;
    const changed = !reference || changes.missing.length + changes.added.length > 0;
    if (changed && !force) {
        return {
            ok: false,
            reason: reference ? "changee" : "inconnue",
            count: changes ? changes.missing.length + changes.added.length : 0,
            lignes: changes ? [...changes.added, ...changes.missing].slice(0, 10) : [],
            file: backup.file,
            backup,
        };
    }
    // changements à risque (moteurs, mélangeur, failsafe, armement, orientation) : confirmation à part, avec la valeur
    // d'avant (contre-audit N4)
    const cliCommands = writes.filter((w) => w.cli !== undefined).map((w) => w.cli);
    const riskyCodes = new Set(RISKY_MSP_NAMES.map((n) => MSPCodes[n]).filter((c) => c !== undefined));
    const risky = [
        ...riskyChanges(cliCommands, backup.lines),
        ...writes
            .filter((w) => w.cli === undefined && riskyCodes.has(Number(w.code)))
            .map((w) => ({
                command: Object.keys(MSPCodes).find((k) => MSPCodes[k] === Number(w.code)) ?? `MSP ${w.code}`,
                before: "onglet",
            })),
        // PID changés fortement depuis l'onglet PID (audit du 07/11/2026)
        ...writes
            .filter((w) => w.cli === undefined && Number(w.code) === MSPCodes.MSP_SET_PID)
            .flatMap((w) => pidMspRisky([...fromHex(w.payload)], backup.lines)),
    ];
    if (risky.length && !risksOk) {
        return { ok: false, reason: "risque", risky, file: backup.file, backup };
    }
    for (let i = 0; i < writes.length; i++) {
        onProgress?.({ step: i + 1, total: writes.length });
        const w = writes[i];
        let refused = null;
        try {
            if (w.cli !== undefined) {
                refused = cliRefused(await send(w.cli));
            } else {
                const r = await MSP.promise(w.code, fromHex(w.payload));
                refused = r?.unsupported ? "refusé par la carte" : null;
            }
        } catch (e) {
            if (isConnectionClosedError(e)) {
                // liaison coupée : rien n'a été enregistré (les réglages envoyés n'étaient qu'en mémoire vive)
                return { ok: false, reason: "coupure", index: i, file: backup.file };
            }
            refused = String(e?.message ?? e);
        }
        if (refused) {
            // rien n'est enregistré : la carte redémarre sans sauvegarder
            const { reinitializeConnection } = await import("../../serial_backend.js");
            reinitializeConnection();
            return { ok: false, reason: "refus", index: i, write: w, reply: refused, file: backup.file };
        }
    }
    const saved = await saveAndVerify(backup.lines, { commands: cliCommands, file: backup.file });
    if (!saved.ok) {
        return { ok: false, reason: "save", reply: String(saved.error?.message ?? saved.error), file: backup.file };
    }
    rec.writes = [];
    rec.notReread = [];
    if (rec.simulee?.commandes?.length) {
        // la vraie carte est maintenant comme la carte simulée : nouveau départ
        rec.simulee.base = rec.simulee.baseApres ?? rec.simulee.base;
        rec.simulee.commandes = [];
    }
    rec.envoye = new Date().toISOString();
    // référence pour le prochain envoi : la carte relue après l'enregistrement (sinon inconnue)
    rec.reference = saved.verified && !saved.lost ? settingLines(saved.after) : null;
    rec.dernierEnvoi = {
        date: rec.envoye,
        count: writes.length,
        verified: saved.verified,
        lost: saved.lost,
        file: backup.file,
    };
    saveBoard(rec);
    boardChanged();
    return { ok: true, count: writes.length, verified: saved.verified, lost: saved.lost, file: backup.file };
}
