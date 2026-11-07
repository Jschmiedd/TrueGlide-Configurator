// TrueGlide : 2e relecture indépendante du 07/11/2026 (point 4). Le VRAI onglet Moteurs (MotorsTab.vue) est monté et
// branché sur une carte simulée qui reproduit le firmware (src/main/drivers/dshot.c : conversion MSP_SET_MOTOR avec le
// mode 3D QUI TOURNE ; msp.c : MSP_MOTOR relu ; enregistrement EEPROM). On regarde ce qui part vers les moteurs et si un
// moteur tourne, pas le texte du code. Cas séparés : test actif, jamais activé, quitter l'onglet, dialogues, armé,
// relecture douteuse, onglet caché, sauvegarde ratée.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import "../../src/js/injected_methods.js";

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// ---------------------------------------------------------------- carte simulée (modèle du firmware, DShot) --------
const STOP = "STOP"; // DSHOT_CMD_MOTOR_STOP
const board = {
    runtime3d: false, // mode 3D qui tourne (featureIsEnabled après readEEPROM)
    stored3d: false, // mode 3D enregistré
    armed: false,
    firmwareResetsOnSave: true, // firmware TrueGlide corrigé (mixerApplySavedMotorConfig) ; false = 24a71eb
    out: [STOP, STOP, STOP, STOP], // motor_disarmed[] en unités DShot (ou STOP)
    setMotorLog: [], // chaque trame MSP_SET_MOTOR reçue (valeurs externes des 4 moteurs)
    spunAt: [], // chaque instant où un moteur a tourné (pour l'historique)
    rpm: [0, 0, 0, 0],
    failSave: false,
    reset() {
        Object.assign(this, {
            runtime3d: false,
            stored3d: false,
            armed: false,
            firmwareResetsOnSave: true,
            out: [STOP, STOP, STOP, STOP],
            setMotorLog: [],
            spunAt: [],
            rpm: [0, 0, 0, 0],
            failSave: false,
        });
    },
    fromExternal(v) {
        v = Math.min(2000, Math.max(1000, v));
        if (this.runtime3d) {
            return v === 1500 ? STOP : v < 1500 ? `arriere:${v}` : `avant:${v}`;
        }
        return v === 1000 ? STOP : `avant:${v}`;
    },
    toExternal(o) {
        if (o === STOP) {
            return this.runtime3d ? 1500 : 1000;
        }
        return Number(o.split(":")[1]);
    },
    spinning() {
        return this.out.some((o) => o !== STOP);
    },
    setMotors(values) {
        this.setMotorLog.push(values.slice(0, 4));
        this.out = values.slice(0, 4).map((v) => this.fromExternal(v));
        if (this.spinning()) {
            this.spunAt.push(this.out.slice());
        }
    },
    eepromWrite() {
        if (this.failSave) {
            throw new Error("sauvegarde interrompue");
        }
        this.runtime3d = this.stored3d;
        if (this.firmwareResetsOnSave) {
            this.out = [STOP, STOP, STOP, STOP];
        }
    },
};

