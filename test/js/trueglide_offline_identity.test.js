// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boardIdentity, sameBoard } from "../../src/js/trueglide/offline/identity.js";

describe("TrueGlide hors ligne : carte et profils de la récolte (revue Fable 2, C5)", () => {
    const config = (profile, rateProfile) => ({
        boardName: "SPEEDYBEEF405MINI",
        uid: [1, 2, 3],
        flightControllerIdentifier: "BTFL",
        flightControllerVersion: "2025.12.2",
        apiVersion: "1.47.0",
        profile,
        rateProfile,
    });

    it("garde les profils actifs au moment de la récolte", () => {
        const id = boardIdentity(config(1, 2));
        expect(id.profil).toBe(1);
        expect(id.profilRate).toBe(2);
    });

    it("n'envoie que si les profils actifs sont les mêmes", () => {
        const prepared = boardIdentity(config(1, 2));
        expect(sameBoard(prepared, boardIdentity(config(1, 2)))).toEqual({ ok: true });
        expect(sameBoard(prepared, boardIdentity(config(0, 2)))).toEqual({ ok: false, reason: "profil" });
        expect(sameBoard(prepared, boardIdentity(config(1, 0)))).toEqual({ ok: false, reason: "profil" });
    });

    it("refuse un fichier carte sans profils (récolte ancienne)", () => {
        const old = { ...boardIdentity(config(0, 0)), profil: undefined, profilRate: undefined };
        expect(sameBoard(old, boardIdentity(config(0, 0)))).toEqual({ ok: false, reason: "profil" });
    });

    it("la carte et le firmware passent avant les profils", () => {
        const prepared = boardIdentity(config(0, 0));
        expect(sameBoard(prepared, { ...boardIdentity(config(1, 1)), uid: "x" }).reason).toBe("carte");
        expect(sameBoard(prepared, { ...boardIdentity(config(1, 1)), api: "1.46.0" }).reason).toBe("firmware");
    });
});
