// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
import { describe, expect, it } from "vitest";
import {
    STUDIO_TAB_ORIGIN,
    STUDIO_TAB_URL,
    configurationMessage,
    isUsableDiff,
    readStudioMessage,
} from "../../src/js/trueglide/studio_tab.js";
import { sidebarItems } from "../../src/components/sidebar/sidebar_items.js";

describe("TrueGlide Studio tab", () => {
    it("shows the published Studio page", () => {
        expect(STUDIO_TAB_URL).toBe("https://jschmiedd.github.io/TrueGlide-Configurator/studio/");
        expect(STUDIO_TAB_ORIGIN).toBe("https://jschmiedd.github.io");
    });

    it("only accepts messages from Studio's origin and source", () => {
        expect(
            readStudioMessage({ origin: STUDIO_TAB_ORIGIN, data: { source: "trueglide-studio", event: "ready" } }),
        ).toBe("ready");
        expect(
            readStudioMessage({ origin: "https://example.com", data: { source: "trueglide-studio", event: "ready" } }),
        ).toBeNull();
        expect(
            readStudioMessage({ origin: STUDIO_TAB_ORIGIN, data: { source: "trueglide-esc", event: "ready" } }),
        ).toBeNull();
        expect(readStudioMessage({ origin: STUDIO_TAB_ORIGIN, data: "texte" })).toBeNull();
        expect(readStudioMessage(null)).toBeNull();
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
