// TrueGlide (07/11/2026) : radio éteinte, le Tableau de bord affichait encore « Liaison radio 88 % » (dernière valeur
// RSSI gardée par le firmware). Signal perdu (failsafe) : liaison 0, affichée « — ».
import { describe, expect, it } from "vitest";
import { linkPercent } from "../../src/js/trueglide/dashboard.js";
import { isFailsafeActive, RX_FAILSAFE_BIT, FAILSAFE_BIT } from "../../src/stores/fc.js";

describe("liaison radio du Tableau de bord", () => {
    it("signal perdu (RX_FAILSAFE) : 0 même si le RSSI gardé vaut 900", () => {
        const flags = 1 << RX_FAILSAFE_BIT;
        expect(isFailsafeActive(flags)).toBe(true);
        expect(linkPercent(900, isFailsafeActive(flags))).toBe(0);
    });
    it("failsafe actif : 0", () => {
        expect(linkPercent(1023, isFailsafeActive(1 << FAILSAFE_BIT))).toBe(0);
    });
    it("radio allumée, pas de failsafe : le RSSI en %", () => {
        expect(linkPercent(900, isFailsafeActive(0))).toBe(88);
    });
});
