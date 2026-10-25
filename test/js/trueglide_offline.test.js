// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
import { describe, expect, it } from "vitest";
import MSP from "../../src/js/msp.js";
import MSPCodes from "../../src/js/msp/MSPCodes.js";
import { FrameReader, encodeCli, encodeResponse, hex } from "../../src/js/trueglide/offline/frames.js";
import { OfflineBoard, Recorder, emptyRecording, key, writeCodes } from "../../src/js/trueglide/offline/board.js";
import { parseBoardFile } from "../../src/js/trueglide/offline/store.js";
import { harvestTabs } from "../../src/js/trueglide/offline/harvest_tabs.js";

const u8 = (b) => new Uint8Array(b);

describe("TrueGlide offline: frames", () => {
    it("reads the requests the software sends (MSP v1, v2, CLI)", () => {
        const r = new FrameReader("request");
        const v1 = u8(MSP.encode_message_v1(MSPCodes.MSP_PID, [1, 2]));
        const v2 = u8(MSP.encode_message_v2(MSPCodes.MSP2_COMMON_SERIAL_CONFIG, []));
        const cli = u8(MSP.encode_message_cli("get motor_poles"));
        // en morceaux, comme sur un vrai port
        const all = [...v1, ...v2, ...cli];
        const out = [...r.feed(all.slice(0, 3)), ...r.feed(all.slice(3))];
        expect(out).toEqual([
            { type: "msp", version: 1, code: MSPCodes.MSP_PID, payload: u8([1, 2]) },
            { type: "msp", version: 2, code: MSPCodes.MSP2_COMMON_SERIAL_CONFIG, payload: u8([]) },
            { type: "cli", command: "get motor_poles" },
        ]);
    });

    it("writes responses the software's own decoder accepts (v1, jumbo, v2, error, CLI)", () => {
        const big = u8(Array.from({ length: 300 }, (_, i) => i & 0xff));
        const cases = [
            [1, MSPCodes.MSP_PID, u8([9, 8, 7]), false],
            [1, MSPCodes.MSP_BOXNAMES, big, false],
            [2, MSPCodes.MSP2_COMMON_SERIAL_CONFIG, big, false],
            [1, MSPCodes.MSP_GPS_CONFIG, u8([]), true],
        ];
        for (const [version, code, payload, error] of cases) {
            const r = new FrameReader("response");
            expect(r.feed(encodeResponse(version, code, payload, error))).toEqual([
                { type: "msp", version, code, payload, error },
            ]);
        }
        expect(new FrameReader("response").feed(encodeCli(["motor_poles = 14", "Allowed range: 4 - 255"]))).toEqual([
            { type: "cli", lines: ["motor_poles = 14", "Allowed range: 4 - 255"] },
        ]);
        // décodeur du logiciel : même code, même charge, pas d'erreur de contrôle
        const seen = [];
        MSP.clearListeners();
        MSP.listen((m) => seen.push({ code: m.code, n: m.dataView.byteLength, crc: m.crcError, u: m.unsupported }));
        MSP.read({ data: encodeResponse(1, MSPCodes.MSP_BOXNAMES, big) });
        MSP.read({ data: encodeResponse(2, MSPCodes.MSP2_COMMON_SERIAL_CONFIG, u8([1, 2, 3])) });
        MSP.read({ data: encodeResponse(1, MSPCodes.MSP_GPS_CONFIG, u8([]), true) });
        MSP.clearListeners();
        expect(seen).toEqual([
            { code: MSPCodes.MSP_BOXNAMES, n: 300, crc: false, u: 0 },
            { code: MSPCodes.MSP2_COMMON_SERIAL_CONFIG, n: 3, crc: false, u: 0 },
            { code: MSPCodes.MSP_GPS_CONFIG, n: 0, crc: false, u: 1 },
        ]);
    });
});

