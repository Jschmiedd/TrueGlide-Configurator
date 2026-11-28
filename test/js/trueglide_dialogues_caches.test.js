// TrueGlide (audit indépendant du 07/11/2026, M2) : les fenêtres qui font tourner les moteurs (sens de rotation DShot,
// ordre des moteurs) se ferment et arrêtent les moteurs quand la page ou la fenêtre est cachée.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import "../../src/js/injected_methods.js";

const sent = [];
vi.mock("@/js/msp", () => ({
    default: {
        send_message: (code, data) => sent.push({ code, data: [...(data || [])] }),
        promise: async () => ({}),
    },
}));
vi.mock("@/js/localization", () => ({ i18n: { getMessage: (k) => k } }));
vi.mock("@/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot: async () => {} }) }));
globalThis.fetch = async () => ({ text: async () => "<svg></svg>" });

let app;
let container;
const setHidden = (v) => Object.defineProperty(document, "hidden", { configurable: true, get: () => v });

async function monter(Comp, props) {
    setActivePinia(createPinia());
    const closed = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    app = createApp({ render: () => h(Comp, { ...props, onClose: closed }) });
    app.config.globalProperties.$t = (k) => k;
    app.config.warnHandler = () => {};
    app.mount(container);
    await nextTick();
    return closed;
}

afterEach(() => {
    app?.unmount();
    container?.remove();
    setHidden(false);
    sent.length = 0;
});

describe("fenêtres moteurs fermées quand la page est cachée (audit M2)", { timeout: 60000 }, () => {
    it("sens de rotation DShot", async () => {
        const Comp = (await import("../../src/components/dialogs/EscDshotDirectionDialog.vue")).default;
        const closed = await monter(Comp, {
            motorConfig: { escProtocolIsDshot: true, numberOfMotors: 4, motorStopValue: 1000, motorSpinValue: 1055 },
        });
        setHidden(true);
        document.dispatchEvent(new Event("visibilitychange"));
        await nextTick();
        expect(closed).toHaveBeenCalled();
    });
    it("ordre des moteurs", async () => {
        const Comp = (await import("../../src/components/dialogs/MotorOutputReorderingDialog.vue")).default;
        const closed = await monter(Comp, { droneConfiguration: "Quad X", motorStopValue: 1000, motorSpinValue: 1055 });
        setHidden(true);
        document.dispatchEvent(new Event("visibilitychange"));
        await nextTick();
        expect(closed).toHaveBeenCalled();
    });
    it("page visible : la fenêtre reste ouverte", async () => {
        const Comp = (await import("../../src/components/dialogs/MotorOutputReorderingDialog.vue")).default;
        const closed = await monter(Comp, { droneConfiguration: "Quad X", motorStopValue: 1000, motorSpinValue: 1055 });
        setHidden(false);
        document.dispatchEvent(new Event("visibilitychange"));
        await nextTick();
        expect(closed).not.toHaveBeenCalled();
    });
});
