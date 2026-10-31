// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
/**
 * Source des firmwares TrueGlide pour l'onglet « Flasher le Firmware ».
 *
 * Deux sources :
 * - un fichier .hex choisi sur l'ordinateur (toujours possible, sans Internet) ;
 * - la mise à jour en ligne : le manifeste `firmware/index.json` et les fichiers `.hex.gz` publiés sur GitHub
 *   Pages à côté de l'application (préparés par trueglide/outils/publier_firmware.py dans le dépôt du firmware).
 *   Rien n'est demandé au réseau tant que le pilote ne clique pas sur « Chercher la mise à jour ». Chaque fichier
 *   téléchargé est contrôlé (somme SHA-256 du manifeste) avant d'être proposé au flash.
 */
export const TRUEGLIDE_FIRMWARE_URL = "https://jschmiedd.github.io/TrueGlide-Configurator/firmware/";
// The test build of the app (/test/) reads its own list, so firmwares can be tried before /app/ offers them
// Liste lue par la page d'essai /test/ : la liste officielle depuis la publication du 23/10/2026 (firmware-test/ retiré).
// Remettre une adresse d'essai ici le jour où une liste d'essai est publiée à côté de la liste officielle.
export const TRUEGLIDE_FIRMWARE_TEST_URL = TRUEGLIDE_FIRMWARE_URL;
const TEST_APP_PATH = "/TrueGlide-Configurator/test/";

// Autre adresse (essais, serveur local) : localStorage « tf_update_url » (sans le mot « firmware », que main.js efface
// du stockage au démarrage).
const URL_OVERRIDE_KEY = "tf_update_url";

/** Adresse du dossier des firmwares, terminée par « / ». */
export function firmwareBaseUrl() {
    const isTestApp = String(globalThis.location?.pathname ?? "").startsWith(TEST_APP_PATH);
    let url = isTestApp ? TRUEGLIDE_FIRMWARE_TEST_URL : TRUEGLIDE_FIRMWARE_URL;
    try {
        url = globalThis.localStorage?.getItem(URL_OVERRIDE_KEY) || url;
    } catch {
        // stockage indisponible (navigation privée) : adresse par défaut
    }
    return url.endsWith("/") ? url : `${url}/`;
}

/** Modèles de firmware TrueGlide, reconnus par le préfixe du nom de fichier (le plus long d'abord). */
export const TRUEGLIDE_FIRMWARE_MODELS = Object.freeze([
    Object.freeze({ prefix: "truenav_light_", model: "TRUENAV_LIGHT" }),
    // ancien nom de TrueNav Light (fichiers compilés avant octobre 2026)
    Object.freeze({ prefix: "truenav_leger_", model: "TRUENAV_LIGHT" }),
    Object.freeze({ prefix: "truenav_", model: "TRUENAV" }),
    Object.freeze({ prefix: "trueglide_", model: "STANDARD" }),
    // ancien nom de TRUEGLIDE (fichiers compilés avant le 13 octobre 2026)
    Object.freeze({ prefix: "trueflight_", model: "STANDARD" }),
]);

/**
 * @returns {boolean} true si une adresse de mise à jour en ligne est configurée.
 */
export function isOnlineFirmwareSourceEnabled() {
    return /^https?:\/\//.test(firmwareBaseUrl());
}

/**
 * Analyse un nom de fichier de la forme `<préfixe><version>_<MCU>_<CARTE>.hex`.
 * La carte peut contenir des « _ » (ex. BAYCK_DOLPHIN_MINI) ; version et MCU n'en contiennent pas.
 *
 * @param {string} filename nom (ou chemin) du fichier
 * @returns {{ isTrueGlide: boolean, model: string|null, version: string|null, mcu: string|null, board: string|null }}
 */
// familles de processeurs des cartes Betaflight (champ <MCU> du nom de fichier)
const MCU_NAME = /^(STM32|AT32|APM32|GD32|RP2|X32|SITL)/i;

