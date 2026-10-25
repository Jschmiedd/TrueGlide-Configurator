// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : identité de la carte (récolte et envoi des changements préparés hors ligne).

export function boardIdentity(config) {
    return {
        nom: config.boardName || config.targetName || "",
        cible: config.targetName || "",
        fabricant: config.manufacturerId || "",
        uid: Array.isArray(config.uid) ? config.uid.map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("") : "",
        firmware: `${config.flightControllerIdentifier || ""} ${config.flightControllerVersion || ""}`.trim(),
        api: config.apiVersion || "",
    };
}

// Les changements préparés ne partent que vers la carte récoltée (même numéro unique), avec le même firmware : les
// formats des messages dépendent de la version.
export function sameBoard(prepared, connected) {
    if (!prepared?.uid || prepared.uid !== connected.uid) {
        return { ok: false, reason: "carte" };
    }
    if (prepared.firmware !== connected.firmware || prepared.api !== connected.api) {
        return { ok: false, reason: "firmware" };
    }
    return { ok: true };
}
