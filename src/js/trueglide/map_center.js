// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : centre actuel de la carte du plan de vol. Un point ajouté avec le bouton « + » part de là, et non de
// 0°, 0° (en pleine mer : la carte satellite y reste blanche).
import { ref } from "vue";

/** { latitude, longitude } arrondis au millionième, ou null tant que la carte n'est pas centrée sur un lieu. */
export const flightPlanMapCenter = ref(null);

export function setFlightPlanMapCenter(longitude, latitude) {
    // la carte se répète d'ouest en est : longitude ramenée entre -180 et 180
    longitude = ((((longitude + 180) % 360) + 360) % 360) - 180;
    const r = (v) => Math.round(v * 1e6) / 1e6;
    flightPlanMapCenter.value = Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude: r(latitude), longitude: r(longitude) } : null;
}
