// TrueGlide : essai TG-A1-5 et relecture indépendante du 07/11/2026. Des moteurs ont démarré en changeant le mode 3D
// puis « Sauvegarder », batterie branchée. Ces tests vérifient les VALEURS ENVOYÉES aux moteurs et leur effet dans le
// firmware (copie de src/main/drivers/dshot.c), pas le texte du code.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { reactive, nextTick, effectScope } from "vue";
import { boardStopFromReadback, motorStopValue } from "../../src/js/trueglide/motor_bench.js";
import "../../src/js/injected_methods.js";

// --- firmware (dshot.c) : conversion d'une valeur reçue par MSP_SET_MOTOR, selon le mode 3D QUI TOURNE ---
const STOP = "ARRET";
function dshotFromExternal(v, runtime3d) {
    v = Math.min(2000, Math.max(1000, v));
    if (runtime3d) {
        return v === 1500 ? STOP : v < 1500 ? "arriere" : "avant";
    }
    return v === 1000 ? STOP : "avant";
}
// relecture MSP_MOTOR d'un moteur à l'arrêt (dshotConvertToExternal)
const dshotStopReadback = (runtime3d) => (runtime3d ? 1500 : 1000);

describe("arrêt relu sur la carte (MSP_MOTOR) : arrête vraiment, quel que soit l'écran", () => {
    for (const runtime3d of [false, true]) {
        for (const screen3d of [false, true]) {
            it(`DShot, carte ${runtime3d ? "en 3D" : "sans 3D"}, écran ${screen3d ? "3D coché" : "3D décoché"}`, () => {
                const board = boardStopFromReadback(
                    [
                        dshotStopReadback(runtime3d),
                        dshotStopReadback(runtime3d),
                        dshotStopReadback(runtime3d),
                        dshotStopReadback(runtime3d),
                        0,
                        0,
                        0,
                        0,
                    ],
                    {
                        digital: true,
                        mincommand: 1070,
                        neutral3d: 1460,
                    },
                );
                expect(board).toEqual({ stop: runtime3d ? 1500 : 1000, is3d: runtime3d });
                expect(dshotFromExternal(board.stop, runtime3d)).toBe(STOP);
                // l'ancien calcul (écran) faisait tourner dès que l'écran diffère de la carte : le défaut du 07/11
                const ancien = motorStopValue({ is3d: screen3d, digital: true, mincommand: 1070, neutral3d: 1460 });
                if (screen3d === runtime3d) {
                    expect(dshotFromExternal(ancien, runtime3d)).toBe(STOP);
                } else {
                    expect(dshotFromExternal(ancien, runtime3d)).not.toBe(STOP);
                }
            });
        }
    }
    it("relecture douteuse : null (le test moteurs est alors refusé)", () => {
        const o = { digital: true, mincommand: 1070, neutral3d: 1460 };
        expect(boardStopFromReadback([1000, 1100, 1000, 1000], o)).toBeNull(); // un moteur tourne
        expect(boardStopFromReadback([1200, 1200, 1200, 1200], o)).toBeNull(); // valeur inconnue
        expect(boardStopFromReadback([0, 0, 0, 0], o)).toBeNull();
        expect(boardStopFromReadback(undefined, o)).toBeNull();
    });
    it("PWM : mincommand sans 3D, neutre brut en 3D ; ambigu si égaux", () => {
        expect(boardStopFromReadback([1000, 1000], { digital: false, mincommand: 1000, neutral3d: 1460 })).toEqual({
            stop: 1000,
            is3d: false,
        });
        expect(boardStopFromReadback([1460, 1460], { digital: false, mincommand: 1000, neutral3d: 1460 })).toEqual({
            stop: 1460,
            is3d: true,
        });
        expect(boardStopFromReadback([1460, 1460], { digital: false, mincommand: 1460, neutral3d: 1460 })).toBeNull();
    });
});

// --- composable du test moteurs : ce qui part réellement vers la carte ---
const sent = [];
vi.mock("@/js/msp", () => ({ default: { send_message: (code, buf) => sent.push({ code, buf: [...buf] }) } }));
vi.mock("@/js/msp/MSPCodes", () => ({ default: { MSP_SET_MOTOR: 214, MSP2_SEND_DSHOT_COMMAND: 0x3003 } }));
vi.mock("@/js/msp/MSPHelper", () => ({ mspHelper: { setArmingEnabled: () => {} } }));
vi.mock("@/js/utils/DshotCommand", () => ({
    default: {
        dshotCommandType_e: { DSHOT_CMD_TYPE_BLOCKING: 1 },
        ALL_MOTORS: 255,
        dshotCommands_e: { DSHOT_CMD_MOTOR_STOP: 0 },
    },
}));
vi.mock("@/js/localization", () => ({ i18n: { getMessage: (k) => k } }));
const fakeFC = reactive({ CONFIG: { mode: 0 } });
vi.mock("@/js/fc", () => ({ default: fakeFC }));
vi.mock("@/js/bit", () => ({ bit_check: (v, b) => ((v >> b) & 1) === 1 }));

const motorValuesSent = () => sent.filter((m) => m.code === 214).map((m) => m.buf[0] | (m.buf[1] << 8));

describe("test moteurs : arrêt envoyé dans tous les cas", () => {
    let api;
    let scope;
    beforeEach(async () => {
        sent.length = 0;
        fakeFC.CONFIG.mode = 0;
        const { useMotorTesting } = await import("../../src/composables/motors/useMotorTesting.js");
        scope = effectScope();
        scope.run(() => {
            api = useMotorTesting({ value: false }, () => {}, { value: true }, { value: 1500 });
        });
    });
    it("armement puis désarmement par la radio : l'arrêt part vers la carte (pas seulement à l'écran)", async () => {
        api.motorsTestingEnabled.value = true;
        await nextTick();
        api.sendMotorCommand(new Array(8).fill(1600)); // curseur levé
        sent.length = 0;
        fakeFC.CONFIG.mode = 1; // armé par la radio
        await nextTick();
        expect(motorValuesSent()).toEqual([1500]);
        fakeFC.CONFIG.mode = 0; // désarmé
        await nextTick();
        expect(motorValuesSent()).toEqual([1500, 1500]);
        scope.stop();
    });
    it("les touches Début / Fin coupent le test (et envoient l'arrêt)", async () => {
        api.motorsTestingEnabled.value = true;
        await nextTick();
        sent.length = 0;
        document.dispatchEvent(new KeyboardEvent("keydown", { code: "Home" }));
        await nextTick();
        expect(api.motorsTestingEnabled.value).toBe(false);
        expect(motorValuesSent()).toEqual([1500]);
        scope.stop();
    });
    it("rien n'est envoyé aux moteurs tant que le test n'a pas été activé", async () => {
        expect(api.motorCommandsSent.value).toBe(false);
        expect(motorValuesSent()).toEqual([]);
        api.motorsTestingEnabled.value = true;
        await nextTick();
        expect(api.motorCommandsSent.value).toBe(true);
        scope.stop();
    });
});
