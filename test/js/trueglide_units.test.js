// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { feetToMeters, formatFeet, formatKnots, knotsToKmh } from "../../src/js/trueglide/units.js";

describe("Plan de vol : mètres et km/h à côté des pieds et des nœuds", () => {
    it("convertit avec les facteurs exacts (1 ft = 0,3048 m ; 1 nœud = 1,852 km/h)", () => {
        expect(feetToMeters(120)).toBe(37); // 36,58 m
        expect(feetToMeters(400)).toBe(122); // 121,92 m
        expect(feetToMeters(0)).toBe(0);
        expect(feetToMeters(-30)).toBe(-9); // altitude sous le point de départ
        expect(knotsToKmh(10)).toBe(19); // 18,52 km/h
        expect(knotsToKmh(10.5)).toBe(19); // 19,45 km/h
        expect(knotsToKmh(27)).toBe(50); // 50,0 km/h
    });

    it("affiche les deux unités", () => {
        expect(formatFeet(120)).toBe("120 ft (37 m)");
        expect(formatKnots(10)).toBe("10 kts (19 km/h)");
    });

    it("n'invente pas de valeur quand il n'y a pas de nombre", () => {
        expect(feetToMeters(undefined)).toBe(null);
        expect(formatFeet(undefined)).toBe(" ft");
        expect(formatKnots("")).toBe(" kts");
        expect(knotsToKmh(null)).toBe(null);
    });
});
