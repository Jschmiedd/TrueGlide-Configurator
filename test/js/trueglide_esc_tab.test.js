// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    ESC_TAB_ORIGIN,
    ESC_TAB_URL,
    attachEscFrame,
    detachEscFrame,
    isEscTabHoldingPort,
    readEscMessage,
    requestEscRelease,
} from "../../src/js/trueglide/esc_tab.js";

const msg = (event, origin = ESC_TAB_ORIGIN, source = "trueglide-esc") => ({ origin, data: { source, event } });

describe("TrueGlide ESC tab", () => {
    afterEach(() => {
        detachEscFrame();
        vi.useRealTimers();
    });

    it("shows a fixed version of TrueGlide ESC Configurator", () => {
        expect(ESC_TAB_URL).toBe("https://jschmiedd.github.io/TrueGlide-ESC-Configurator/onglet/v1/");
        expect(ESC_TAB_ORIGIN).toBe("https://jschmiedd.github.io");
    });

    it("only trusts its own messages", () => {
        expect(readEscMessage(msg("connected"))).toBe("connected");
        expect(readEscMessage(msg("connected", "https://autre.example"))).toBeNull();
        expect(readEscMessage(msg("connected", ESC_TAB_ORIGIN, "autre"))).toBeNull();
        expect(readEscMessage(msg("inconnu"))).toBeNull();
    });

    it("asks the tab to release the port and waits for its answer", async () => {
        const post = vi.fn();
        attachEscFrame({ contentWindow: { postMessage: post } });
        expect(await requestEscRelease()).toBe("disconnected"); // not connected: nothing to ask
        globalThis.dispatchEvent(new MessageEvent("message", msg("connected")));
        expect(isEscTabHoldingPort()).toBe(true);
        const answer = requestEscRelease();
        expect(post).toHaveBeenCalledWith({ source: "trueglide-configurator", command: "disconnect" }, ESC_TAB_ORIGIN);
        globalThis.dispatchEvent(new MessageEvent("message", msg("busy")));
        expect(await answer).toBe("busy"); // ESC flash in progress: do not leave
        const again = requestEscRelease();
        globalThis.dispatchEvent(new MessageEvent("message", msg("disconnected")));
        expect(await again).toBe("disconnected");
        expect(isEscTabHoldingPort()).toBe(false);
    });

    it("does not wait forever for a silent tab", async () => {
        vi.useFakeTimers();
        attachEscFrame({ contentWindow: { postMessage: () => {} } });
        globalThis.dispatchEvent(new MessageEvent("message", msg("connected")));
        const answer = requestEscRelease(1000);
        vi.advanceTimersByTime(1000);
        expect(await answer).toBe("timeout");
    });
});
