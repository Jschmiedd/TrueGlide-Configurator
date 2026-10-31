// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// @vitest-environment node
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    TRUEGLIDE_FIRMWARE_URL,
    TRUEGLIDE_FIRMWARE_TEST_URL,
    boardConfirmationNeeded,
    checkTrueGlideFirmwareFile,
    downloadFirmware,
    fetchFirmwareIndex,
    findFirmware,
    firmwareBaseUrl,
    indexBoards,
    installedStatus,
    isOnlineFirmwareSourceEnabled,
    modelFromBuildOptions,
    modelFromVersionLines,
    parseFirmwareIndex,
    parseTrueGlideFirmwareName,
} from "../../src/js/trueglide/firmware_source.js";

describe("TrueGlide firmware source", () => {
    it("publie la mise à jour en ligne à côté de l'application (GitHub Pages)", () => {
        expect(TRUEGLIDE_FIRMWARE_URL).toBe("https://jschmiedd.github.io/TrueGlide-Configurator/firmware/");
        expect(firmwareBaseUrl()).toBe(TRUEGLIDE_FIRMWARE_URL);
        expect(isOnlineFirmwareSourceEnabled()).toBe(true);
    });

    describe("adresse de la liste selon la page", () => {
        afterEach(() => vi.unstubAllGlobals());

        it("la page de test lit sa propre liste, l'application normale la liste publiée", () => {
            vi.stubGlobal("location", { pathname: "/TrueGlide-Configurator/test/index.html" });
            expect(firmwareBaseUrl()).toBe(TRUEGLIDE_FIRMWARE_TEST_URL);
            vi.stubGlobal("location", { pathname: "/TrueGlide-Configurator/app/" });
            expect(firmwareBaseUrl()).toBe(TRUEGLIDE_FIRMWARE_URL);
            vi.stubGlobal("location", { pathname: "/TrueGlide-Configurator/site-test/" });
            expect(firmwareBaseUrl()).toBe(TRUEGLIDE_FIRMWARE_URL);
        });
    });

    it.each([
        ["trueglide_2026.6.2_STM32F405_SPEEDYBEEF405MINI.hex", "STANDARD", "STM32F405", "SPEEDYBEEF405MINI"],
        ["truenav_2026.6.2_STM32H743_MATEKH743.hex", "TRUENAV", "STM32H743", "MATEKH743"],
        ["truenav_light_2026.6.2_STM32F722_SPEEDYBEEF7V3.hex", "TRUENAV_LIGHT", "STM32F722", "SPEEDYBEEF7V3"],
        ["truenav_leger_2026.6.2_STM32F722_SPEEDYBEEF7V3.hex", "TRUENAV_LIGHT", "STM32F722", "SPEEDYBEEF7V3"],
        ["trueflight_2026.6.2_STM32F405_SPEEDYBEEF405MINI.hex", "STANDARD", "STM32F405", "SPEEDYBEEF405MINI"],
        ["trueglide_2026.6.2_AT32F435G_BAYCK_DOLPHIN_MINI.hex", "STANDARD", "AT32F435G", "BAYCK_DOLPHIN_MINI"],
        ["TRUEGLIDE_2026.6.2_STM32F405_FOO.HEX", "STANDARD", "STM32F405", "FOO"],
        // board names may contain a hyphen (LUXHDAIO-G4)
        ["trueglide_2026.6.2_STM32G474_LUXHDAIO-G4.hex", "STANDARD", "STM32G474", "LUXHDAIO-G4"],
    ])("reconnaît %s", (name, model, mcu, board) => {
        const parsed = parseTrueGlideFirmwareName(name);
        expect(parsed).toEqual({ isTrueGlide: true, model, version: "2026.6.2", mcu, board });
    });

    it("ignore le chemin du fichier", () => {
        const parsed = parseTrueGlideFirmwareName("/home/x/obj/truenav_2026.6.2_STM32F405_FOO.hex");
        expect(parsed.model).toBe("TRUENAV");
        expect(parsed.board).toBe("FOO");
    });

    it.each([
        "betaflight_4.5.2_STM32F405_SPEEDYBEEF405MINI.hex",
        "SPEEDYBEEF405MINI.hex",
        "my_trueglide_2026.6.2_STM32F405_FOO.hex",
        "truenavleger_2026.6.2_STM32F405_FOO.hex",
        "",
        undefined,
    ])("signale %s comme non TrueGlide", (name) => {
        expect(checkTrueGlideFirmwareFile(name).isTrueGlide).toBe(false);
    });

    it("ne signale pas de carte différente sans carte détectée localement", () => {
        const check = checkTrueGlideFirmwareFile("trueglide_2026.6.2_STM32F405_SPEEDYBEEF405MINI.hex", "");
        expect(check.connectedBoard).toBeNull();
        expect(check.boardMismatch).toBe(false);
    });

    it("signale une carte différente de la carte détectée (sans tenir compte de la casse)", () => {
        const name = "trueglide_2026.6.2_STM32F405_SPEEDYBEEF405MINI.hex";
        expect(checkTrueGlideFirmwareFile(name, "MATEKF405").boardMismatch).toBe(true);
        expect(checkTrueGlideFirmwareFile(name, "speedybeef405mini").boardMismatch).toBe(false);
    });

    it("signale aussi un fichier Betaflight prévu pour une autre carte (revue Fable 2, C10)", () => {
        const check = checkTrueGlideFirmwareFile("betaflight_2026.6.2_STM32F405_MATEKF405.hex", "SPEEDYBEEF405MINI");
        expect(check.isTrueGlide).toBe(false);
        expect(check.board).toBe("MATEKF405");
        expect(check.boardMismatch).toBe(true);
    });

    it("demande confirmation pour un fichier local quand la carte n'est pas lue (mode DFU) (recontrôle Fable N8)", () => {
        const name = "trueglide_2026.6.2_STM32F405_SPEEDYBEEF405MINI.hex";
        // carte lue : même carte, rien ; autre carte, « mismatch »
        expect(boardConfirmationNeeded(checkTrueGlideFirmwareFile(name, "SPEEDYBEEF405MINI"), { isLocal: true, live: true })).toBe(null);
        expect(boardConfirmationNeeded(checkTrueGlideFirmwareFile(name, "MATEKF405"), { isLocal: true, live: true })).toBe("mismatch");
        // DFU : aucune carte lue ; le nom gardé d'une connexion précédente n'est pas utilisé
        expect(boardConfirmationNeeded(checkTrueGlideFirmwareFile(name, ""), { isLocal: true, live: false })).toBe("unknown");
        // fichier en ligne : choisi pour la carte dans la liste, rien à demander
        expect(boardConfirmationNeeded(checkTrueGlideFirmwareFile(name, ""), { isLocal: false, live: false })).toBe(null);
    });

    it("ne compare pas la carte quand le nom ne contient pas de carte", () => {
        expect(checkTrueGlideFirmwareFile("trueglide_2026.6.2.hex", "MATEKF405").boardMismatch).toBe(false);
        expect(checkTrueGlideFirmwareFile("firmware.hex", "MATEKF405").boardMismatch).toBe(false);
    });
});

