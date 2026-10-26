// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
import { describe, expect, it } from "vitest";
import {
    cliRefused,
    commandsToSend,
    configurationMessage,
    isUsableDiff,
    readStudioMessage,
    resultMessage,
    stateMessage,
    studioOrigin,
    studioTabUrl,
} from "../../src/js/trueglide/studio_tab.js";
import { sidebarItems } from "../../src/components/sidebar/sidebar_items.js";

describe("TrueGlide Studio tab", () => {
    it("shows the Studio page shipped with the software, next to index.html", () => {
        expect(studioTabUrl("https://jschmiedd.github.io/TrueGlide-Configurator/test/")).toBe(
            "https://jschmiedd.github.io/TrueGlide-Configurator/test/studio/index.html",
        );
        expect(studioTabUrl("https://jschmiedd.github.io/TrueGlide-Configurator/app/index.html#studio")).toBe(
            "https://jschmiedd.github.io/TrueGlide-Configurator/app/studio/index.html",
        );
        expect(studioOrigin("http://localhost:4173/")).toBe("http://localhost:4173");
    });

    it("only accepts messages from Studio (same origin, Studio source)", () => {
        const o = "https://jschmiedd.github.io";
        expect(readStudioMessage({ origin: o, data: { source: "trueglide-studio", event: "ready" } }, o)).toEqual({
            event: "ready",
        });
        expect(
            readStudioMessage(
                { origin: o, data: { source: "trueglide-studio", command: "envoyer", id: 3, texte: "set a = 1" } },
                o,
            ),
        ).toEqual({ command: "envoyer", id: "3", texte: "set a = 1" });
        expect(
            readStudioMessage(
                { origin: "https://example.com", data: { source: "trueglide-studio", event: "ready" } },
                o,
            ),
        ).toBeNull();
        expect(readStudioMessage({ origin: o, data: { source: "trueglide-esc", event: "ready" } }, o)).toBeNull();
        expect(
            readStudioMessage({ origin: o, data: { source: "trueglide-studio", command: "envoyer" } }, o),
        ).toBeNull();
        expect(readStudioMessage({ origin: o, data: "texte" }, o)).toBeNull();
        expect(readStudioMessage(null, o)).toBeNull();
    });

    it("tells Studio whether a real board is connected, and the send result", () => {
        expect(stateMessage({ connected: true, offline: false, board: "SPEEDYBEEF405MINI" })).toEqual({
            source: "trueglide-configurator",
            command: "etat",
            connecte: true,
            horsLigne: false,
            carte: "SPEEDYBEEF405MINI",
        });
        expect(resultMessage("c1", 0, "x")).toEqual({
            source: "trueglide-configurator",
            command: "resultat",
            id: "c1",
            ok: false,
            message: "x",
        });
    });

    it("sends only real commands, never save, exit or defaults; spots a refused command", () => {
        expect(
            commandsToSend("# Studio\nserial UART3 2 115200 57600 0 115200\n\nfeature GPS\nsave\ndefaults\nexit"),
        ).toEqual(["serial UART3 2 115200 57600 0 115200", "feature GPS"]);
        expect(cliRefused(["###ERROR IN set: INVALID NAME: x###"])).toMatch(/INVALID/);
        expect(cliRefused(["motor_poles set to 14"])).toBeNull();
    });

    it("gives the diff all to Studio as one text", () => {
        const msg = configurationMessage(["# diff all", "board_name SPEEDYBEEF405MINI\r", "set motor_poles = 14"]);
        expect(msg).toEqual({
            source: "trueglide-configurator",
            command: "configuration",
            texte: "# diff all\nboard_name SPEEDYBEEF405MINI\nset motor_poles = 14",
        });
        expect(configurationMessage(undefined).texte).toBe("");
    });

    it("refuses an empty or failed diff all", () => {
        expect(isUsableDiff(["board_name SPEEDYBEEF405MINI", "set motor_poles = 14"])).toBe(true);
        expect(isUsableDiff(["# version", ""])).toBe(false);
        expect(isUsableDiff(["###ERROR: diff all"])).toBe(false);
        expect(isUsableDiff(null)).toBe(false);
    });

    it("is in the menu with and without a board", () => {
        const item = sidebarItems.find((i) => i.key === "studio");
        expect(item).toMatchObject({ mode: "shared", i18n: "tabStudio" });
    });
});
