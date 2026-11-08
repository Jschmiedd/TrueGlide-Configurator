// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : onglet ESC. Il affiche TrueGlide ESC Configurator (logiciel public séparé, licence AGPL v3) dans une
// version figée, sans fusionner le code. Une seule connexion USB à la fois : le Configurator se déconnecte de la carte
// en entrant dans l'onglet, et demande à l'onglet de libérer le port avant d'en sortir (refusé pendant un flash).

// Version figée de la page de TrueGlide ESC Configurator (dépôt Jschmiedd/TrueGlide-ESC-Configurator) : v17
// (0.33.0-dev · v17 = master d938d8b, ESC gh-pages f128a10 ; nouvelle adresse, v16 laissée telle quelle). Corrections de l'audit du 07/11/2026 (valeurs par
// défaut confirmées et sauvegardées, moteurs arrêtés page cachée, firmwares non validés confirmés, AM32 sans nom
// refusé). Vérifiée en ligne et OUI de l'audit indépendant (08/11/2026).
export const ESC_TAB_URL = "https://jschmiedd.github.io/TrueGlide-ESC-Configurator/onglet/v17/";
export const ESC_TAB_ORIGIN = new URL(ESC_TAB_URL).origin;

const RELEASE_TIMEOUT_MS = 3000;

const state = { frame: null, connected: false, pending: null };

// Message venant de l'onglet ESC : { source: "trueglide-esc", event: "ready" | "connected" | "disconnected" | "busy" }.
// Retourne l'événement reconnu, ou null pour un message étranger (autre origine ou autre source).
export function readEscMessage(event, origin = ESC_TAB_ORIGIN) {
    if (!event || event.origin !== origin || !event.data || event.data.source !== "trueglide-esc") {
        return null;
    }
    const known = ["ready", "connected", "disconnected", "busy"];
    return known.includes(event.data.event) ? event.data.event : null;
}

function onMessage(event) {
    const what = readEscMessage(event);
    if (!what) {
        return;
    }
    if (what === "connected") {
        state.connected = true;
    } else if (what === "disconnected") {
        state.connected = false;
    }
    if (state.pending && (what === "disconnected" || what === "busy")) {
        const resolve = state.pending;
        state.pending = null;
        resolve(what);
    }
}

export function attachEscFrame(frame) {
    state.frame = frame;
    state.connected = false;
    globalThis.addEventListener?.("message", onMessage);
}

export function detachEscFrame() {
    globalThis.removeEventListener?.("message", onMessage);
    state.frame = null;
    state.connected = false;
    state.pending = null;
    releaseInFlight = null;
}

export function isEscTabHoldingPort() {
    return Boolean(state.frame && state.connected);
}

// Demande à l'onglet ESC de libérer le port USB. Résultat : "disconnected" (port libre), "busy" (lecture, écriture ou
// flash en cours : ne pas quitter), ou "timeout" (pas de réponse : l'onglet sera fermé, ce qui ferme son port).
// TrueGlide (audit du 07/11/2026, F7) : une seule demande à la fois. Un 2e clic reçoit la réponse de la 1re (avant, il
// l'écrasait : la 1re répondait « timeout » et l'onglet se fermait même pendant un flash qui avait répondu « busy »).
let releaseInFlight = null;
export function requestEscRelease(timeoutMs = RELEASE_TIMEOUT_MS) {
    if (!isEscTabHoldingPort()) {
        return Promise.resolve("disconnected");
    }
    if (releaseInFlight) {
        return releaseInFlight;
    }
    releaseInFlight = new Promise((resolve) => {
        const finish = (what) => {
            releaseInFlight = null;
            resolve(what);
        };
        const timer = setTimeout(() => {
            state.pending = null;
            finish("timeout");
        }, timeoutMs);
        state.pending = (what) => {
            clearTimeout(timer);
            finish(what);
        };
        state.frame.contentWindow.postMessage(
            { source: "trueglide-configurator", command: "disconnect" },
            ESC_TAB_ORIGIN,
        );
    });
    return releaseInFlight;
}
