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
        // profils actifs : les réglages PID et rates s'écrivent dans le profil actif de la carte
        profil: Number.isInteger(config.profile) ? config.profile : null,
        profilRate: Number.isInteger(config.rateProfile) ? config.rateProfile : null,
    };
}

// Les changements préparés ne partent que vers la carte récoltée (même numéro unique), avec le même firmware (les
// formats des messages dépendent de la version) et les mêmes profils actifs.
export function sameBoard(prepared, connected) {
    if (!prepared?.uid || prepared.uid !== connected.uid) {
        return { ok: false, reason: "carte" };
    }
    if (prepared.firmware !== connected.firmware || prepared.api !== connected.api) {
        return { ok: false, reason: "firmware" };
    }
    // profil inconnu (fichier ancien) ou changé depuis la récolte : les réglages iraient dans un autre profil
    if (
        !Number.isInteger(prepared.profil) ||
        !Number.isInteger(prepared.profilRate) ||
        prepared.profil !== connected.profil ||
        prepared.profilRate !== connected.profilRate
    ) {
        return { ok: false, reason: "profil" };
    }
    return { ok: true };
}
