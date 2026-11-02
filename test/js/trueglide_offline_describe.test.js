// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import MSPCodes from "../../src/js/msp/MSPCodes.js";
import { describePrepared } from "../../src/js/trueglide/offline/describe.js";

describe("question avant l'envoi des changements préparés", () => {
    it("carte simulée : les commandes du CLI, profil inchangé (essai du 02/11)", () => {
        const rec = {
            carte: { profil: 3, profilRate: 3 },
            simulee: { commandes: ["profile 3", "set p_roll = 66", "set simplified_pids_mode = OFF", "rateprofile 3", "set roll_srate = 55"] },
        };
        const d = describePrepared(rec, MSPCodes);
        expect(d.lignes).toEqual(rec.simulee.commandes);
        expect(d.profils).toBeNull();
    });

    it("carte simulée : profil choisi hors ligne signalé (numéroté comme dans le logiciel)", () => {
        const rec = { carte: { profil: 3, profilRate: 3 }, simulee: { commandes: ["rateprofile 0", "set roll_srate = 55"] } };
        expect(describePrepared(rec, MSPCodes).profils).toEqual({ pid: null, rates: 1 });
    });

    it("réglage d'un autre profil puis retour au profil actif : pas d'alerte", () => {
        const rec = { carte: { profil: 3, profilRate: 3 }, simulee: { commandes: ["profile 0", "set p_roll = 50", "profile 3"] } };
        expect(describePrepared(rec, MSPCodes).profils).toBeNull();
    });

    it("carte qui rejoue la récolte : les écritures par leur nom", () => {
        const rec = { carte: { profil: 0 }, writes: [{ code: MSPCodes.MSP_SET_PID, payload: "" }, { code: MSPCodes.MSP_EEPROM_WRITE, payload: "" }, { cli: "set x = 1" }] };
        expect(describePrepared(rec, MSPCodes).lignes).toEqual(["MSP_SET_PID", "MSP_EEPROM_WRITE", "set x = 1"]);
    });

    it("liste longue coupée, avec le nombre restant", () => {
        const rec = { simulee: { commandes: Array.from({ length: 45 }, (_, i) => `set a${i} = 1`) } };
        const d = describePrepared(rec, MSPCodes);
        expect(d.lignes).toHaveLength(40);
        expect(d.reste).toBe(5);
    });
});