describe("TrueGlide mise à jour en ligne", () => {
    const hex = ":020000040800F2\r\n:00000001FF\r\n";
    const bytes = Buffer.from(hex, "ascii");
    const entry = {
        model: "STANDARD",
        version: "2026.6.2",
        mcu: "STM32F405",
        board: "SPEEDYBEEF405MINI",
        file: "STANDARD/trueglide_2026.6.2_STM32F405_SPEEDYBEEF405MINI.hex.gz",
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const manifest = {
        format: 1,
        version: "2026.6.2",
        revision: "c47d196f3",
        date: "2026-10-12",
        files: [entry, { ...entry, model: "TRUENAV", file: "TRUENAV/../../etc.hex.gz" }, { board: "X" }],
    };
    const fakeFetch = (routes) => async (url) => {
        const body = routes[url];
        return body === undefined
            ? new Response("", { status: 404 })
            : new Response(typeof body === "string" ? body : new Uint8Array(body));
    };
    const base = "https://exemple.test/firmware/";

    it("lit le manifeste et écarte les entrées incomplètes ou hors du dossier", () => {
        const index = parseFirmwareIndex(manifest);
        expect(index.files).toEqual([entry]);
        expect(indexBoards(index)).toEqual(["SPEEDYBEEF405MINI"]);
        expect(findFirmware(index, "speedybeef405mini", "STANDARD")).toEqual(entry);
        expect(findFirmware(index, "SPEEDYBEEF405MINI", "TRUENAV")).toBeNull();
        expect(() => parseFirmwareIndex({ format: 2 })).toThrow();
    });

    it("garde une carte dont le nom contient un tiret", () => {
        const luxEntry = {
            ...entry,
            mcu: "STM32G474",
            board: "LUXHDAIO-G4",
            file: "STANDARD/trueglide_2026.6.2_STM32G474_LUXHDAIO-G4.hex.gz",
        };
        const index = parseFirmwareIndex({ ...manifest, files: [luxEntry] });
        expect(findFirmware(index, "LUXHDAIO-G4", "STANDARD")).toEqual(luxEntry);
    });

    it("compare la révision installée (7 caractères) à la révision publiée (9)", () => {
        const index = parseFirmwareIndex(manifest);
        expect(installedStatus(index, { isTrueGlide: true, revision: "c47d196" })).toBe("current");
        expect(installedStatus(index, { isTrueGlide: true, revision: "0355fa9" })).toBe("update");
        expect(installedStatus(index, { isTrueGlide: false, revision: "c47d196" })).toBe("other");
        expect(installedStatus(index, { isTrueGlide: true, revision: "" })).toBe("other");
    });

    it("reconnaît le modèle installé", () => {
        expect(modelFromBuildOptions(["USE_GPS", "USE_FLIGHT_PLAN"])).toBe("TRUENAV");
        expect(modelFromBuildOptions(["USE_GPS"])).toBe("STANDARD");
        expect(modelFromBuildOptions(undefined)).toBe("STANDARD");
    });

    it("distingue TRUENAV_LIGHT de TRUENAV par la commande version", () => {
        const line = (name) => [`# ${name} / STM32F405 (S405) 2026.6.2 Oct 13 2026 / 10:00:00 (0142420) MSP API: 1.48`];
        expect(modelFromVersionLines(line("TRUENAV_LIGHT"))).toBe("TRUENAV_LIGHT");
        expect(modelFromVersionLines(line("TRUENAV"))).toBe("TRUENAV");
        expect(modelFromVersionLines(line("TRUEGLIDE"))).toBe("STANDARD");
        expect(modelFromVersionLines(["", ...line("TRUEFLIGHT")])).toBe("STANDARD");
        // plain Betaflight, or no answer: unknown, the build options decide
        expect(modelFromVersionLines(line("Betaflight"))).toBe(null);
        expect(modelFromVersionLines([])).toBe(null);
        expect(modelFromVersionLines(undefined)).toBe(null);
    });

    it("télécharge, décompresse et vérifie le firmware", async () => {
        const fetchImpl = fakeFetch({
            [`${base}index.json`]: JSON.stringify(manifest),
            [`${base}${entry.file}`]: gzipSync(bytes),
        });
        const index = await fetchFirmwareIndex({ fetchImpl, baseUrl: base });
        const firmware = await downloadFirmware(index.files[0], { fetchImpl, baseUrl: base });
        expect(firmware).toEqual({ name: "trueglide_2026.6.2_STM32F405_SPEEDYBEEF405MINI.hex", text: hex });
    });

    it("refuse un fichier abîmé ou absent", async () => {
        const abime = Buffer.from(hex.replace("F2", "F3"), "ascii");
        const fetchImpl = fakeFetch({ [`${base}${entry.file}`]: gzipSync(abime) });
        await expect(downloadFirmware(entry, { fetchImpl, baseUrl: base })).rejects.toThrow(/somme de contrôle/);
        await expect(fetchFirmwareIndex({ fetchImpl, baseUrl: base })).rejects.toThrow(/404/);
    });
});
