import { describe, expect, it } from "vitest";
import { backupFileName, compareDiffs, looksLost, settingLines } from "../../src/js/trueglide/write_guard.js";

// Audit du 06/11/2026, constats 4 à 6 : sauvegarde, comparaison, configuration perdue.
const diff = (extra = []) => [
    "# diff all",
    "# version",
    "board_name SPEEDYBEEF405MINI",
    "batch start",
    "serial UART2 64 115200 57600 0 115200",
    "aux 0 0 0 1700 2100 0 0",
    "feature GPS",
    "set p_roll = 45",
    "set craft_name = Mini",
    "set motor_poles = 14",
    "set dshot_bidir = ON",
    "set vbat_min_cell_voltage = 340",
    "set gyro_lpf1_static_hz = 0",
    "set dyn_notch_count = 1",
    "set rpm_filter_q = 800",
    ...extra,
    "save",
];

describe("write_guard", () => {
    it("ignore commentaires et identité", () => {
        expect(settingLines(diff())).not.toContain("board_name SPEEDYBEEF405MINI");
        expect(settingLines(diff())).toContain("set p_roll = 45");
    });
    it("trouve les changements depuis la récolte", () => {
        const c = compareDiffs(diff(), diff(["set d_roll = 30"]));
        expect(c.added).toEqual(["set d_roll = 30"]);
        expect(c.missing).toEqual([]);
        expect(compareDiffs(diff(), diff())).toEqual({ missing: [], added: [] });
    });
    it("repère une carte revenue aux réglages d'usine", () => {
        expect(looksLost(diff(), diff())).toBe(false);
        expect(looksLost(diff(), ["# diff all", "board_name X", "set a = 1"])).toBe(true);
        expect(looksLost(diff(), ["###ERROR"])).toBe(true);
    });
    it("nomme le fichier de sauvegarde", () => {
        expect(backupFileName("Mini Pouce", new Date("2026-11-06T18:30:05Z"))).toBe(
            "Mini_Pouce_sauvegarde_avant_envoi_2026-11-06-18-30-05.txt",
        );
    });
});
