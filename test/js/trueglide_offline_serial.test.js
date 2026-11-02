// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import MSPCodes from "../../src/js/msp/MSPCodes.js";
import { hex } from "../../src/js/trueglide/offline/frames.js";
import {
    FUNCTION as F,
    parseSerialConfig,
    recordingSerialProblem,
    serialPortsProblem,
} from "../../src/js/trueglide/offline/serial_rules.js";

const CRSF = 9;
const SBUS = 2;
const USB = { identifier: 20, mask: F.MSP };

describe("Carte hors ligne : ports jugés comme par le firmware (isSerialConfigValid)", () => {
    it("accepte une configuration normale (USB en MSP, récepteur CRSF sur UART2)", () => {
        expect(serialPortsProblem([USB, { identifier: 52, mask: F.RX_SERIAL }], CRSF)).toBe(null);
    });

    it("refuse un USB sans MSP", () => {
        expect(serialPortsProblem([{ identifier: 20, mask: 0 }, { identifier: 51, mask: F.MSP }], CRSF)).toMatch(/USB/);
    });

    it("refuse deux fonctions qui ne se partagent pas (GPS et récepteur sur le même port)", () => {
        expect(serialPortsProblem([USB, { identifier: 53, mask: F.GPS | F.RX_SERIAL }], CRSF)).toMatch(/UART3/);
    });

    it("accepte MSP partagé avec la blackbox ou une télémétrie", () => {
        expect(serialPortsProblem([USB, { identifier: 51, mask: F.MSP | F.BLACKBOX }], CRSF)).toBe(null);
        expect(serialPortsProblem([USB, { identifier: 51, mask: F.MSP | F.TELEMETRY_SMARTPORT }], CRSF)).toBe(null);
    });

    it("récepteur et télémétrie FrSky : seulement avec un récepteur qui le permet (SBUS oui, CRSF non)", () => {
        const port = { identifier: 52, mask: F.RX_SERIAL | F.TELEMETRY_FRSKY_HUB };
        expect(serialPortsProblem([USB, port], SBUS)).toBe(null);
        expect(serialPortsProblem([USB, port], CRSF)).not.toBe(null);
    });

    it("refuse un VTX (MSP) seul, et MSP sur plus de 3 ports", () => {
        expect(serialPortsProblem([USB, { identifier: 54, mask: F.VTX_MSP }], CRSF)).toMatch(/VTX/);
        const msp = (identifier) => ({ identifier, mask: F.MSP });
        expect(serialPortsProblem([USB, msp(51), msp(52), msp(53)], CRSF)).toMatch(/4 ports/);
    });

    it("lit la réponse MSP2_COMMON_SERIAL_CONFIG gardée par la récolte et juge la carte hors ligne", () => {
        // 2 ports : USB (20) MSP, UART3 (53) GPS + récepteur ; 4 vitesses par port
        const port = (id, mask) => [id, mask & 255, (mask >> 8) & 255, (mask >> 16) & 255, (mask >>> 24) & 255, 0, 0, 0, 0];
        const bytes = Uint8Array.from([2, ...port(20, F.MSP), ...port(53, F.GPS | F.RX_SERIAL)]);
        expect(parseSerialConfig(bytes)).toEqual([
            { identifier: 20, mask: F.MSP },
            { identifier: 53, mask: F.GPS | F.RX_SERIAL },
        ]);
        const rec = {
            msp: {
                [`${MSPCodes.MSP2_COMMON_SERIAL_CONFIG}:`]: hex(bytes),
                [`${MSPCodes.MSP_RX_CONFIG}:`]: hex(Uint8Array.from([CRSF, 0, 0])),
            },
        };
        expect(recordingSerialProblem(rec, MSPCodes)).toMatch(/UART3/);
        // récolte sans lecture des ports : rien à juger
        expect(recordingSerialProblem({ msp: {} }, MSPCodes)).toBe(null);
    });

    it("récolte réelle du simulateur (UART1 = 51 en MSP) : acceptée ; ports logiciels 30-39 sans MSP ni récepteur", () => {
        // réponse MSP2_COMMON_SERIAL_CONFIG gardée par une vraie récolte (simulateur Betaflight, 8 UART)
        const sitl =
            "083301000000050400053400000000050400053500000000050400053600000000050400053700000000050400053800000000050400053900000000050400053a0000000005040005";
        const ports = parseSerialConfig(Uint8Array.from(sitl.match(/../g).map((h) => Number.parseInt(h, 16))));
        expect(ports[0]).toEqual({ identifier: 51, mask: F.MSP });
        expect(serialPortsProblem(ports, CRSF)).toBe(null);
        // MSP sur un port logiciel : retiré par le firmware, il ne compte pas
        expect(serialPortsProblem([{ identifier: 30, mask: F.MSP }], CRSF)).toMatch(/aucun port avec MSP/);
        expect(serialPortsProblem([USB, { identifier: 53, mask: F.GPS | F.RX_SERIAL }], CRSF)).toMatch(/UART3/);
    });
});
