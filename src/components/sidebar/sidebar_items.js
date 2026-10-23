export const sidebarItems = [
    { key: "landing", mode: "disconnected", i18n: "tabLanding", icon: "i-lucide-home" },
    { key: "firmware_flasher", mode: "disconnected", i18n: "tabFirmwareFlasher", icon: "i-lucide-zap" },
    { key: "help", mode: "disconnected", i18n: "tabHelp", icon: "i-lucide-help-circle" },
    { key: "preflight", mode: "disconnected", i18n: "tabPreflight", icon: "i-lucide-clipboard-check" },
    { key: "flight_plan", mode: "disconnected", i18n: "tabFlightPlan", icon: "i-lucide-route", expert: true },

    // TrueGlide: dashboard first once connected (outside the groups), then the tabs grouped in the order a quad is set up (group = i18n key of the heading)
    { key: "dashboard", mode: "connected", i18n: "tabDashboard", icon: "i-lucide-layout-dashboard" },
    {
        key: "setup",
        mode: "connected",
        i18n: "tabSetup",
        icon: "i-lucide-sliders-horizontal",
        group: "sidebarGroupSetup",
    },
    { key: "ports", mode: "connected", i18n: "tabPorts", icon: "i-lucide-cable", group: "sidebarGroupSetup" },
    {
        key: "configuration",
        mode: "connected",
        i18n: "tabConfiguration",
        icon: "i-lucide-settings",
        group: "sidebarGroupSetup",
    },
    { key: "receiver", mode: "connected", i18n: "tabReceiver", icon: "i-lucide-radio", group: "sidebarGroupSetup" },
    {
        key: "auxiliary",
        mode: "connected",
        i18n: "tabAuxiliary",
        icon: "i-lucide-toggle-right",
        group: "sidebarGroupSetup",
    },
    { key: "power", mode: "connected", i18n: "tabPower", icon: "i-lucide-battery", group: "sidebarGroupSetup" },
    { key: "motors", mode: "connected", i18n: "tabMotorTesting", icon: "i-lucide-fan", group: "sidebarGroupSetup" },
    // TrueGlide: TrueGlide ESC Configurator in a tab (separate public software, fixed version). Shared: the
    // Configurator disconnects from the board when it is opened, the ESC tab then connects by itself.
    { key: "esc", mode: "shared", i18n: "tabEsc", icon: "i-lucide-cpu", group: "sidebarGroupSetup" },
    {
        key: "servos",
        mode: "connected",
        i18n: "tabServos",
        icon: "i-lucide-rotate-ccw",
        buildOptions: ["USE_SERVOS", "USE_WING"],
        group: "sidebarGroupSetup",
    },
    {
        key: "failsafe",
        mode: "connected",
        i18n: "tabFailsafe",
        icon: "i-lucide-shield-alert",
        // TrueGlide: a step of the guided setup, so not hidden behind the expert mode
        group: "sidebarGroupSetup",
    },

    {
        key: "tf_protections",
        mode: "connected",
        i18n: "tabTfProtections",
        icon: "i-lucide-shield-check",
        group: "sidebarGroupTrueGlide",
    },
    {
        key: "tf_speeder",
        mode: "connected",
        i18n: "tabTfSpeeder",
        icon: "i-lucide-gauge",
        group: "sidebarGroupTrueGlide",
    },
    {
        key: "tf_navigation",
        mode: "connected",
        i18n: "tabTfNavigation",
        icon: "i-lucide-map-pinned",
        buildOptions: ["USE_GPS"],
        group: "sidebarGroupTrueGlide",
    },
    {
        key: "tf_camera",
        mode: "connected",
        i18n: "tabTfCamera",
        icon: "i-lucide-camera",
        group: "sidebarGroupTrueGlide",
    },
    {
        key: "tf_radio",
        mode: "connected",
        i18n: "tabTfRadio",
        icon: "i-lucide-radio-tower",
        group: "sidebarGroupTrueGlide",
    },

    { key: "presets", mode: "connected", i18n: "tabPresets", icon: "i-lucide-wand-2", group: "sidebarGroupTuning" },
    { key: "pid_tuning", mode: "connected", i18n: "tabPidTuning", icon: "i-lucide-gauge", group: "sidebarGroupTuning" },
    {
        key: "trueglide_tune",
        mode: "connected",
        i18n: "tabTrueGlideTune",
        icon: "i-lucide-wand-sparkles",
        group: "sidebarGroupTuning",
    },
    {
        key: "autotune",
        mode: "shared",
        i18n: "tabAutotune",
        icon: "i-lucide-gauge",
        expert: true,
        group: "sidebarGroupTuning",
    },
    {
        key: "adjustments",
        mode: "connected",
        i18n: "tabAdjustments",
        icon: "i-lucide-sliders",
        expert: true,
        group: "sidebarGroupTuning",
    },

    {
        key: "gps",
        mode: "connected",
        i18n: "tabGPS",
        icon: "i-lucide-map-pin",
        buildOptions: ["USE_GPS"],
        group: "sidebarGroupNavigation",
    },
    {
        key: "flight_plan_connected",
        tab: "flight_plan",
        mode: "connected",
        i18n: "tabFlightPlan",
        icon: "i-lucide-route",
        buildOptions: ["USE_FLIGHT_PLAN"],
        group: "sidebarGroupNavigation",
    },

    {
        key: "osd",
        mode: "connected",
        i18n: "tabOsd",
        icon: "i-lucide-monitor",
        feature: "OSD",
        group: "sidebarGroupVideo",
    },
    { key: "vtx", mode: "connected", i18n: "tabVtx", icon: "i-lucide-radio-tower", group: "sidebarGroupVideo" },
    {
        key: "led_strip",
        mode: "connected",
        i18n: "tabLedStrip",
        icon: "i-lucide-lightbulb",
        feature: "LED_STRIP",
        group: "sidebarGroupVideo",
    },

    { key: "sensors", mode: "connected", i18n: "tabSensorConfig", icon: "i-lucide-cpu", group: "sidebarGroupAnalysis" },
    {
        key: "onboard_logging",
        mode: "connected",
        i18n: "tabOnboardLogging",
        icon: "i-lucide-database",
        group: "sidebarGroupAnalysis",
    },
    {
        key: "blackbox_viewer",
        mode: "shared",
        i18n: "tabBlackboxViewer",
        icon: "i-lucide-line-chart",
        group: "sidebarGroupAnalysis",
    },
    {
        key: "logging",
        mode: "connected",
        i18n: "tabLogging",
        icon: "i-lucide-file-text",
        expert: true,
        group: "sidebarGroupAnalysis",
    },

    {
        key: "help_connected",
        tab: "help",
        mode: "connected",
        i18n: "tabHelp",
        icon: "i-lucide-help-circle",
        group: "sidebarGroupTools",
    },
    { key: "cli", mode: "cli", i18n: "tabCLI", icon: "i-lucide-terminal", group: "sidebarGroupTools" },

    { key: "log", mode: "shared", i18n: "tabLog", icon: "i-lucide-file-text", expert: true, hideInSidebar: true },

    { key: "backups", mode: "loggedin", i18n: "tabBackups", icon: "i-lucide-database", hideInSidebar: true },
    { key: "user_profile", mode: "loggedin", i18n: "tabUserProfile", icon: "i-lucide-user", hideInSidebar: true },
];

export function isItemVisible(item, ctx) {
    if (item.expert && !ctx.expertMode) {
        return false;
    }
    if (item.buildOptions && !item.buildOptions.some((o) => ctx.buildOptions?.includes(o))) {
        return false;
    }
    if (item.feature && !ctx.features?.isEnabled?.(item.feature)) {
        return false;
    }
    return true;
}

// TrueGlide: split the visible items into consecutive groups (items without a group form their own group)
export function groupItems(items) {
    const groups = [];
    for (const item of items) {
        const last = groups.at(-1);
        if (last && last.group === (item.group ?? null)) {
            last.items.push(item);
        } else {
            groups.push({ group: item.group ?? null, items: [item] });
        }
    }
    return groups;
}
