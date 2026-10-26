// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// TrueGlide : carte simulée (vrai firmware dans le navigateur). Ce qui a changé entre la vraie carte récoltée et la
// carte simulée réglée hors ligne se lit en comparant leurs « dump all » : chaque ligne de la carte simulée qui n'est
// pas dans la vraie carte est une commande à envoyer, dans l'ordre du dump, précédée du profil où elle s'applique.

// lignes jamais envoyées : identité de la puce et de la carte, commandes d'enchaînement
const IGNOREES = /^(mcu_id|signature|board_name|manufacturer_id|batch|defaults|save|dump|diff|version)\b/;
// sélection d'un profil (le dump les écrit avant les réglages de ce profil)
const PROFIL = /^(profile|rateprofile|battery_profile|osd_profile)\s+\d+$/;

// Lignes d'un « dump all » ou « diff all » : sans commentaires, sans lignes vides ni invite du CLI.
export function dumpLines(text) {
    return String(text ?? "")
        .replace(/\r/g, "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && l !== "#");
}

// Chaque ligne avec le profil où elle s'applique (le dernier profil choisi avant elle) : { line, context }.
function withContext(lines) {
    const out = [];
    let current = "";
    for (const line of lines) {
        if (PROFIL.test(line)) {
            current = line;
            continue;
        }
        out.push({ line, context: line.startsWith("set ") ? current : "" });
    }
    return out;
}

// Profil choisi à la fin du dump pour chaque sorte (profil actif de la carte) : { profile: "profile 3", … }.
function finalSelection(lines) {
    const selection = {};
    for (const line of lines) {
        if (PROFIL.test(line)) {
            selection[line.split(/\s+/)[0]] = line;
        }
    }
    return selection;
}

// Commandes qui font passer la vraie carte de `realDump` à `simDump` (textes des « dump all »).
export function dumpDelta(realDump, simDump) {
    const realLines = dumpLines(realDump);
    const simLines = dumpLines(simDump);
    const real = new Set(withContext(realLines).map((e) => `${e.context}\n${e.line}`));
    const commands = [];
    const active = {};
    for (const { line, context } of withContext(simLines)) {
        if (IGNOREES.test(line) || real.has(`${context}\n${line}`)) {
            continue;
        }
        // le profil de ce réglage d'abord, s'il n'est pas déjà choisi
        if (context) {
            const kind = context.split(/\s+/)[0];
            if (active[kind] !== context) {
                commands.push(context);
                active[kind] = context;
            }
        }
        commands.push(line);
    }
    // profils actifs à la fin : ceux de la carte simulée (rétablis, ou changés hors ligne)
    const realFinal = finalSelection(realLines);
    for (const [kind, sel] of Object.entries(finalSelection(simLines))) {
        if (active[kind] ? active[kind] !== sel : realFinal[kind] !== sel) {
            commands.push(sel);
        }
    }
    return commands;
}
