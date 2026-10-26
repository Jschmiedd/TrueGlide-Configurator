import { describe, expect, it } from "vitest";
import { dumpDelta, dumpLines } from "../../src/js/trueglide/offline/delta.js";

const REAL = `# dump all
# version
# TRUEGLIDE / STM32F405 (F405) 2026.6.2
batch start
board_name SPEEDYBEEF405MINI
manufacturer_id SPBE
mcu_id 002f00363034511130353532
signature
feature OSD
feature -GPS
serial UART1 131073 115200 57600 0 115200
serial UART3 0 115200 57600 0 115200
resource MOTOR 1 B06
set motor_pwm_protocol = DSHOT300
set craft_name = KarRmen
profile 0
set p_pitch = 58
set p_roll = 55
profile 1
set p_pitch = 53
rateprofile 0
set roll_rc_rate = 180
rateprofile 1
set roll_rc_rate = 16
# restore original profile selection
profile 0
rateprofile 0
batch end
save
# `;

function changer(text, avant, apres) {
    expect(text).toContain(avant);
    return text.replace(avant, apres);
}

describe("carte simulée : commandes à envoyer (dump all)", () => {
    it("rien à envoyer quand les deux cartes sont identiques", () => {
        expect(dumpDelta(REAL, REAL)).toEqual([]);
    });

    it("ignore l'identité de la puce (carte simulée) et les commandes d'enchaînement", () => {
        const sim = changer(REAL, "mcu_id 002f00363034511130353532", "mcu_id 544753494d554c4545000001");
        expect(dumpDelta(REAL, sim)).toEqual([]);
    });

    it("un réglage général : la commande seule", () => {
        const sim = changer(REAL, "set craft_name = KarRmen", "set craft_name = KARRMEN2");
        expect(dumpDelta(REAL, sim)).toEqual(["set craft_name = KARRMEN2"]);
    });

    it("un réglage de profil : le bon profil d'abord, puis le profil actif rétabli", () => {
        const sim = changer(REAL, "set p_pitch = 53", "set p_pitch = 60");
        // la section des profils PID vient avant celle des rates : seul le profil PID est choisi pour ce réglage
        expect(dumpDelta(REAL, sim)).toEqual(["profile 1", "set p_pitch = 60", "profile 0"]);
    });

    it("le profil actif n'est pas pris pour un changement des réglages des autres profils", () => {
        // la vraie carte a le profil 1 actif, la carte simulée le profil 0 : seule la sélection change
        const realP1 = changer(
            REAL,
            "# restore original profile selection\nprofile 0",
            "# restore original profile selection\nprofile 1",
        );
        expect(dumpDelta(realP1, REAL)).toEqual(["profile 0"]);
    });

    it("le même nom de réglage dans un autre profil n'est pas confondu", () => {
        // p_pitch = 58 existe dans le profil 0 de la vraie carte : le mettre dans le profil 1 est un changement
        const sim = changer(REAL, "set p_pitch = 53", "set p_pitch = 58");
        expect(dumpDelta(REAL, sim)).toContain("set p_pitch = 58");
    });

    it("ports, broches et fonctions : la ligne de la carte simulée remplace celle de la vraie", () => {
        let sim = changer(REAL, "serial UART3 0 115200 57600 0 115200", "serial UART3 2 115200 57600 0 115200");
        sim = changer(sim, "feature -GPS", "feature GPS");
        sim = changer(sim, "resource MOTOR 1 B06", "resource MOTOR 1 B07");
        expect(dumpDelta(REAL, sim)).toEqual([
            "feature GPS",
            "serial UART3 2 115200 57600 0 115200",
            "resource MOTOR 1 B07",
        ]);
    });

    it("profil actif changé hors ligne : la sélection finale est envoyée", () => {
        const sim = changer(
            REAL,
            "# restore original profile selection\nprofile 0",
            "# restore original profile selection\nprofile 1",
        );
        expect(dumpDelta(REAL, sim)).toEqual(["profile 1"]);
        const sim2 = changer(sim, "set craft_name = KarRmen", "set craft_name = KARRMEN2");
        expect(dumpDelta(REAL, sim2)).toEqual(["set craft_name = KARRMEN2", "profile 1"]);
    });

    it("lignes d'un dump : sans commentaires ni invite", () => {
        expect(dumpLines("# a\r\nset x = 1\r\n\r\n# ")).toEqual(["set x = 1"]);
    });
});
