// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
import { describe, expect, it } from "vitest";
import {
    SETUP_STEPS,
    armingBlockers,
    armingFlagNames,
    batteryInfo,
    progressKey,
    progressSummary,
    rssiPercent,
    stepIndex,
    trueglideStatus,
} from "../../src/js/trueglide/dashboard";

describe("TrueGlide dashboard helpers", () => {
    it("names arming flags in the firmware order for each API version", () => {
        // firmware runtime_config.h: ..., RESC (19), DSHOT_TELEM (20), ..., MOTOR_PROTOCOL (24), CRASHFLIP, ALTHOLD,
        // POSHOLD, AUTOPILOT (28)
        const n48 = armingFlagNames("1.48.0");
        expect(n48[7]).toBe("THROTTLE");
        expect(n48[20]).toBe("DSHOT_TELEM");
        expect(n48.slice(24)).toEqual(["MOTOR_PROTOCOL", "CRASHFLIP", "ALTHOLD", "POSHOLD", "AUTOPILOT"]);
        expect(armingFlagNames("1.45.0")[20]).toBe("RPMFILTER");
        expect(armingFlagNames("1.47.0")).not.toContain("AUTOPILOT");
    });

    it("lists what blocks arming, without the arm switch bit", () => {
        const count = 30; // 29 named flags + ARM_SWITCH
        const mask = (1 << 2) | (1 << 8) | (1 << 29); // RX_FAILSAFE, ANGLE, ARM_SWITCH
        expect(armingBlockers("1.48.0", count, mask)).toEqual(["RX_FAILSAFE", "ANGLE"]);
        expect(armingBlockers("1.48.0", count, 0)).toEqual([]);
    });

    it("names the TrueGlide low-battery reason (one more bit before ARM_SWITCH)", () => {
        const count = 31; // TrueGlide: 29 flags + LOW_BATTERY + ARM_SWITCH
        expect(armingFlagNames("1.48.0", count)[29]).toBe("LOW_BATTERY");
        expect(armingBlockers("1.48.0", count, (1 << 29) | (1 << 30))).toEqual(["LOW_BATTERY"]);
        expect(armingFlagNames("1.48.0", 30)).not.toContain("LOW_BATTERY"); // plain Betaflight
    });

    it("never shows a voltage that was not measured", () => {
        expect(batteryInfo(0, 0)).toEqual({ measured: false });
        expect(batteryInfo(24.6, 6)).toEqual({ measured: true, voltage: 24.6, cells: 6, perCell: 4.1 });
        expect(batteryInfo(12.4, 0)).toEqual({ measured: true, voltage: 12.4, cells: 0 });
        expect(rssiPercent(1023)).toBe(100);
        expect(rssiPercent(0)).toBe(0);
    });

    it("reads the TrueGlide features from the CLI values, leaving out the missing ones", () => {
        const s = trueglideStatus(
            {
                power_guard_esc_temp: "100",
                power_guard_current: "0",
                motor_desync_recovery: "ON",
                speeder_cruise_angle: "60",
            },
            [39, 40, 255, 255],
        );
        expect(s).toEqual([
            { key: "power_guard", on: true, detail: "100 °C" },
            { key: "motor_health", on: true, detail: "" },
            { key: "speeder", on: null, detail: "60°" },
            { key: "pinio", on: true, detail: "PINIO2 → USER1" },
        ]);
        expect(trueglideStatus({ power_guard_esc_temp: "0", power_guard_current: "0" }, [])).toEqual([
            { key: "power_guard", on: false, detail: "" },
        ]);
        // a PINIO tied to arming (SpeedyBee Bluetooth) is not shown as switched
        expect(trueglideStatus({}, [0, 255, 255, 255])).toEqual([{ key: "pinio", on: false, detail: "" }]);
    });

    it("follows the guided setup steps", () => {
        expect(SETUP_STEPS.map((s) => s.tab)).toEqual([
            "setup",
            "ports",
            "configuration",
            "receiver",
            "auxiliary",
            "power",
            "motors",
            "failsafe",
            "tf_protections",
        ]);
        expect(stepIndex("power")).toBe(5);
        expect(stepIndex("pid_tuning")).toBe(-1);
        const p = progressSummary({ setup: true, ports: true, receiver: true });
        expect(p.count).toBe(3);
        expect(p.total).toBe(9);
        expect(p.next.tab).toBe("configuration");
        expect(progressSummary(Object.fromEntries(SETUP_STEPS.map((s) => [s.tab, true]))).next).toBe(null);
        expect(progressKey("TMOTORVELOXF7SE", [255, 16, 1])).toBe("tf-setup-TMOTORVELOXF7SE-000000ff0000001000000001");
    });
});
