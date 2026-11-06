// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide (audit du 06/11/2026) : contrôle des écritures gardées par la carte hors ligne avant de les rejouer sur la
// vraie carte, et à l'ouverture d'un fichier carte. Seules des écritures de réglage passent : jamais une commande
// immédiate (moteurs, voies radio, redémarrage, enregistrement, étalonnage, passerelle, effacement…).

import { isSettingCommand } from "../cli_safety.js";
import { writeCodes } from "./board.js";

// Codes MSP de réglage acceptés : écritures, sans les commandes immédiates ni celles refusées hors ligne.
export function allowedWriteCodes(MSPCodes) {
    const c = writeCodes(MSPCodes);
    return new Set([...c.writes].filter((code) => !c.live.has(code) && !c.refused.has(code)));
}

// Première écriture interdite d'une liste ({ cli } ou { code, payload }), ou null.
export function forbiddenWrite(writes, MSPCodes) {
    const allowed = allowedWriteCodes(MSPCodes);
    for (const w of writes ?? []) {
        if (w?.cli !== undefined) {
            if (!isSettingCommand(w.cli)) {
                return w;
            }
        } else if (
            !allowed.has(Number(w?.code)) ||
            typeof w?.payload !== "string" ||
            !/^([0-9a-f]{2})*$/i.test(w.payload)
        ) {
            return w;
        }
    }
    return null;
}
