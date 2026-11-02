// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : onglet Configuration, le modèle 3D monte avec les gaz (position du manche, pas une altitude).
// Affichage seulement : rien n'est envoyé à la carte.

export const THROTTLE_LOW_US = 1000;
export const THROTTLE_HIGH_US = 2000;
// lissage par lecture (environ 15 lectures par seconde) : le modèle suit le manche sans sauter
export const LIFT_SMOOTHING = 0.35;

/** Gaz en fraction 0 (en bas) à 1 (à fond) ; null si la valeur n'est pas un nombre (pas de lecture). */
export function throttleFraction(us) {
    const n = Number(us);
    if (!Number.isFinite(n) || n <= 0) {
        return null;
    }
    return Math.min(1, Math.max(0, (n - THROTTLE_LOW_US) / (THROTTLE_HIGH_US - THROTTLE_LOW_US)));
}

/** Hauteur affichée suivante : se rapproche de la cible ; sans lecture des gaz, le modèle redescend en bas. */
export function nextLift(previous, us, smoothing = LIFT_SMOOTHING) {
    const target = throttleFraction(us) ?? 0;
    const prev = Number.isFinite(previous) ? previous : target;
    const next = prev + (target - prev) * smoothing;
    return Math.abs(next - target) < 0.001 ? target : next;
}
