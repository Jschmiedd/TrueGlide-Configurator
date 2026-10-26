// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : envoi à la vraie carte des changements préparés hors ligne. Seulement vers la carte récoltée, avec le
// même firmware. Les écritures partent dans l'ordre où elles ont été faites ; à la première refusée, rien n'est
// enregistré (la carte redémarre sans sauvegarder) ; sinon « save ».

import MSP from "../../msp.js";
import FC from "../../fc.js";
import { send, saveAndReconnect } from "../../../composables/useMspCliSession.js";
import { fromHex } from "./frames.js";
import { boardIdentity, sameBoard } from "./identity.js";
import { loadBoard, saveBoard } from "./store.js";
import { boardChanged } from "./harvest_state.js";
import { cliRefused } from "../studio_tab.js";

// Rend { ok } ou { ok: false, reason, index, write, reply }.
export async function sendPrepared({ onProgress } = {}) {
    const rec = loadBoard();
    // carte simulée : commandes du CLI tirées des « dump all » ; sinon, écritures gardées par la carte hors ligne
    const writes = rec?.simulee?.commandes?.length
        ? rec.simulee.commandes.map((cli) => ({ cli }))
        : (rec?.writes ?? []);
    if (!writes.length) {
        return { ok: false, reason: "vide" };
    }
    const check = sameBoard(rec.carte, boardIdentity(FC.CONFIG));
    if (!check.ok) {
        return { ok: false, reason: check.reason };
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
            refused = String(e?.message ?? e);
        }
        if (refused) {
            // rien n'est enregistré : la carte redémarre sans sauvegarder
            const { reinitializeConnection } = await import("../../serial_backend.js");
            reinitializeConnection();
            return { ok: false, reason: "refus", index: i, write: w, reply: refused };
        }
    }
    const saved = await saveAndReconnect();
    if (!saved.ok) {
        return { ok: false, reason: "save", reply: String(saved.error?.message ?? saved.error) };
    }
    rec.writes = [];
    rec.notReread = [];
    if (rec.simulee?.commandes?.length) {
        // la vraie carte est maintenant comme la carte simulée : nouveau départ
        rec.simulee.base = rec.simulee.baseApres ?? rec.simulee.base;
        rec.simulee.commandes = [];
    }
    rec.envoye = new Date().toISOString();
    saveBoard(rec);
    boardChanged();
    return { ok: true, count: writes.length };
}