describe("TrueGlide offline: harvest and offline board", () => {
    function harvested() {
        const rec = new Recorder();
        rec.sent(u8(MSP.encode_message_v1(MSPCodes.MSP_PID, [])));
        rec.received(encodeResponse(1, MSPCodes.MSP_PID, u8([45, 80, 30])));
        rec.sent(u8(MSP.encode_message_v2(MSPCodes.MSP2_GET_TEXT, [1])));
        rec.received(encodeResponse(2, MSPCodes.MSP2_GET_TEXT, u8([3, 65, 66, 67])));
        rec.sent(u8(MSP.encode_message_v1(MSPCodes.MSP_GPS_CONFIG, [])));
        rec.received(encodeResponse(1, MSPCodes.MSP_GPS_CONFIG, u8([]), true));
        rec.sent(u8(MSP.encode_message_cli("get motor_poles")));
        rec.received(encodeCli(["motor_poles = 14"]));
        return rec.data;
    }

    it("keeps each answer with its request", () => {
        const d = harvested();
        expect(d.msp[key(MSPCodes.MSP_PID, "")]).toBe("2d501e");
        expect(d.msp[key(MSPCodes.MSP2_GET_TEXT, "01")]).toBe("03414243");
        expect(d.unsupported[key(MSPCodes.MSP_GPS_CONFIG, "")]).toBe(true);
        expect(d.cli["get motor_poles"]).toEqual(["motor_poles = 14"]);
    });

    it("answers like the board, keeps writes, never runs live commands", () => {
        const board = new OfflineBoard(harvested(), writeCodes(MSPCodes));
        const resp = new FrameReader("response");
        const ask = (bytes) => {
            const { replies, events } = board.handle(u8(bytes));
            return { out: replies.flatMap((x) => resp.feed(x)), events };
        };
        expect(ask(MSP.encode_message_v1(MSPCodes.MSP_PID, [])).out[0].payload).toEqual(u8([45, 80, 30]));
        expect(hex(ask(MSP.encode_message_v2(MSPCodes.MSP2_GET_TEXT, [1])).out[0].payload)).toBe("03414243");
        expect(ask(MSP.encode_message_v1(MSPCodes.MSP_GPS_CONFIG, [])).out[0].error).toBe(true);
        expect(ask(MSP.encode_message_v1(MSPCodes.MSP_RAW_GPS, [])).out[0].error).toBe(true); // jamais récoltée
        expect(ask(MSP.encode_message_cli("get motor_poles")).out[0].lines).toEqual(["motor_poles = 14"]);
        // écriture : gardée, réponse vide
        const w = ask(MSP.encode_message_v1(MSPCodes.MSP_SET_PID, [50, 80, 30]));
        expect(w.out[0]).toMatchObject({ code: MSPCodes.MSP_SET_PID, error: false });
        ask(MSP.encode_message_cli("set motor_poles = 12"));
        // immédiates : jamais gardées
        ask(MSP.encode_message_v1(MSPCodes.MSP_SET_MOTOR, [0, 0]));
        expect(ask(MSP.encode_message_v1(MSPCodes.MSP_EEPROM_WRITE, [])).events).toEqual(["save"]);
        expect(ask(MSP.encode_message_v1(MSPCodes.MSP_SET_REBOOT, [0])).events).toEqual(["reboot"]);
        expect(ask(MSP.encode_message_cli("defaults")).out[0].lines[0]).toMatch(/impossible hors ligne/);
        expect(board.rec.writes).toEqual([
            { code: MSPCodes.MSP_SET_PID, payload: "32501e" },
            { cli: "set motor_poles = 12" },
        ]);
    });

    it("board file: own format only", () => {
        expect(parseBoardFile(JSON.stringify(emptyRecording())).format).toBe("trueglide-carte");
        expect(() => parseBoardFile("{")).toThrow(/illisible/);
        expect(() => parseBoardFile('{"format":"trueglide-drone"}')).toThrow(/pas un fichier carte/);
    });

    it("harvest opens the board tabs, never the ESC, flash or CLI tabs", () => {
        const items = [
            { key: "dashboard", mode: "connected" },
            { key: "esc", mode: "shared" },
            { key: "ports", mode: "connected" },
            { key: "help_connected", tab: "help", mode: "connected" },
            { key: "cli", mode: "cli" },
            { key: "landing", mode: "disconnected" },
        ];
        expect(harvestTabs(items, ["dashboard", "esc", "ports", "help", "cli"]).map((t) => t.tab)).toEqual([
            "dashboard",
            "ports",
        ]);
    });
});
