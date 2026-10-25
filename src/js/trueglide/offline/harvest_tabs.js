// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : onglets ouverts par la récolte (src/js/trueglide/offline/harvest.js).

// Onglets jamais ouverts par la récolte : ceux qui quittent la carte (ESC, flash), n'affichent rien de la carte,
// enregistrent en continu, ou peuvent demander une autorisation (Plan de vol : position du navigateur, service tiers).
export const SKIPPED_TABS = new Set([
    "esc",
    "studio",
    "firmware_flasher",
    "cli",
    "log",
    "help",
    "landing",
    "backups",
    "user_profile",
    "logging",
    "blackbox_viewer",
    "autotune",
    "flight_plan",
]);

export function harvestTabs(items, allowed) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const tab = item.tab ?? item.key;
        if (!["connected", "shared"].includes(item.mode) || SKIPPED_TABS.has(tab) || seen.has(tab)) {
            continue;
        }
        if (!allowed.includes(tab)) {
            continue;
        }
        seen.add(tab);
        out.push({ tab, i18n: item.i18n, mode: item.mode });
    }
    return out;
}
