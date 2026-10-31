// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : unités métriques affichées à côté des pieds et des nœuds (onglet Plan de vol). Affichage seulement :
// les valeurs envoyées à la carte restent en pieds et en nœuds.

export const FEET_TO_METERS = 0.3048;
export const KNOTS_TO_KMH = 1.852;

function number(value) {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
        return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/** Mètres arrondis à l'unité, ou null si la valeur n'est pas un nombre. */
export function feetToMeters(feet) {
    const n = number(feet);
    return n === null ? null : Math.round(n * FEET_TO_METERS);
}

/** km/h arrondis à l'unité, ou null si la valeur n'est pas un nombre. */
export function knotsToKmh(knots) {
    const n = number(knots);
    return n === null ? null : Math.round(n * KNOTS_TO_KMH);
}

/** « 120 ft (37 m) » ; la valeur seule si elle n'est pas un nombre. */
export function formatFeet(feet) {
    const m = feetToMeters(feet);
    return m === null ? `${feet ?? ""} ft` : `${feet} ft (${m} m)`;
}

/** « 10 kts (19 km/h) » ; la valeur seule si elle n'est pas un nombre. */
export function formatKnots(knots) {
    const k = knotsToKmh(knots);
    return k === null ? `${knots ?? ""} kts` : `${knots} kts (${k} km/h)`;
}
