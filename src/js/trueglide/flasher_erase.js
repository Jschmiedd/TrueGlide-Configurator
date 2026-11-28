// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide (audit du 08/11/2026, essai TG-A1-7) : « Effacement complet de la puce » resté actif d'une utilisation
// précédente a effacé toute la configuration de la carte sans avertissement.
//  - le réglage n'est plus gardé d'une ouverture à l'autre : toujours « non » au départ ;
//  - s'il est actif, confirmation au moment de flasher ;
//  - après un flash avec effacement réussi et une sauvegarde automatique, la restauration est proposée.

// Valeur de départ du réglage : toujours non ; l'ancienne valeur mémorisée est effacée.
export function initialEraseChip(setConfig) {
    setConfig?.({ erase_chip: false });
    return false;
}

// Confirmation avant le flash quand l'effacement complet est actif. Rend true si le flash peut continuer.
export function confirmEraseBeforeFlash(eraseChip, ask) {
    if (!eraseChip) {
        return true;
    }
    return Boolean(ask?.());
}

// Proposer la restauration : flash réussi, fait avec effacement complet, sauvegarde automatique disponible.
export function shouldOfferRestore({ erased, resultClass, backup, restoreInProgress, restoreCompleted }) {
    return (
        Boolean(erased) &&
        resultClass === "valid" &&
        typeof backup === "string" &&
        backup !== "" &&
        !restoreInProgress &&
        !restoreCompleted
    );
}
