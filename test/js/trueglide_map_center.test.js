// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { flightPlanMapCenter, setFlightPlanMapCenter } from "../../src/js/trueglide/map_center.js";

describe("centre de la carte du plan de vol (point ajouté avec +)", () => {
    it("garde le centre arrondi au millionième", () => {
        setFlightPlanMapCenter(6.1432109, 46.2012345);
        expect(flightPlanMapCenter.value).toEqual({ latitude: 46.201235, longitude: 6.143211 });
    });
    it("ramène la longitude entre -180 et 180 après un tour du monde", () => {
        setFlightPlanMapCenter(6.14 + 360, 46.2);
        expect(flightPlanMapCenter.value.longitude).toBeCloseTo(6.14, 6);
        setFlightPlanMapCenter(-190, 10);
        expect(flightPlanMapCenter.value.longitude).toBeCloseTo(170, 6);
    });
    it("pas de centre si la valeur est inconnue", () => {
        setFlightPlanMapCenter(Number.NaN, 46);
        expect(flightPlanMapCenter.value).toBeNull();
    });
});
