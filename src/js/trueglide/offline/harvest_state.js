// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : état de la récolte et de la carte hors ligne, affiché par TrueGlideOfflineBar quel que soit l'onglet.

import { reactive } from "vue";

export const offlineState = reactive({
    running: false, // récolte en cours
    step: 0,
    total: 0,
    tab: "", // clé i18n de l'onglet en cours
    done: "", // nom de la carte récoltée (message affiché jusqu'à fermeture)
    error: "",
    sending: false, // envoi des changements préparés en cours
    sent: "", // résultat de l'envoi (affiché jusqu'à fermeture)
    sentOk: false,
    preparing: false, // préparation de la carte simulée (configuration récoltée chargée dans son firmware)
    version: 0, // change à chaque récolte ou écriture gardée : relire la carte hors ligne
});

export function boardChanged() {
    offlineState.version++;
    globalThis.dispatchEvent?.(new Event("trueglide-offline-changed"));
}
