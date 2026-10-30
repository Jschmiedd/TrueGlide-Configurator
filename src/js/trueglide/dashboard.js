// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide dashboard and guided setup: pure helpers (no MSP, no DOM), unit tested.
import semver from "semver";

// The guided setup steps, in the order of the "Setup" menu group, then the TrueGlide tab.
// `label` is the tab's existing i18n key, `help` the short guidance shown in the setup bar.
export const SETUP_STEPS = [
    { tab: "setup", label: "tabSetup", help: "tfGuideHelp_setup" },
    { tab: "ports", label: "tabPorts", help: "tfGuideHelp_ports" },
    { tab: "configuration", label: "tabConfiguration", help: "tfGuideHelp_configuration" },
    { tab: "receiver", label: "tabReceiver", help: "tfGuideHelp_receiver" },
    { tab: "auxiliary", label: "tabAuxiliary", help: "tfGuideHelp_auxiliary" },
    { tab: "power", label: "tabPower", help: "tfGuideHelp_power" },
    { tab: "motors", label: "tabMotorTesting", help: "tfGuideHelp_motors" },
    { tab: "failsafe", label: "tabFailsafe", help: "tfGuideHelp_failsafe" },
    { tab: "tf_protections", label: "sidebarGroupTrueGlide", help: "tfGuideHelp_trueglide" },
];

export function stepIndex(tab) {
    return SETUP_STEPS.findIndex((s) => s.tab === tab);
}

// Firmware armingDisableFlags_e order (src/main/fc/runtime_config.h); the last bit is always ARM_SWITCH.
const ARMING_FLAGS_BASE = [
    "NO_GYRO",
    "FAILSAFE",
    "RX_FAILSAFE",
    "NOT_DISARMED",
    "BOXFAILSAFE",
    "RUNAWAY_TAKEOFF",
    "CRASH_DETECTED",
    "THROTTLE",
    "ANGLE",
    "BOOT_GRACE_TIME",
    "NOPREARM",
    "LOAD",
    "CALIBRATING",
    "CLI",
    "CMS_MENU",
    "BST",
    "MSP",
    "PARALYZE",
    "GPS",
    "RESC",
    "RPMFILTER",
    "REBOOT_REQUIRED",
    "DSHOT_BITBANG",
    "ACC_CALIBRATION",
    "MOTOR_PROTOCOL",
];

export function armingFlagNames(apiVersion, count) {
    const names = [...ARMING_FLAGS_BASE];
    const api = semver.valid(semver.coerce(apiVersion));
    if (!api) {
        return names;
    }
    if (semver.gte(api, "1.46.0")) {
        names[names.indexOf("RPMFILTER")] = "DSHOT_TELEM";
    }
    if (semver.gte(api, "1.47.0")) {
        names.push("CRASHFLIP", "ALTHOLD", "POSHOLD");
    }
    if (semver.gte(api, "1.48.0")) {
        names.push("AUTOPILOT");
    }
    // TrueGlide firmware: one more reason before ARM_SWITCH (battery_arm_min_cell_voltage)
    if (count !== undefined && count - 1 > names.length) {
        names.push("LOW_BATTERY");
    }
    return names;
}

// Reasons that currently prevent arming. ARM_SWITCH (last bit: the arm switch is on) is left out, as in the
// Setup tab: it is the pilot's own switch, not a fault. Unknown bits keep their number.
export function armingBlockers(apiVersion, count, bitmask) {
    const names = armingFlagNames(apiVersion, count);
    const blockers = [];
    for (let i = 0; i < count; i++) {
        if (!(bitmask & (1 << i)) || i === count - 1) {
            continue;
        }
        blockers.push(names[i] ?? `${i + 1}`);
    }
    return blockers;
}

// Battery: voltage as measured; per-cell only when the firmware detected the cell count.
export function batteryInfo(voltage, cellCount) {
    if (!(voltage > 0.5)) {
        return { measured: false };
    }
    const info = { measured: true, voltage: Math.round(voltage * 100) / 100, cells: cellCount || 0 };
    if (cellCount > 0) {
        info.perCell = Math.round((voltage / cellCount) * 100) / 100;
    }
    return info;
}

// RSSI from MSP_ANALOG is 0..1023
export function rssiPercent(rssi) {
    return Math.round((Math.max(0, Math.min(1023, rssi)) / 1023) * 100);
}

// State of each TrueGlide feature from the CLI "get" values (strings). A feature whose settings the firmware
// does not have is left out (plain Betaflight, or a model without it).
export function trueglideStatus(values, pinioBoxes) {
    const has = (k) => k in values;
    const num = (k) => Number(values[k]);
    const out = [];
    if (has("power_guard_esc_temp") || has("power_guard_current")) {
        const temp = num("power_guard_esc_temp");
        const amps = num("power_guard_current");
        const parts = [];
        if (temp > 0) {
            parts.push(`${temp} °C`);
        }
        if (amps > 0) {
            parts.push(`${amps} A`);
        }
        const entry = { key: "power_guard", on: parts.length > 0, detail: parts.join(" · ") };
        // the ESC temperature comes from extended DShot telemetry, asked for at arming only with dshot_edt ON:
        // without it the firmware reads 0 °C (unknown) and the temperature limit never acts
        if (temp > 0 && values.dshot_edt === "OFF") {
            entry.warn = "tfDashWarnNoEdt";
        }
        out.push(entry);
    }
    if (has("motor_desync_recovery")) {
        out.push({ key: "motor_health", on: values.motor_desync_recovery === "ON", detail: "" });
    }
    if (has("speeder_cruise_angle")) {
        out.push({ key: "speeder", on: null, detail: `${num("speeder_cruise_angle")}°` });
    }
    if (Array.isArray(pinioBoxes) && pinioBoxes.length) {
        // what a PINIO powers (camera, VTX, Bluetooth...) is board wiring the firmware does not know: show the
        // assignment only, never "camera"
        const switched = pinioBoxes
            .map((b, i) => (b >= 40 && b <= 43 ? `PINIO${i + 1} → USER${b - 39}` : null))
            .filter(Boolean);
        out.push({ key: "pinio", on: switched.length > 0, detail: switched.join(" · ") });
    }
    return out;
}

// Guided setup progress: validated steps per board, kept in the browser (no server).
export function progressKey(boardName, uid) {
    const id = Array.isArray(uid) ? uid.map((v) => (Number(v) >>> 0).toString(16).padStart(8, "0")).join("") : "";
    return `tf-setup-${boardName || "board"}-${id}`;
}

export function progressSummary(done) {
    const validated = SETUP_STEPS.filter((s) => done[s.tab]);
    const next = SETUP_STEPS.find((s) => !done[s.tab]) ?? null;
    return { count: validated.length, total: SETUP_STEPS.length, next };
}
