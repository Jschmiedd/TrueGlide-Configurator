// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nextLift, throttleFraction } from "../../src/js/trueglide/model_lift.js";

describe("Configuration : le modèle 3D monte avec les gaz", () => {
    it("gaz en fraction, bornée entre 0 et 1", () => {
        expect(throttleFraction(1000)).toBe(0);
        expect(throttleFraction(1500)).toBe(0.5);
        expect(throttleFraction(2000)).toBe(1);
        expect(throttleFraction(885)).toBe(0); // fin de course basse de certaines radios
        expect(throttleFraction(2115)).toBe(1);
        expect(throttleFraction(undefined)).toBe(null); // pas de lecture
        expect(throttleFraction(0)).toBe(null);
    });

    it("la hauteur rejoint le manche progressivement, sans dépasser", () => {
        let lift = nextLift(null, 1000);
        expect(lift).toBe(0);
        const steps = [];
        for (let i = 0; i < 30; i++) {
            lift = nextLift(lift, 2000);
            steps.push(lift);
        }
        expect(steps[0]).toBeGreaterThan(0);
        expect(steps[0]).toBeLessThan(0.5); // pas de saut d'un coup
        expect(steps.every((v, i) => i === 0 || v >= steps[i - 1])).toBe(true);
        expect(lift).toBe(1); // arrivé en haut
    });

    it("sans lecture des gaz, le modèle redescend en bas", () => {
        let lift = 1;
        for (let i = 0; i < 30; i++) {
            lift = nextLift(lift, undefined);
        }
        expect(lift).toBe(0);
    });
});
