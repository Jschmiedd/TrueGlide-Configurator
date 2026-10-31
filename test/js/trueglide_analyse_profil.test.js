import { describe, expect, it } from "vitest";
import A from "../../src/js/trueglide/studio/analyse.js";

// Revue Fable 2, n° C2 : « diff all » liste tous les profils ; la valeur actuelle d'un réglage de profil doit être
// celle du profil actif, pas celle du dernier profil listé.
describe("Assistant de réglage, analyse", () => {
    it("lit un réglage de profil dans le profil actif", () => {
        const diff = [
            "# TrueGlide / STM32F405 (S405) 2026.6.2 Oct 12 2026 / 20:00:00 (d53eca0) MSP API: 1.48",
            "profile 1",
            "profile 3",
            "set simplified_pi_gain = 130",
            "# restore original profile selection",
            "profile 1",
            "rateprofile 0",
            "set roll_srate = 70",
            "rateprofile 2",
            "set roll_srate = 50",
            "rateprofile 2",
        ].join("\n");
        const cfg = A.lire(diff);
        const db = { simplified_pi_gain: { default: "100" }, roll_srate: { default: "70" } };
        expect(A.valeur(cfg, "simplified_pi_gain", db)).toBe("100");
        expect(A.valeur(cfg, "roll_srate", db)).toBe("50");
        expect(A.ecarts(cfg, db, [{ nom: "simplified_pi_gain", valeur: "130", pourquoi: "" }])[0].actuel).toBe("100");
    });
});