export function parseTrueGlideFirmwareName(filename) {
    const empty = { isTrueGlide: false, model: null, version: null, mcu: null, board: null };
    if (typeof filename !== "string" || filename.length === 0) {
        return empty;
    }

    const baseName = filename.split(/[\\/]/).pop();
    const lower = baseName.toLowerCase();
    const entry = TRUEGLIDE_FIRMWARE_MODELS.find(({ prefix }) => lower.startsWith(prefix));
    // a Betaflight file names its board the same way: read it too, so a file for another board is caught
    const betaflight = !entry && lower.startsWith("betaflight_");
    if (!entry && !betaflight) {
        return empty;
    }

    const stem = baseName.slice(entry ? entry.prefix.length : "betaflight_".length).replace(/\.hex$/i, "");
    const parts = stem.split("_").filter((part) => part.length > 0);

    // <version>_<MCU>_<CARTE> ; sans processeur reconnu (ex. « _SPEEDYBEEF405MINI_24a71eb », révision en dernier),
    // la carte est la partie qui suit la version : une révision n'est jamais prise pour une carte
    if (parts.length > 1 && !MCU_NAME.test(parts[1])) {
        return {
            isTrueGlide: Boolean(entry),
            model: entry ? entry.model : null,
            version: parts[0] ?? null,
            mcu: null,
            board: parts[1],
        };
    }
    return {
        isTrueGlide: Boolean(entry),
        model: entry ? entry.model : null,
        version: parts[0] ?? null,
        mcu: parts[1] ?? null,
        board: parts.length > 2 ? parts.slice(2).join("_") : null,
    };
}

/**
 * Contrôle un fichier firmware avant flash.
 *
 * @param {string} filename nom du fichier chargé
 * @param {string} [connectedBoardName] nom de carte déjà connu localement (FC.CONFIG.boardName), sinon vide
 * @returns {{ filename: string, isTrueGlide: boolean, model: string|null, version: string|null,
 *   mcu: string|null, board: string|null, connectedBoard: string|null, boardMismatch: boolean }}
 */
export function checkTrueGlideFirmwareFile(filename, connectedBoardName) {
    const parsed = parseTrueGlideFirmwareName(filename);
    const connectedBoard =
        typeof connectedBoardName === "string" && connectedBoardName.trim().length > 0
            ? connectedBoardName.trim()
            : null;

    const boardMismatch =
        !!parsed.board &&
        !!connectedBoard &&
        parsed.board.toUpperCase() !== connectedBoard.toUpperCase();

    return {
        filename: typeof filename === "string" ? filename : "",
        ...parsed,
        connectedBoard,
        boardMismatch,
    };
}

/**
 * Confirmation demandée avant de flasher (recontrôle Fable N8).
 *  - « mismatch » : carte lue en ce moment (connexion MSP) différente de celle du fichier ;
 *  - « unknown » : fichier local et carte pas lue en ce moment (déconnectée, ou en mode DFU où aucune carte ne
 *    répond) : le nom gardé d'une connexion précédente peut être celui d'une autre carte, rien n'est vérifiable ;
 *  - null : rien à demander (fichier en ligne choisi pour la carte, ou même carte).
 *
 * @param {ReturnType<typeof checkTrueGlideFirmwareFile>} check fait avec la carte lue en ce moment, ou sans carte
 * @param {{isLocal: boolean, live: boolean}} options
 * @returns {"mismatch"|"unknown"|null}
 */
export function boardConfirmationNeeded(check, { isLocal, live }) {
    if (live && check?.boardMismatch) {
        return "mismatch";
    }
    if (isLocal && !live) {
        return "unknown";
    }
    return null;
}

/**
 * Modèle du firmware installé, d'après les options de compilation lues sur la carte (MSP).
 * TRUENAV et TRUENAV_LIGHT ne se distinguent pas ainsi : les deux donnent « TRUENAV ».
 *
 * @param {string[]|undefined} buildOptions FC.CONFIG.buildOptions
 * @returns {"STANDARD"|"TRUENAV"}
 */
export function modelFromBuildOptions(buildOptions) {
    return Array.isArray(buildOptions) && buildOptions.includes("USE_FLIGHT_PLAN") ? "TRUENAV" : "STANDARD";
}

const VERSION_NAMES = Object.freeze({
    TRUENAV_LIGHT: "TRUENAV_LIGHT",
    TRUENAV: "TRUENAV",
    TRUEGLIDE: "STANDARD",
    TRUEFLIGHT: "STANDARD",
});

/**
 * Modèle du firmware installé, d'après la réponse à la commande CLI « version » (« # TRUENAV_LIGHT / STM32F405 … »).
 * Seule source qui distingue TRUENAV_LIGHT de TRUENAV.
 *
 * @param {string[]} lines réponse de la commande « version »
 * @returns {"STANDARD"|"TRUENAV"|"TRUENAV_LIGHT"|null} null si la réponse ne nomme pas un firmware TrueGlide
 */
export function modelFromVersionLines(lines) {
    for (const line of lines ?? []) {
        const match = /^#\s*([A-Z_]+)\s*\//.exec(String(line).trim());
        if (match && match[1] in VERSION_NAMES) {
            return VERSION_NAMES[match[1]];
        }
    }
    return null;
}