// ---------------------------------------------------------------- MSP branché sur la carte simulée --------------
const fcRef = {};
vi.mock("@/js/msp", () => {
    const answer = (code, data) => {
        const FC = fcRef.FC;
        switch (code) {
            case 104: // MSP_MOTOR
                FC.MOTOR_DATA = [...board.out.map((o) => board.toExternal(o)), 0, 0, 0, 0];
                break;
            case 101: // MSP_STATUS
            case 150: // MSP_STATUS_EX
                FC.CONFIG.mode = board.armed ? 1 : 0;
                break;
            case 139: // MSP_MOTOR_TELEMETRY
                FC.MOTOR_TELEMETRY_DATA.rpm = board.rpm.slice();
                break;
            case 36: // MSP_FEATURE_CONFIG
                FC.FEATURE_CONFIG.features.setMask(board.stored3d ? 1 << 12 : 0);
                break;
            case 37: // MSP_SET_FEATURE_CONFIG : la carte garde ce que l'écran envoie
                board.stored3d = FC.FEATURE_CONFIG.features.isEnabled("3D");
                break;
            case 214: {
                const v = [];
                for (let i = 0; i < data.length; i += 2) {
                    v.push(data[i] | (data[i + 1] << 8));
                }
                board.setMotors(v);
                break;
            }
            default:
                break;
        }
    };
    const MSP = {
        promise: async (code, data) => {
            answer(code, data);
            return {};
        },
        send_message: (code, data, _cb, callback) => {
            answer(code, data || []);
            if (typeof callback === "function") {
                callback();
            }
        },
    };
    return { default: MSP };
});
vi.mock("@/composables/useReboot", () => ({
    useReboot: () => ({
        saveToEeprom: async () => board.eepromWrite(),
        saveAndReboot: async () => board.eepromWrite(),
    }),
}));
vi.mock("@/js/Analytics", () => ({
    tracking: { sendSaveAndChangeEvents: () => {}, EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" } },
}));
vi.mock("@/js/gui", () => ({
    default: {
        interval_add: (name, fn, ms) => setInterval(fn, ms),
        interval_remove: () => {},
        timeout_add: (name, fn, ms) => setTimeout(fn, ms),
        timeout_remove: () => {},
    },
}));
vi.mock("@/js/localization", () => ({ i18n: { getMessage: (k) => k } }));
vi.mock("@/js/msp/MSPHelper", () => ({
    mspHelper: { setArmingEnabled: () => {}, crunch: () => [] },
}));

globalThis.fetch = async () => ({ text: async () => "<svg></svg>" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(ms = 0) {
    await nextTick();
    await wait(ms);
    await nextTick();
}

let app;
let container;
let FC;

async function mountTab({ digital = true } = {}) {
    setActivePinia(createPinia());
    FC = (await import("@/js/fc")).default;
    fcRef.FC = FC;
    FC.resetState();
    FC.CONFIG.apiVersion = "1.47.0";
    FC.CONFIG.mode = 0;
    FC.MOTOR_CONFIG.mincommand = 1000;
    FC.MOTOR_CONFIG.maxthrottle = 2000;
    FC.MOTOR_CONFIG.motor_count = 4;
    FC.MOTOR_CONFIG.use_dshot_telemetry = true;
    FC.MOTOR_3D_CONFIG.neutral = 1460;
    FC.PID_ADVANCED_CONFIG.fast_pwm_protocol = digital ? 6 : 0; // DSHOT600 / PWM
    FC.PID_ADVANCED_CONFIG.motorIdle = 5.5;
    FC.MIXER_CONFIG.mixer = 3; // Quad X
    const Features = (await import("@/js/Features")).default;
    FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);
    FC.FEATURE_CONFIG.features.setMask(board.stored3d ? 1 << 12 : 0);
    const MotorsTab = (await import("../../src/components/tabs/MotorsTab.vue")).default;
    const ui = (await import("@nuxt/ui/vue-plugin")).default;
    container = document.createElement("div");
    document.body.appendChild(container);
    const UApp = (await import("@nuxt/ui/components/App.vue")).default;
    app = createApp({ render: () => h(UApp, null, { default: () => h(MotorsTab) }) });
    app.config.globalProperties.$t = (k) => k;
    app.config.warnHandler = () => {};
    app.use(ui);
    app.mount(container);
    await settle(400); // relecture de l'ouverture : deux lectures séparées de 150 ms
}

function unmountTab() {
    app?.unmount();
    container?.remove();
    app = null;
}

const testSwitch = () => {
    // l'interrupteur « Activer le test des moteurs » : celui de la ligne dont le libellé est motorsEnableControl
    const switches = [...container.querySelectorAll('[role="switch"]')];
    const found = switches.filter((sw) => {
        let e = sw;
        for (let i = 0; i < 4 && e; i++) {
            e = e.parentElement;
            if (e?.textContent?.includes("motorsEnableControl")) {
                return !e.textContent.includes("tfMotorsBenchLimit");
            }
        }
        return false;
    });
    if (found.length !== 1) {
        throw new Error(`interrupteur du test introuvable (${found.length})`);
    }
    return found[0];
};
const masterWheel = () => container.querySelectorAll('[role="slider"]');

const testOn = () => testSwitch().getAttribute("aria-checked") === "true";
async function clickTestSwitch() {
    testSwitch().click();
    await settle(400);
}
async function wheelMaster(times = 1) {
    // dernier curseur = maître
    const sliders = [...container.querySelectorAll('[data-slot="root"]')].filter((e) =>
        e.querySelector('[role="slider"]'),
    );
    const target = sliders.at(-1)?.parentElement ?? masterWheel()[masterWheel().length - 1];
    for (let i = 0; i < times; i++) {
        target.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
        await settle(30);
    }
}
function clickButton(textKey) {
    const b = [...container.querySelectorAll("button")].find((x) => x.textContent.includes(textKey));
    if (!b) {
        throw new Error(`bouton ${textKey} absent`);
    }
    b.click();
}
function set3dOnScreen(on) {
    if (on) {
        FC.FEATURE_CONFIG.features.enable("3D");
    } else {
        FC.FEATURE_CONFIG.features.disable("3D");
    }
}

beforeEach(() => {
    board.reset();
    document.body.innerHTML = "";
});
afterEach(() => {
    unmountTab();
});

describe("onglet Moteurs monté sur une carte simulée (firmware DShot)", () => {
    it("ouverture : rien n'est envoyé aux moteurs", async () => {
        await mountTab();
        expect(board.setMotorLog).toEqual([]);
        expect(board.spinning()).toBe(false);
    });

    it("test actif : curseur levé puis interrupteur coupé -> arrêt 1000 envoyé, moteurs arrêtés", async () => {
        await mountTab();
        await clickTestSwitch();
        expect(testOn()).toBe(true);
        await wheelMaster(2);
        expect(board.spinning()).toBe(true); // le test marche vraiment
        await clickTestSwitch(); // coupé
        await settle(500); // relecture de confirmation
        expect(board.setMotorLog.at(-1)).toEqual([1000, 1000, 1000, 1000]);
        expect(board.spinning()).toBe(false);
        expect(board.setMotorLog.flat().every((v) => v >= 1000 && v <= 1300)).toBe(true); // limite au banc
    });

    for (const [depart, ecran] of [
        [false, true],
        [true, false],
    ]) {
        for (const fixedFw of [true, false]) {
            it(`TG-A1-5 : test utilisé, puis 3D ${ecran ? "coché" : "décoché"} et Sauvegarder (carte ${
                depart ? "en 3D" : "sans 3D"
            }, firmware ${fixedFw ? "corrigé" : "24a71eb"}) -> aucun moteur ne tourne`, async () => {
                board.stored3d = depart;
                board.runtime3d = depart;
                board.firmwareResetsOnSave = fixedFw;
                board.out = [STOP, STOP, STOP, STOP];
                await mountTab();
                await clickTestSwitch();
                await wheelMaster(2);
                await clickTestSwitch();
                await settle(500);
                expect(board.spinning()).toBe(false);
                const before = board.setMotorLog.length;
                set3dOnScreen(ecran);
                await settle(50);
                clickButton("configurationButtonSave");
                await settle(800);
                expect(board.runtime3d).toBe(ecran);
                expect(board.spinning()).toBe(false);
                // les seules trames après le changement : l'arrêt de l'ANCIEN mode, envoyé avant l'enregistrement
                for (const frame of board.setMotorLog.slice(before)) {
                    expect(frame).toEqual(new Array(4).fill(depart ? 1500 : 1000));
                }
            });
        }
    }

    it("test jamais activé : 3D changé puis Sauvegarder -> aucune trame MSP_SET_MOTOR", async () => {
        await mountTab();
        set3dOnScreen(true);
        await settle(50);
        clickButton("configurationButtonSave");
        await settle(800);
        expect(board.setMotorLog).toEqual([]);
        expect(board.spinning()).toBe(false);
    });

    it("carte armée par la radio : test refusé, rien envoyé", async () => {
        board.armed = true;
        await mountTab();
        await clickTestSwitch();
        expect(testOn()).toBe(false);
        await wheelMaster(2); // même en insistant sur le curseur
        expect(board.spinning()).toBe(board.out.some((o) => o !== STOP) && board.setMotorLog.length === 0);
        expect(board.setMotorLog).toEqual([]);
    });

    it("relecture douteuse (moteurs laissés à 1500 sur une carte sans 3D) : test refusé, rien envoyé", async () => {
        board.out = ["avant:1500", "avant:1500", "avant:1500", "avant:1500"];
        await mountTab();
        await clickTestSwitch();
        expect(testOn()).toBe(false);
        await wheelMaster(2); // même en insistant sur le curseur
        expect(board.spinning()).toBe(board.out.some((o) => o !== STOP) && board.setMotorLog.length === 0);
        expect(board.setMotorLog).toEqual([]);
    });

    it("relecture douteuse (tours moteur en télémesure) : test refusé", async () => {
        board.rpm = [0, 1200, 0, 0];
        await mountTab();
        await clickTestSwitch();
        expect(testOn()).toBe(false);
        await wheelMaster(2); // même en insistant sur le curseur
        expect(board.spinning()).toBe(board.out.some((o) => o !== STOP) && board.setMotorLog.length === 0);
        expect(board.setMotorLog).toEqual([]);
    });

    it("onglet caché pendant le test : arrêt envoyé", async () => {
        await mountTab();
        await clickTestSwitch();
        await wheelMaster(2);
        expect(board.spinning()).toBe(true);
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
        await settle(50);
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        expect(board.spinning()).toBe(false);
        expect(board.setMotorLog.at(-1)).toEqual([1000, 1000, 1000, 1000]);
    });

    it("quitter l'onglet pendant le test : arrêt envoyé (valeur relue sur la carte en 3D : 1500)", async () => {
        board.stored3d = true;
        board.runtime3d = true;
        await mountTab();
        await clickTestSwitch();
        await wheelMaster(2);
        expect(board.spinning()).toBe(true);
        unmountTab();
        await settle(20);
        expect(board.spinning()).toBe(false);
        expect(board.setMotorLog.at(-1)).toEqual([1500, 1500, 1500, 1500]);
    });

    it("dialogues moteurs refusés tant que l'arrêt n'est pas relu (carte armée)", async () => {
        board.armed = true;
        await mountTab();
        for (const key of ["motorOutputReorderDialogOpen", "escDshotDirectionDialog-Open"]) {
            const b = [...container.querySelectorAll("button")].find((x) => x.textContent.includes(key));
            b?.click();
            await settle(50);
        }
        expect(board.setMotorLog).toEqual([]);
    });

    it("sauvegarde ratée : aucun repli sur l'écran, arrêt relu ensuite", async () => {
        await mountTab();
        set3dOnScreen(true);
        board.failSave = true;
        await settle(50);
        clickButton("configurationButtonSave");
        await settle(800);
        expect(board.setMotorLog).toEqual([]);
        expect(board.spinning()).toBe(false);
    });
});
