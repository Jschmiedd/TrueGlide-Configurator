// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : récolte d'une carte branchée. Le logiciel ouvre chacun de ses onglets tout seul (il demande alors à la
// carte tout ce qu'il affiche), puis lit « diff all » et « dump all ». Tout ce que la carte a répondu depuis la
// connexion est gardé : hors ligne, la carte hors ligne rendra ces réponses. Rien n'est écrit dans la carte.

import GUI from "../../gui.js";
import FC from "../../fc.js";
import { serial } from "../../serial.js";
import { switchTab } from "../../tab_switch.js";
import { sidebarItems } from "../../../components/sidebar/sidebar_items.js";
import { send } from "../../../composables/useMspCliSession.js";
import { saveBoard } from "./store.js";
import { harvestTabs } from "./harvest_tabs.js";
import { boardChanged, offlineState } from "./harvest_state.js";

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Nombre de réponses différentes déjà récoltées.
function harvested() {
    const d = serial.recorder?.data;
    return d ? Object.keys(d.msp).length + Object.keys(d.unsupported).length + Object.keys(d.cli).length : 0;
}

// Attend que l'onglet soit affiché, puis qu'aucune réponse nouvelle n'arrive pendant un moment. Les demandes
// répétées en continu (état, capteurs) ne comptent pas : seules les réponses jamais vues relancent l'attente.
async function settle({ quietMs = 1200, minMs = 1500, maxMs = 10000 } = {}) {
    const start = Date.now();
    let count = harvested();
    let quietSince = Date.now();
    while (Date.now() - start < maxMs) {
        await wait(100);
        const n = harvested();
        if (GUI.tab_switch_in_progress || n !== count) {
            count = n;
            quietSince = Date.now();
        } else if (Date.now() - start >= minMs && Date.now() - quietSince >= quietMs) {
            return;
        }
    }
}

export function boardIdentity(config = FC.CONFIG) {
    return {
        nom: config.boardName || config.targetName || "",
        cible: config.targetName || "",
        fabricant: config.manufacturerId || "",
        uid: Array.isArray(config.uid) ? config.uid.map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("") : "",
        firmware: `${config.flightControllerIdentifier || ""} ${config.flightControllerVersion || ""}`.trim(),
    };
}

// Récolte de la carte branchée ; l'avancement est dans offlineState. Rend la récolte (déjà gardée dans ce navigateur).
export async function harvest() {
    if (offlineState.running) {
        return null;
    }
    Object.assign(offlineState, { running: true, step: 0, total: 0, tab: "", done: "", error: "" });
    try {
        if (!serial.recorder) {
            throw new Error("Pas de carte branchée à récolter.");
        }
        const tabs = harvestTabs(sidebarItems, GUI.allowedTabs);
        offlineState.total = tabs.length + 1;
        const startTab = GUI.active_tab;
        for (let i = 0; i < tabs.length; i++) {
            Object.assign(offlineState, { step: i + 1, tab: tabs[i].i18n });
            switchTab(tabs[i].tab, { mode: tabs[i].mode });
            await settle();
        }
        Object.assign(offlineState, { step: offlineState.total, tab: "tabCLI" });
        await send("diff all", { timeoutMs: 20000 });
        await send("dump all", { timeoutMs: 30000 });
        const recording = structuredClone(serial.recorder.data);
        recording.date = new Date().toISOString();
        recording.carte = boardIdentity();
        recording.writes = [];
        saveBoard(recording);
        offlineState.done = recording.carte.nom || "?";
        boardChanged();
        if (startTab) {
            switchTab(startTab, { mode: "connected" });
        }
        return recording;
    } catch (e) {
        offlineState.error = String(e?.message ?? e);
        return null;
    } finally {
        offlineState.running = false;
    }
}
