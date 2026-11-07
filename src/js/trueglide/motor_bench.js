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
 *  - 3D en PWM / OneShot / Multishot : 3d_neutral tel quel (relecture du 07/11/2026 : le firmware garde la valeur
 *    brute, pwm_output.c ; la ramener à 1500 ferait tourner un ESC 3D calibré sur ce neutre).
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
    return neutral3d;
}

/**
 * Arrêt des moteurs tel que la carte l'applique EN CE MOMENT (essai TG-A1-5 et relecture du 07/11/2026).
 * Moteurs à l'arrêt, MSP_MOTOR renvoie la valeur d'arrêt convertie avec le mode 3D en marche (dshot.c,
 * dshotConvertToExternal : 1000 sans 3D, 1500 en 3D ; en PWM la sortie brute : mincommand, ou 3d_neutral en 3D).
 * C'est la seule source sûre : la configuration lue (MSP_FEATURE_CONFIG) peut différer de ce qui tourne (enregistrement
 * interrompu). Toute réponse douteuse (moteurs pas tous égaux, valeur inconnue) donne null : le test moteurs est refusé.
 * @param {number[]} values MSP_MOTOR (0 = sortie inutilisée)
 * @param {{ digital: boolean, mincommand: number, neutral3d: number }} p
 * @returns {{ stop: number, is3d: boolean } | null}
 */
export function boardStopFromReadback(values, { digital, mincommand, neutral3d }) {
    const used = (values ?? []).filter((v) => Number.isFinite(v) && v > 0);
    if (used.length === 0 || used.some((v) => v !== used[0])) {
        return null;
    }
    const v = used[0];
    if (digital) {
        if (v === 1000) {
            return { stop: 1000, is3d: false };
        }
        if (v === 1500) {
            return { stop: 1500, is3d: true };
        }
        return null;
    }
    if (mincommand === neutral3d) {
        return null; // impossible de savoir si le 3D est en marche
    }
    if (v === mincommand) {
        return { stop: v, is3d: false };
    }
    if (v === neutral3d) {
        return { stop: v, is3d: true };
    }
    return null;
}

// TrueGlide (2e relecture indépendante du 07/11/2026, point 3) : délai entre les deux relectures d'arrêt.
export const READBACK_GAP_MS = 150;

/**
 * Relecture SÛRE de l'arrêt des moteurs de la carte, avant tout envoi MSP_SET_MOTOR.
 * Une seule relecture MSP_MOTOR est ambiguë : un moteur qui tourne à 1500 sur une carte sans 3D ressemble à l'arrêt
 * 3D, et un moteur à 1000 sur une carte en 3D (marche arrière à fond) ressemble à l'arrêt sans 3D ; une réponse
 * peut aussi venir d'une demande déjà en file (dédoublonnage MSP). Donc :
 *  - refus si la carte est armée (avant et après) ;
 *  - deux relectures séparées de gapMs, identiques ;
 *  - le mode 3D relu doit être celui de la configuration de la carte (is3dConfigured), sinon refus ;
 *  - refus si un moteur a des tours (télémesure), quand elle existe.
 * @param {{
 *   readMotors: () => Promise<number[]>, readArmed: () => Promise<boolean>, readRpm?: () => Promise<number[]|null>,
 *   digital: boolean, mincommand: number, neutral3d: number, is3dConfigured: boolean,
 *   wait: (ms: number) => Promise<void>, gapMs?: number
 * }} p
 * @returns {Promise<{ stop: number, is3d: boolean } | null>}
 */
export async function readBoardStop({
    readMotors,
    readArmed,
    readRpm,
    digital,
    mincommand,
    neutral3d,
    is3dConfigured,
    wait,
    gapMs = READBACK_GAP_MS,
}) {
    const opts = { digital, mincommand, neutral3d };
    const once = async () => {
        if (await readArmed()) {
            return null;
        }
        const state = boardStopFromReadback(await readMotors(), opts);
        if (!state || state.is3d !== !!is3dConfigured) {
            return null;
        }
        if (readRpm) {
            const rpm = await readRpm();
            if (Array.isArray(rpm) && rpm.some((r) => Number.isFinite(r) && r > 0)) {
                return null;
            }
        }
        return state;
    };
    try {
        const first = await once();
        if (!first) {
            return null;
        }
        await wait(gapMs);
        const second = await once();
        if (!second || second.stop !== first.stop || second.is3d !== first.is3d) {
            return null;
        }
        return second;
    } catch {
        return null;
    }
}
