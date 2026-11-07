// TrueGlide (audit du 07/11/2026) : la question « Carte différente » du flasheur nomme la dernière carte connectée au lieu
// de « ? » (le flasheur déconnecte la carte, FC.CONFIG.boardName est alors vide).
import { beforeEach, describe, expect, it } from "vitest";
import { lastBoardLabel, rememberConnectedBoard } from "../../src/js/trueglide/firmware_source.js";

describe("flasheur : dernière carte connectée", () => {
    beforeEach(() => localStorage.clear());
    it("carte lue en ce moment : son nom", () => {
        expect(lastBoardLabel("SPEEDYBEEF405MINI")).toBe("SPEEDYBEEF405MINI");
    });
    it("carte déconnectée : la carte gardée à la dernière connexion", () => {
        rememberConnectedBoard({ board: "SPEEDYBEEF405MINI", model: "TRUEGLIDE" });
        expect(lastBoardLabel("")).toBe("SPEEDYBEEF405MINI");
    });
    it("aucune carte connue : « ? »", () => {
        expect(lastBoardLabel("")).toBe("?");
    });
});
