// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
import { describe, expect, it } from "vitest";
import {
    ALL_SETTINGS,
    changeCommands,
    parseGet,
    toDisplay,
    toRaw,
    validate,
} from "../../src/js/trueglide/settings";

describe("TrueGlide settings", () => {
    it("reads the CLI 'get' output of the firmware", () => {
        const lines = [
            "power_guard_esc_temp = 0",
            "Allowed range: 0 - 150",
            "",
            "power_guard_current = 0",
            "Allowed range: 0 - 1000",
            "motor_desync_recovery = OFF",
            "Allowed values: OFF, ON",
        ];
        expect(parseGet(lines)).toEqual({ power_guard_esc_temp: "0", power_guard_current: "0", motor_desync_recovery: "OFF" });
    });

    it("sends only what changed", () => {
        const original = { power_guard_esc_temp: "0", motor_desync_recovery: "OFF", speeder_cruise_angle: "60" };
        const edited = { power_guard_esc_temp: 100, motor_desync_recovery: "ON", speeder_cruise_angle: 60 };
        expect(changeCommands(original, edited)).toEqual({
            commands: ["set power_guard_esc_temp = 100", "set motor_desync_recovery = ON"],
            errors: [],
        });
    });

    it("refuses out-of-range values instead of clamping them", () => {
        const { commands, errors } = changeCommands({ speeder_cruise_angle: "60" }, { speeder_cruise_angle: 85 });
        expect(commands).toEqual([]);
        expect(errors).toEqual(["speeder_cruise_angle"]);
    });

    it("refuses an emptied number field instead of sending 0", () => {
        for (const empty of [null, undefined, ""]) {
            const { commands, errors } = changeCommands({ power_guard_current: "60" }, { power_guard_current: empty });
            expect(commands).toEqual([]);
            expect(errors).toEqual(["power_guard_current"]);
        }
    });

    it("ignores settings the firmware does not have (TrueGlide STANDARD has no mission settings)", () => {
        expect(changeCommands({}, { mav_mission_home_item: "ON" }).commands).toEqual([]);
    });

    it("knows the firmware ranges", () => {
        const byName = Object.fromEntries(ALL_SETTINGS.map((s) => [s.name, s]));
        expect(validate(byName.power_guard_min_throttle, 19)).toBe(false);
        expect(validate(byName.power_guard_min_throttle, 20)).toBe(true);
        expect(validate(byName.motor_desync_threshold, 80)).toBe(true);
        expect(validate(byName.motor_desync_threshold, 81)).toBe(false);
        expect(validate(byName.dshot_telemetry_fallback, "MAYBE")).toBe(false);
    });
});

describe("TrueGlide navigation safety", () => {
    it("shows cm/s as m/s and writes cm/s back", async () => {
        const { toDisplay, toRaw } = await import("../../src/js/trueglide/settings");
        const vitesse = ALL_SETTINGS.find((s) => s.name === "ap_max_velocity");
        expect(toDisplay(vitesse, "500")).toBe(5);
        expect(toRaw(vitesse, 7.5)).toBe("750");
        expect(changeCommands({ ap_max_velocity: "500" }, { ap_max_velocity: 8 }).commands).toEqual([
            "set ap_max_velocity = 800",
        ]);
        expect(changeCommands({ ap_max_velocity: "500" }, { ap_max_velocity: 60 }).errors).toEqual(["ap_max_velocity"]);
    });

    it("accepts only the firmware choices", () => {
        expect(changeCommands({ failsafe_procedure: "DROP" }, { failsafe_procedure: "GPS-RESCUE" }).commands).toEqual([
            "set failsafe_procedure = GPS-RESCUE",
        ]);
        expect(changeCommands({ ap_rx_loss_policy: "DISABLE" }, { ap_rx_loss_policy: "FLY_AWAY" }).errors).toEqual([
            "ap_rx_loss_policy",
        ]);
    });

    it("shows the battery thresholds in volts per cell, sent to the firmware in 0.01 V", () => {
        const s = ALL_SETTINGS.find((x) => x.name === "battery_rth_cell_voltage");
        expect(toDisplay(s, "350")).toBe(3.5);
        expect(toRaw(s, 3.7)).toBe("370");
        expect(validate(s, "0")).toBe(true); // off
        expect(validate(s, "451")).toBe(false);
        expect(changeCommands({ battery_arm_min_cell_voltage: "0" }, { battery_arm_min_cell_voltage: 3.7 }).commands).toEqual([
            "set battery_arm_min_cell_voltage = 370",
        ]);
    });
});
