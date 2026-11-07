// TrueGlide (audit indépendant du 07/11/2026) : rxfail et PID dans la question « réglages à risque ».
import { describe, expect, it } from "vitest";
import { riskyChanges, pidChangeIsLarge, RISKY_MSP_NAMES } from "../../src/js/trueglide/write_guard.js";

const avant = ["# master", "set p_roll = 58", "set d_roll = 52", "set i_yaw = 90", "rxfail 3 h"];

describe("réglages à risque : rxfail et PID", () => {
    it("rxfail déclenche la question, avec la ligne d'avant", () => {
        expect(riskyChanges(["rxfail 3 s 1500"], avant)).toEqual([
            { command: "rxfail 3 s 1500", before: "rxfail 3 h" },
        ]);
    });
    it("un PID fortement changé la déclenche, avec la valeur d'avant", () => {
        expect(riskyChanges(["set p_roll = 200"], avant)).toEqual([
            { command: "set p_roll = 200", before: "set p_roll = 58" },
        ]);
        expect(riskyChanges(["set d_roll = 20"], avant)).toHaveLength(1); // -62 %
    });
    it("un petit écart (réglage fin) ne la déclenche pas", () => {
        expect(riskyChanges(["set p_roll = 62", "set d_roll = 48", "set i_yaw = 100"], avant)).toEqual([]);
    });
    it("PID sans valeur d'avant : question seulement hors de la plage habituelle", () => {
        expect(riskyChanges(["set f_roll = 120"], avant)).toEqual([]);
        expect(riskyChanges(["set f_roll = 220"], avant)).toHaveLength(1);
    });
    it("seuils", () => {
        expect(pidChangeIsLarge(58, 87)).toBe(false); // +50 % pile
        expect(pidChangeIsLarge(58, 88)).toBe(true);
        expect(pidChangeIsLarge(58, 28)).toBe(true);
    });
    it("rxfail par un onglet (MSP_SET_RXFAIL_CONFIG) compte comme écriture à risque", () => {
        expect(RISKY_MSP_NAMES).toContain("MSP_SET_RXFAIL_CONFIG");
    });
});

describe("onglet PID (MSP_SET_PID, carte hors ligne)", () => {
    it("P de roulis passé de 58 à 200 : question ; petits écarts : rien", async () => {
        const { pidMspRisky } = await import("../../src/js/trueglide/write_guard.js");
        const backup = ["set p_roll = 58", "set i_roll = 85", "set d_roll = 52", "set p_pitch = 58"];
        const octets = [200, 85, 52, 60, 85, 54, 55, 90, 0];
        expect(pidMspRisky(octets, backup)).toEqual([
            { command: "set p_roll = 200 (onglet PID)", before: "set p_roll = 58" },
        ]);
        expect(pidMspRisky([60, 85, 50, 58, 85, 52, 55, 90, 0], backup)).toEqual([]);
    });
});
