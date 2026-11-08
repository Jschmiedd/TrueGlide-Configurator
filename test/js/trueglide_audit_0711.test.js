// TrueGlide : audit indépendant du 07/11/2026 (F4 à F7).
import { describe, it, expect, vi, afterEach } from "vitest";
import MSPCodes from "../../src/js/msp/MSPCodes.js";
import { forbiddenWrite, allowedWriteCodes, FORBIDDEN_CODE_NUMBERS } from "../../src/js/trueglide/offline/safety.js";
import { riskyChanges, RISKY_MSP_NAMES } from "../../src/js/trueglide/write_guard.js";
import { sameBoard } from "../../src/js/trueglide/offline/identity.js";
import { attachEscFrame, detachEscFrame, requestEscRelease } from "../../src/js/trueglide/esc_tab.js";

describe("F4 : carte hors ligne, écritures immédiates ou permanentes refusées", () => {
    it("245 (passerelle ESC), 248, 249, 201, 209, 211 et les autres codes immédiats ne passent jamais", () => {
        const allowed = allowedWriteCodes(MSPCodes);
        for (const code of [245, 248, 249, 201, 209, 211, 214, 200, 68, 246, 250, 72, 205, 206]) {
            expect(allowed.has(code)).toBe(false);
            expect(forbiddenWrite([{ code, payload: "00" }], MSPCodes)).not.toBeNull();
        }
    });
    it("même si le nom change dans MSPCodes, le numéro reste refusé", () => {
        const renamed = { ...MSPCodes, MSP_SET_SOMETHING_NEW: 245 };
        delete renamed.MSP_SET_4WAY_IF;
        expect(allowedWriteCodes(renamed).has(245)).toBe(false);
        expect([...FORBIDDEN_CODE_NUMBERS]).toContain(245);
    });
    it("les réglages ordinaires passent toujours", () => {
        for (const name of ["MSP_SET_NAME", "MSP_SET_PID", "MSP_SET_FAILSAFE_CONFIG", "MSP_SET_RC_TUNING"]) {
            expect(forbiddenWrite([{ code: MSPCodes[name], payload: "0102" }], MSPCodes)).toBeNull();
        }
    });
});

describe("F5 et F6 : réglages à risque", () => {
    it("MSP : protocole moteur, orientation du gyro, PID avancés, trims", () => {
        for (const n of [
            "MSP_SET_ADVANCED_CONFIG",
            "MSP_SET_SENSOR_ALIGNMENT",
            "MSP_SET_PID_ADVANCED",
            "MSP_SET_ACC_TRIM",
        ]) {
            expect(RISKY_MSP_NAMES).toContain(n);
        }
    });
    it("CLI : min_command, max_throttle, dshot_idle_value, orientation du gyro, MOTOR_STOP, ports série, perte de signal", () => {
        const cmds = [
            "set min_command = 1100",
            "set max_throttle = 1800",
            "set dshot_idle_value = 900",
            "set gyro_1_sensor_align = CW90",
            "feature -MOTOR_STOP",
            "serial 1 64 115200 57600 0 115200",
            "set ap_rx_loss_policy = CONTINUE",
            "set failsafe_procedure = DROP",
        ];
        const r = riskyChanges(cmds, ["feature MOTOR_STOP", "serial 1 0 115200 57600 0 115200"]);
        expect(r.map((x) => x.command)).toEqual(cmds);
        expect(r.find((x) => x.command === "feature -MOTOR_STOP").before).toBe("feature MOTOR_STOP");
        expect(r.find((x) => x.command.startsWith("serial")).before).toBe("serial 1 0 115200 57600 0 115200");
    });
    it("réglage ordinaire : pas de question", () => {
        expect(riskyChanges(["set osd_vbat_pos = 2112", "set craft_name = TEST"], [])).toEqual([]);
    });
});

describe("F7 : onglet ESC, une seule demande de libération à la fois", () => {
    afterEach(() => detachEscFrame());
    it("deux clics pendant un flash : les deux reçoivent « busy », jamais « timeout »", async () => {
        vi.useFakeTimers();
        const posted = [];
        const frame = { contentWindow: { postMessage: (m) => posted.push(m) } };
        attachEscFrame(frame);
        const origin = "https://jschmiedd.github.io";
        globalThis.dispatchEvent(
            new MessageEvent("message", { origin, data: { source: "trueglide-esc", event: "connected" } }),
        );
        const first = requestEscRelease(3000);
        const second = requestEscRelease(3000);
        expect(posted.length).toBe(1);
        globalThis.dispatchEvent(
            new MessageEvent("message", { origin, data: { source: "trueglide-esc", event: "busy" } }),
        );
        vi.advanceTimersByTime(5000);
        expect(await first).toBe("busy");
        expect(await second).toBe("busy");
        vi.useRealTimers();
    });
});

describe("identité : la cible est comparée", () => {
    const base = {
        uid: "abc",
        nom: "SPEEDYBEEF405MINI",
        cible: "STM32F405",
        firmware: "BTFL 4.5.4",
        api: "1.47.0",
        profil: 0,
        profilRate: 0,
    };
    it("même carte : ok ; autre cible sur la même puce : refusé", () => {
        expect(sameBoard(base, { ...base }).ok).toBe(true);
        expect(sameBoard(base, { ...base, nom: "SPEEDYBEEF405V4" })).toEqual({ ok: false, reason: "carte" });
        expect(sameBoard({ ...base, nom: "" }, { ...base }).ok).toBe(true);
    });
});
