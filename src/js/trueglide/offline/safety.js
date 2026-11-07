// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide (audit du 06/11/2026) : contrôle des écritures gardées par la carte hors ligne avant de les rejouer sur la
// vraie carte, et à l'ouverture d'un fichier carte. Seules des écritures de réglage passent : jamais une commande
// immédiate (moteurs, voies radio, redémarrage, enregistrement, étalonnage, passerelle, effacement…).

import { isSettingCommand } from "../cli_safety.js";
import { writeCodes } from "./board.js";

// Codes MSP de réglage acceptés : écritures, sans les commandes immédiates ni celles refusées hors ligne.
// TrueGlide (audit du 07/11/2026, F4) : codes immédiats ou permanents refusés par NUMÉRO, quel que soit leur nom
// dans MSPCodes (un nom faux laissait passer le 245, passerelle ESC) : 68 redémarrage, 72 effacement de la mémoire de
// vol, 99 armement bloqué/débloqué, 200 voies radio, 201 GPS, 205 et 206 étalonnages, 209 point de passage,
// 210 changement de profil, 211 cap, 214 moteurs, 245 passerelle ESC, 246 horloge, 248 identité de la carte,
// 249 signature, 250 enregistrement.
export const FORBIDDEN_CODE_NUMBERS = new Set([
    68, 72, 99, 200, 201, 205, 206, 209, 210, 211, 214, 245, 246, 248, 249, 250,
]);

export function allowedWriteCodes(MSPCodes) {
    const c = writeCodes(MSPCodes);
    return new Set(
        [...c.writes].filter(
            (code) => !c.live.has(code) && !c.refused.has(code) && !FORBIDDEN_CODE_NUMBERS.has(Number(code)),
        ),
    );
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
