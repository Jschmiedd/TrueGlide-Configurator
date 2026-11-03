// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { benchRange } from "../../src/js/trueglide/motor_bench.js";

describe("limite du test des moteurs au banc", () => {
    it("DShot : 1000 à 1300 (30 % des gaz), comme l'onglet ESC", () => {
        expect(benchRange({ min: 1000, max: 2000, zero: 1000, is3d: false, limited: true })).toEqual({ min: 1000, max: 1300 });
    });
    it("3D : 1350 à 1650 autour du neutre 1500", () => {
        expect(benchRange({ min: 1000, max: 2000, zero: 1500, is3d: true, limited: true })).toEqual({ min: 1350, max: 1650 });
    });
    it("limite levée : toute la plage, comme Betaflight", () => {
        expect(benchRange({ min: 1000, max: 2000, zero: 1000, is3d: false, limited: false })).toEqual({ min: 1000, max: 2000 });
    });
    it("protocole analogique : 30 % entre mincommand et maxthrottle", () => {
        expect(benchRange({ min: 1000, max: 1850, zero: 1000, is3d: false, limited: true })).toEqual({ min: 1000, max: 1255 });
    });
});
