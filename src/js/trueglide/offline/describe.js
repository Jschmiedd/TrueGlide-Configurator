// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : ce qui partira vers la vraie carte, lisible avant de confirmer l'envoi des changements préparés.
//  - carte simulée : les commandes du CLI (écart entre les « dump all ») ;
//  - carte hors ligne qui rejoue la récolte : les écritures MSP, par leur nom.

const MAX_LIGNES = 40;
const PROFIL = /^(profile|rateprofile)\s+(\d+)$/;

/**
 * @returns {{ lignes: string[], reste: number, profils: { pid: number|null, rates: number|null } | null }}
 * profils : profils actifs de la vraie carte après l'envoi (numérotés à partir de 1 comme dans le logiciel), quand
 * les commandes en changent ; null sinon.
 */
export function describePrepared(rec, MSPCodes) {
    const commandes = rec?.simulee?.commandes ?? [];
    let tout;
    let profils = null;
    if (commandes.length) {
        tout = [...commandes];
        // profil actif à la fin : la dernière sélection de chaque sorte
        let pid = null;
        let rates = null;
        for (const c of commandes) {
            const m = PROFIL.exec(c.trim());
            if (m) {
                if (m[1] === "profile") {
                    pid = Number(m[2]);
                } else {
                    rates = Number(m[2]);
                }
            }
        }
        const avant = rec?.carte ?? {};
        const pidChange = pid !== null && Number.isInteger(avant.profil) && pid !== avant.profil;
        const ratesChange = rates !== null && Number.isInteger(avant.profilRate) && rates !== avant.profilRate;
        if (pidChange || ratesChange) {
            profils = { pid: pidChange ? pid + 1 : null, rates: ratesChange ? rates + 1 : null };
        }
    } else {
        const noms = Object.fromEntries(Object.entries(MSPCodes ?? {}).map(([k, v]) => [v, k]));
        tout = (rec?.writes ?? []).map((w) => (w.cli !== undefined ? w.cli : (noms[w.code] ?? `MSP ${w.code}`)));
    }
    return { lignes: tout.slice(0, MAX_LIGNES), reste: Math.max(0, tout.length - MAX_LIGNES), profils };
}
