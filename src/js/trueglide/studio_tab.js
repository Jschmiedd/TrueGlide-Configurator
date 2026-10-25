// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : onglet Studio. Il affiche TrueGlide Studio (page publiée avec le site TrueGlide), qui prépare un drone
// sans la carte. Carte branchée, le bouton « Lire la configuration de la carte » lit son « diff all » par le CLI sur
// MSP et le donne à Studio. Rien n'est jamais écrit dans la carte depuis cet onglet : les commandes de Studio se
// collent dans l'onglet CLI.

export const STUDIO_TAB_URL = "https://jschmiedd.github.io/TrueGlide-Configurator/studio/";
export const STUDIO_TAB_ORIGIN = new URL(STUDIO_TAB_URL).origin;

// Message venant de Studio : { source: "trueglide-studio", event: "ready" }. Retourne l'événement, ou null pour un
// message étranger (autre origine ou autre source).
export function readStudioMessage(event, origin = STUDIO_TAB_ORIGIN) {
    if (!event || event.origin !== origin || !event.data || event.data.source !== "trueglide-studio") {
        return null;
    }
    return typeof event.data.event === "string" ? event.data.event : null;
}

// Message qui donne à Studio la configuration lue sur la carte (lignes renvoyées par « diff all »).
export function configurationMessage(lines) {
    const texte = (Array.isArray(lines) ? lines : []).map((line) => String(line).replace(/\r$/, "")).join("\n");
    return { source: "trueglide-configurator", command: "configuration", texte };
}

// Une réponse de « diff all » utilisable : au moins une ligne de réglage, sans erreur du CLI.
export function isUsableDiff(lines) {
    if (!Array.isArray(lines) || lines.some((line) => String(line).startsWith("###ERROR"))) {
        return false;
    }
    return lines.some((line) => /^\s*(set|board_name|serial|resource|feature)\s/.test(String(line)));
}