const SHA256 = /^[0-9a-f]{64}$/;
const MODELS = new Set(TRUEGLIDE_FIRMWARE_MODELS.map((m) => m.model));

/**
 * Contrôle le manifeste publié. Les entrées incomplètes ou dont le chemin sort du dossier sont écartées.
 *
 * @param {any} json contenu de index.json
 * @returns {{ version: string, revision: string, date: string, files: object[] }}
 */
export function parseFirmwareIndex(json) {
    if (!json || json.format !== 1 || typeof json.version !== "string" || typeof json.revision !== "string") {
        throw new Error("manifeste du firmware illisible");
    }
    const files = (Array.isArray(json.files) ? json.files : []).filter(
        (f) =>
            f &&
            MODELS.has(f.model) &&
            typeof f.board === "string" &&
            /^[A-Z0-9_-]+$/.test(f.board) &&
            typeof f.file === "string" &&
            /^[A-Z_]+\/[A-Za-z0-9_.-]+\.hex\.gz$/.test(f.file) &&
            Number.isInteger(f.size) &&
            f.size > 0 &&
            SHA256.test(f.sha256 ?? ""),
    );
    return { version: json.version, revision: json.revision, date: String(json.date ?? ""), files };
}

/** Cartes du manifeste, triées. */
export function indexBoards(index) {
    return [...new Set(index.files.map((f) => f.board))].sort();
}

/** Fichier du manifeste pour une carte et un modèle, ou null. */
export function findFirmware(index, board, model) {
    const b = String(board ?? "").toUpperCase();
    return index.files.find((f) => f.board === b && f.model === model) ?? null;
}

/**
 * Compare le firmware installé à la version publiée.
 * La carte renvoie les 7 premiers caractères de la révision git (MSP_BUILD_INFO) ; le manifeste en garde 9.
 *
 * @returns {"current"|"update"|"other"} « other » : firmware qui n'est pas TrueGlide ou révision inconnue
 */
export function installedStatus(index, installed) {
    const revision = String(installed?.revision ?? "").toLowerCase();
    if (!installed?.isTrueGlide || revision.length < 7) {
        return "other";
    }
    return index.revision.toLowerCase().startsWith(revision) ? "current" : "update";
}

/** Récupère le manifeste (sans cache, pour voir tout de suite une nouvelle publication). */
export async function fetchFirmwareIndex({ fetchImpl = globalThis.fetch, baseUrl = firmwareBaseUrl() } = {}) {
    const response = await fetchImpl(`${baseUrl}index.json`, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return parseFirmwareIndex(await response.json());
}

async function sha256Hex(bytes) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function gunzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Télécharge un firmware du manifeste, le décompresse et vérifie sa taille et sa somme SHA-256.
 *
 * @returns {Promise<{ name: string, text: string }>} nom du .hex et contenu, prêts pour le flasheur
 */
export async function downloadFirmware(entry, { fetchImpl = globalThis.fetch, baseUrl = firmwareBaseUrl() } = {}) {
    const response = await fetchImpl(`${baseUrl}${entry.file}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const hex = await gunzip(new Uint8Array(await response.arrayBuffer()));
    if (hex.length !== entry.size || (await sha256Hex(hex)) !== entry.sha256) {
        throw new Error("fichier abîmé (somme de contrôle différente)");
    }
    return { name: entry.file.split("/").pop().replace(/\.gz$/, ""), text: new TextDecoder().decode(hex) };
}

// Carte vue à la dernière connexion : le flasheur s'en sert après la déconnexion (la carte ne répond plus en MSP
// pendant le flash). Gardée aussi d'une session à l'autre.
const LAST_BOARD_KEY = "tf_last_board";
let pendingUpdate = null;

/** Enregistre la carte connectée : { board, model, version, revision, isTrueGlide }. */
export function rememberConnectedBoard(info) {
    try {
        globalThis.localStorage?.setItem(LAST_BOARD_KEY, JSON.stringify(info));
    } catch {
        // stockage indisponible : la carte sera à choisir dans la liste
    }
}

/** Dernière carte connectée, ou null. */
export function lastConnectedBoard() {
    try {
        const info = JSON.parse(globalThis.localStorage?.getItem(LAST_BOARD_KEY) ?? "null");
        return info && typeof info.board === "string" ? info : null;
    } catch {
        return null;
    }
}

/** Mise à jour demandée depuis le tableau de bord, reprise par le flasheur à son ouverture (une seule fois). */
export function requestFirmwareUpdate(entry) {
    pendingUpdate = entry;
}

export function takeRequestedFirmwareUpdate() {
    const entry = pendingUpdate;
    pendingUpdate = null;
    return entry;
}
