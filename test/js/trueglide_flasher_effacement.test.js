// TrueGlide (audit du 08/11/2026, essai TG-A1-7) : « Effacement complet » resté actif a effacé la configuration.
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { initialEraseChip, confirmEraseBeforeFlash, shouldOfferRestore } from "../../src/js/trueglide/flasher_erase.js";

describe("effacement complet : jamais repris, confirmé, restauration proposée", () => {
    it("au départ : toujours non, et l'ancienne valeur mémorisée est effacée", () => {
        const setConfig = vi.fn();
        expect(initialEraseChip(setConfig)).toBe(false);
        expect(setConfig).toHaveBeenCalledWith({ erase_chip: false });
    });
    it("actif : confirmation ; refusée = pas de flash ; inactif : pas de question", () => {
        const ask = vi.fn(() => false);
        expect(confirmEraseBeforeFlash(true, ask)).toBe(false);
        expect(ask).toHaveBeenCalledTimes(1);
        expect(confirmEraseBeforeFlash(true, () => true)).toBe(true);
        const never = vi.fn();
        expect(confirmEraseBeforeFlash(false, never)).toBe(true);
        expect(never).not.toHaveBeenCalled();
    });
    it("restauration proposée seulement après un flash réussi avec effacement et une sauvegarde", () => {
        const ok = {
            erased: true,
            resultClass: "valid",
            backup: "diff all\nset x = 1",
            restoreInProgress: false,
            restoreCompleted: false,
        };
        expect(shouldOfferRestore(ok)).toBe(true);
        expect(shouldOfferRestore({ ...ok, erased: false })).toBe(false);
        expect(shouldOfferRestore({ ...ok, resultClass: "invalid" })).toBe(false);
        expect(shouldOfferRestore({ ...ok, backup: null })).toBe(false);
        expect(shouldOfferRestore({ ...ok, backup: "" })).toBe(false);
        expect(shouldOfferRestore({ ...ok, restoreCompleted: true })).toBe(false);
    });
    it("l'onglet utilise ces règles (pas de mémorisation, confirmation avant le flash, proposition après)", () => {
        const src = fs.readFileSync(
            path.resolve(__dirname, "../../src/components/tabs/FirmwareFlasherTab.vue"),
            "utf8",
        );
        expect(src).toMatch(/state\.eraseChip = initialEraseChip\(setConfig\)/);
        expect(src).not.toMatch(/setConfig\(\{ erase_chip: state\.eraseChip \}\)/);
        expect(src).toMatch(/confirmEraseBeforeFlash\(state\.eraseChip/);
        expect(src).toMatch(/shouldOfferRestore\(/);
    });
});
