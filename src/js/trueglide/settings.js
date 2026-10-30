// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : réglages propres au firmware TrueGlide (ranges recopiés de src/main/cli/settings.c du firmware).
// Ils n'ont pas de message MSP dédié : l'onglet les lit et les écrit par le CLI sur MSP (« get » / « set »).

export const SECTIONS = [
    {
        key: "power",
        title: "trueglidePowerTitle",
        help: "trueglidePowerHelp",
        settings: [
            { name: "power_guard_esc_temp", type: "number", min: 0, max: 150, unit: "°C" },
            { name: "power_guard_current", type: "number", min: 0, max: 1000, unit: "A" },
            { name: "power_guard_min_throttle", type: "number", min: 20, max: 100, unit: "%" },
        ],
    },
    {
        // Batterie : décollage refusé batterie basse, retour au départ batterie basse (0 = arrêt). Firmware en 0,01 V par élément.
        key: "battery",
        title: "trueglideBatteryTitle",
        help: "trueglideBatteryHelp",
        settings: [
            { name: "battery_arm_min_cell_voltage", type: "number", min: 0, max: 450, scale: 100, unit: "V" },
            { name: "battery_rth_cell_voltage", type: "number", min: 0, max: 450, scale: 100, unit: "V" },
            { name: "battery_rth_delay", type: "number", min: 1, max: 60, unit: "s" },
        ],
    },
    {
        key: "motors",
        title: "trueglideMotorsTitle",
        help: "trueglideMotorsHelp",
        settings: [
            { name: "motor_desync_recovery", type: "onoff" },
            { name: "motor_desync_threshold", type: "number", min: 10, max: 80, unit: "%" },
            { name: "dshot_telemetry_fallback", type: "onoff" },
        ],
    },
    {
        // Températures des ESC envoyées à la radio (CRSF / ELRS), désactivé par défaut
        key: "radiotlm",
        title: "trueglideRadioTlmTitle",
        help: "trueglideRadioTlmHelp",
        settings: [{ name: "crsf_tlm_esc_temp", type: "onoff" }],
    },
    {
        key: "speeder",
        title: "trueglideSpeederTitle",
        help: "trueglideSpeederHelp",
        settings: [
            { name: "speeder_cruise_angle", type: "number", min: 10, max: 80, unit: "°" },
            { name: "speeder_transition_rate", type: "number", min: 5, max: 180, unit: "°/s" },
            { name: "speeder_fpv_mix", type: "onoff" },
        ],
    },
    {
        // Sécurité de la navigation GPS (TRUENAV et GPS RESCUE). Unités du firmware : cm, cm/s ; affichées en m, m/s.
        key: "navsafety",
        title: "trueglideNavSafetyTitle",
        help: "trueglideNavSafetyHelp",
        settings: [
            { name: "ap_max_velocity", type: "number", min: 100, max: 5000, scale: 100, unit: "m/s" },
            { name: "ap_max_angle", type: "number", min: 10, max: 70, unit: "°" },
            { name: "ap_waypoint_arrival_radius", type: "number", min: 100, max: 5000, scale: 100, unit: "m" },
            { name: "ap_max_distance_from_home", type: "number", min: 0, max: 10000, unit: "m" },
            { name: "ap_geofence_action", type: "choice", values: ["LAND", "RTH"] },
            { name: "ap_rx_loss_policy", type: "choice", values: ["DISABLE", "CONTINUE", "LAND"] },
            { name: "gps_rescue_return_alt", type: "number", min: 5, max: 1000, unit: "m" },
            { name: "gps_rescue_ground_speed", type: "number", min: 0, max: 3000, scale: 100, unit: "m/s" },
            { name: "gps_rescue_min_sats", type: "number", min: 5, max: 50, unit: "" },
            { name: "failsafe_procedure", type: "choice", values: ["AUTO-LAND", "DROP", "GPS-RESCUE"] },
        ],
    },
    {
        key: "truenav",
        title: "trueglideTruenavTitle",
        help: "trueglideTruenavHelp",
        settings: [{ name: "mav_mission_home_item", type: "onoff" }],
    },
];

export const ALL_SETTINGS = SECTIONS.flatMap((s) => s.settings);

// i18n key of a setting label / help: power_guard_esc_temp -> trueglideSetting_power_guard_esc_temp(Help)
export function labelKey(name) {
    return `trueglideSetting_${name}`;
}

export function helpKey(name) {
    return `trueglideSetting_${name}Help`;
}

// The CLI prints "name = value" for each matching setting (followed by "Allowed ..." lines).
export function parseGet(lines) {
    const values = {};
    for (const raw of lines) {
        const m = /^\s*([a-z0-9_]+)\s*=\s*(\S+)\s*$/.exec(raw);
        if (m) {
            values[m[1]] = m[2];
        }
    }
    return values;
}

// Commands that read every TrueGlide setting at once (CLI "get" matches by name prefix).
export const GET_COMMANDS = [
    "get power_guard",
    "get battery_arm",
    "get battery_rth",
    "get motor_desync",
    "get dshot_telemetry_fallback",
    "get dshot_edt",
    "get speeder",
    "get crsf_tlm_esc",
    "get mav_mission",
    "get ap_",
    "get gps_rescue",
    "get failsafe_procedure",
];

// Firmware value (string) <-> displayed value. A scaled setting shows e.g. cm/s as m/s.
export function toDisplay(setting, raw) {
    if (setting.type !== "number") {
        return raw;
    }
    const v = Number(raw);
    return setting.scale ? v / setting.scale : v;
}

export function toRaw(setting, shown) {
    if (setting.type !== "number") {
        return String(shown);
    }
    const v = Number(shown);
    return String(setting.scale ? Math.round(v * setting.scale) : v);
}

export function validate(setting, value) {
    if (setting.type === "onoff") {
        return value === "ON" || value === "OFF";
    }
    if (setting.type === "choice") {
        return setting.values.includes(value);
    }
    const v = Number(value);
    return Number.isInteger(v) && v >= setting.min && v <= setting.max;
}

// Only what changed, as "set" commands, in a stable order. Invalid values are refused, never clamped silently.
export function changeCommands(original, edited) {
    const commands = [];
    const errors = [];
    for (const s of ALL_SETTINGS) {
        if (!(s.name in original) || !(s.name in edited)) {
            continue;
        }
        const value = toRaw(s, edited[s.name]);
        if (value === String(original[s.name])) {
            continue;
        }
        if (!validate(s, value)) {
            errors.push(s.name);
            continue;
        }
        commands.push(`set ${s.name} = ${value}`);
    }
    return { commands, errors };
}
