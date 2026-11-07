// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide (audit du 06/11/2026, mineur) : procédure failsafe « Tombe » (DROP, valeur 1) : moteurs coupés à la perte
// du signal. Confirmation quand elle vient d'être choisie (pas quand la carte l'avait déjà).
export const FAILSAFE_PROCEDURE_DROP = 1;
export function dropNeedsConfirm(loaded, chosen) {
    return Number(chosen) === FAILSAFE_PROCEDURE_DROP && Number(loaded) !== FAILSAFE_PROCEDURE_DROP;
}
