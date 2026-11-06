// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide (audit du 06/11/2026) : seules des commandes de RÉGLAGE peuvent être gardées hors ligne ou envoyées à une
// vraie carte par la carte hors ligne et par Studio. Une commande qui agit tout de suite sur la carte (moteurs,
// passerelle ESC ou GPS, clé USB, bootloader, effacement, son…) n'est jamais rejouée.

// Premier mot des commandes de réglage du CLI de Betaflight / TRUEGLIDE.
const SETTING_COMMANDS = new Set([
    "set",
    "feature",
    "serial",
    "aux",
    "adjrange",
    "rxrange",
    "rxfail",
    "map",
    "mixer",
    "mmix",
    "smix",
    "servo",
    "beeper",
    "beacon",
    "led",
    "color",
    "mode_color",
    "vtxtable",
    "vtx",
    "name",
    "resource",
    "timer",
    "dma",
    "simplified_tuning",
    "profile",
    "rateprofile",
    "battery_profile",
    "osd_profile",
    "waypoint",
    "batch",
]);

// Commandes qui prennent un numéro seul (changement de profil) : seulement avec ce numéro.
const NUMBER_ONLY = new Set(["profile", "rateprofile", "battery_profile", "osd_profile"]);

export function isSettingCommand(line) {
    const words = String(line ?? "")
        .trim()
        .split(/\s+/);
    const first = (words[0] ?? "").toLowerCase();
    if (!SETTING_COMMANDS.has(first)) {
        return false;
    }
    if (NUMBER_ONLY.has(first)) {
        return words.length === 2 && /^\d+$/.test(words[1]);
    }
    if (first === "batch") {
        return words.length === 2 && /^(start|end)$/i.test(words[1]);
    }
    return true;
}

// Les commandes d'une liste qui ne sont pas des réglages (vide : tout est autorisé).
export function forbiddenCommands(lines) {
    return (lines ?? []).filter((line) => !isSettingCommand(line));
}
