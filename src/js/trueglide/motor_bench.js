// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : limite de sécurité du test des moteurs au banc (onglet Moteurs), comme l'onglet ESC : les curseurs ne
// vont qu'à une part des gaz. Seulement dans le logiciel : le firmware et le vol ne changent pas.

export const BENCH_FRACTION = 0.3;

/**
 * Plage des curseurs du test moteurs.
 * @param {{ min: number, max: number, zero: number, is3d: boolean, limited: boolean, fraction?: number }} p
 *   min / max : plage complète (DShot 1000 à 2000) ; zero : arrêt (1000, ou le neutre en 3D)
 * @returns {{ min: number, max: number }}
 */
export function benchRange({ min, max, zero, is3d, limited, fraction = BENCH_FRACTION }) {
    if (!limited) {
        return { min, max };
    }
    if (is3d) {
        // de part et d'autre du neutre : la même part dans chaque sens (1500 : 1350 à 1650)
        return {
            min: Math.round(zero - (zero - min) * fraction),
            max: Math.round(zero + (max - zero) * fraction),
        };
    }
    return { min, max: Math.round(min + (max - min) * fraction) };
}

/**
 * Valeur qui ARRÊTE les moteurs dans l'onglet Moteurs (audit du 06/11/2026, contre-audit N2).
 *  - sans 3D : 1000 en DShot (commande d'arrêt), sinon mincommand ;
 *  - 3D en DShot : 1500 exactement. Le firmware ne donne la commande d'arrêt DShot qu'à 1500 (dshot.c,
 *    dshotConvertFromExternal) ; 3d_neutral (1460 par défaut) ferait tourner lentement en marche arrière ;
 *  - 3D en PWM / OneShot / Multishot : 3d_neutral (hors de 1425-1575 : 1500, comme Betaflight).
 * @param {{ is3d: boolean, digital: boolean, mincommand: number, neutral3d: number }} p
 * @returns {number}
 */
export function motorStopValue({ is3d, digital, mincommand, neutral3d }) {
    if (!is3d) {
        return digital ? 1000 : mincommand;
    }
    if (digital) {
        return 1500;
    }
    return neutral3d > 1575 || neutral3d < 1425 ? 1500 : neutral3d;
}
