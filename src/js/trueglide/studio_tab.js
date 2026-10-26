// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : onglet Studio. Il affiche TrueGlide Studio, livré avec le logiciel (dossier studio/, copié depuis le
// dépôt du firmware par scripts/sync-trueglide-studio.mjs), qui prépare un drone sans la carte. Carte branchée :
//  - « Lire la configuration de la carte » lit son « diff all » par le CLI sur MSP et le donne à Studio ;
//  - Studio peut demander l'envoi d'un bloc de commandes : après confirmation, elles partent une par une ; à la
//    première refusée, rien n'est enregistré (la carte redémarre sans sauvegarder) ; sinon « save ».
// Avec la carte hors ligne, Studio n'envoie rien : on règle alors avec les onglets du logiciel.

// Page de Studio livrée avec le logiciel, à côté de index.html
export function studioTabUrl(base = globalThis.location?.href ?? "http://localhost/") {
    return new URL("studio/index.html", base).href;
}

export function studioOrigin(base = globalThis.location?.href ?? "http://localhost/") {
    return new URL(base).origin;
}

// Message venant de Studio : { source: "trueglide-studio", event: "ready" } ou
// { source: "trueglide-studio", command: "envoyer", id, texte }. Rend le message, ou null pour un message étranger.
export function readStudioMessage(event, origin = studioOrigin()) {
    if (!event || event.origin !== origin || !event.data || event.data.source !== "trueglide-studio") {
        return null;
    }
    const d = event.data;
    if (d.command === "envoyer") {
        return typeof d.texte === "string" ? { command: "envoyer", id: String(d.id ?? ""), texte: d.texte } : null;
    }
    return typeof d.event === "string" ? { event: d.event } : null;
}

// Message qui donne à Studio la configuration lue sur la carte (lignes renvoyées par « diff all »).
export function configurationMessage(lines) {
    const texte = (Array.isArray(lines) ? lines : []).map((line) => String(line).replace(/\r$/, "")).join("\n");
    return { source: "trueglide-configurator", command: "configuration", texte };
}

// État de la connexion, pour que Studio montre ou cache son bouton d'envoi.
export function stateMessage({ connected, offline, board }) {
    return {
        source: "trueglide-configurator",
        command: "etat",
        connecte: !!connected,
        horsLigne: !!offline,
        carte: board ?? "",
    };
}

export function resultMessage(id, ok, message) {
    return { source: "trueglide-configurator", command: "resultat", id, ok: !!ok, message: String(message ?? "") };
}

// Une réponse de « diff all » utilisable : au moins une ligne de réglage, sans erreur du CLI.
export function isUsableDiff(lines) {
    if (!Array.isArray(lines) || lines.some((line) => String(line).startsWith("###ERROR"))) {
        return false;
    }
    return lines.some((line) => /^\s*(set|board_name|serial|resource|feature)\s/.test(String(line)));
}

// Commandes à envoyer : sans commentaires ni lignes vides, jamais « save », « exit » ni « defaults » (l'enregistrement
// est fait à la fin, l'effacement jamais).
export function commandsToSend(texte) {
    return String(texte ?? "")
        .replace(/\r/g, "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && !/^(save|exit|defaults)\b/i.test(l));
}

// Réponse du CLI qui refuse la commande (mêmes contrôles que l'onglet Protections).
export function cliRefused(lines) {
    return (lines ?? []).find((l) => /^###ERROR/.test(l) || /Invalid|out of range|Unknown command/i.test(l)) ?? null;
}
