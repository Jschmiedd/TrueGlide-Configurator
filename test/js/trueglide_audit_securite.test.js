import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isSettingCommand, forbiddenCommands } from "../../src/js/trueglide/cli_safety.js";
import { forbiddenWrite } from "../../src/js/trueglide/offline/safety.js";
import { OfflineBoard, writeCodes, FORMAT, VERSION } from "../../src/js/trueglide/offline/board.js";
import { parseBoardFile } from "../../src/js/trueglide/offline/store.js";
import MSPCodes from "../../src/js/msp/MSPCodes.js";

// Audit indépendant du 06/11/2026 : constats 1 à 3.
describe("audit 1 : arrêt des moteurs au neutre (3D)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/components/tabs/MotorsTab.vue"), "utf8");
    it("n'envoie jamais minSliderValue comme valeur d'arrêt", () => {
        expect(src).not.toMatch(/motorStopValue:\s*minSliderValue/);
        expect(src).not.toMatch(/stopAllMotors\(\s*minSliderValue/);
        expect(src).not.toMatch(/sendMotorCommand\(new Array\(8\)\.fill\(minSliderValue/);
    });
});

describe("audit 2 : seulement des réglages", () => {
    it("accepte les réglages", () => {
        for (const c of [
            "set p_roll = 45",
            "serial UART2 64 115200 57600 0 115200",
            "feature -GPS",
            "aux 0 0 0 1700 2100 0 0",
            "profile 2",
            "rateprofile 0",
            "batch start",
            "map AETR1234",
            "waypoint 1 0 0 0 0 0 0",
        ]) {
            expect(isSettingCommand(c), c).toBe(true);
        }
    });
    it("refuse les commandes immédiates", () => {
        for (const c of [
            "motor 0 1500",
            "serialpassthrough 1 115200",
            "gpspassthrough",
            "msc",
            "bl",
            "dfu",
            "flash_erase",
            "play_sound 1",
            "save",
            "exit",
            "defaults",
            "reboot",
            "profile",
            "batch go",
            "board_name X",
        ]) {
            expect(isSettingCommand(c), c).toBe(false);
        }
        expect(forbiddenCommands(["set a = 1", "motor 0 2000"])).toEqual(["motor 0 2000"]);
    });
    it("la carte hors ligne ne garde pas une commande moteur", () => {
        const rec = { msp: {}, unsupported: {}, cli: {}, writes: [] };
        const b = new OfflineBoard(rec, writeCodes(MSPCodes));
        b.cli("motor 0 2000");
        b.cli("serialpassthrough 0 115200");
        b.cli("set p_roll = 50");
        expect(rec.writes).toEqual([{ cli: "set p_roll = 50" }]);
    });
});

describe("audit 3 : codes MSP du fichier carte", () => {
    it("refuse un code immédiat ou inconnu", () => {
        expect(forbiddenWrite([{ code: MSPCodes.MSP_SET_MOTOR, payload: "e803" }], MSPCodes)).toBeTruthy();
        expect(forbiddenWrite([{ code: MSPCodes.MSP_EEPROM_WRITE, payload: "" }], MSPCodes)).toBeTruthy();
        expect(forbiddenWrite([{ code: MSPCodes.MSP_SET_PASSTHROUGH, payload: "" }], MSPCodes)).toBeTruthy();
        expect(forbiddenWrite([{ code: MSPCodes.MSP_SET_PID, payload: "zz" }], MSPCodes)).toBeTruthy();
        expect(
            forbiddenWrite([{ code: MSPCodes.MSP_SET_PID, payload: "2d" }, { cli: "set a = 1" }], MSPCodes),
        ).toBeNull();
    });
    it("refuse à l'ouverture un fichier carte avec une commande moteur", () => {
        const f = (writes) =>
            JSON.stringify({ format: FORMAT, version: VERSION, carte: {}, msp: {}, unsupported: {}, cli: {}, writes });
        expect(() => parseBoardFile(f([{ cli: "motor 0 2000" }]), MSPCodes)).toThrow(/pas un réglage/);
        expect(() => parseBoardFile(f([{ code: MSPCodes.MSP_SET_MOTOR, payload: "e803" }]), MSPCodes)).toThrow(
            /pas un réglage/,
        );
        expect(parseBoardFile(f([{ cli: "set p_roll = 50" }]), MSPCodes).writes).toHaveLength(1);
    });
});

import {
    firmwareBaseUrl,
    hexContainsBoardName,
    TRUEGLIDE_FIRMWARE_URL,
} from "../../src/js/trueglide/firmware_source.js";

describe("audit 8 : adresse des firmwares", () => {
    it("ignore l'adresse de remplacement hors d'un serveur local", () => {
        localStorage.setItem("tf_update_url", "https://exemple.invalid/firmware/");
        const host = location.hostname;
        if (host !== "localhost" && host !== "127.0.0.1") {
            expect(firmwareBaseUrl()).toBe(TRUEGLIDE_FIRMWARE_URL);
        } else {
            expect(firmwareBaseUrl()).toBe("https://exemple.invalid/firmware/");
        }
        localStorage.removeItem("tf_update_url");
    });
});

describe("audit 9 : contenu du fichier .hex", () => {
    const bloc = (s) => ({ data: [{ address: 0x8000000, data: [1, 2, ...[...s].map((c) => c.charCodeAt(0)), 0, 7] }] });
    it("trouve le nom de carte terminé par un octet nul", () => {
        expect(hexContainsBoardName(bloc("SPEEDYBEEF405MINI"), "SPEEDYBEEF405MINI")).toBe(true);
        expect(hexContainsBoardName(bloc("SPEEDYBEEF405MINI"), "SPEEDYBEEF405")).toBe(false);
        expect(hexContainsBoardName(bloc("MATEKH743"), "SPEEDYBEEF405MINI")).toBe(false);
        expect(hexContainsBoardName(null, "X")).toBeNull();
    });
});
