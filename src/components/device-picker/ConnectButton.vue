<template>
    <!-- TrueGlide: top bar layout, port choice then two round buttons (firmware update, connect) -->
    <div v-if="round" class="tg-connect">
        <div class="tg-connect__port">
            <UDropdownMenu
                :items="menuItems"
                :content="{ align: 'start', side: menuSide }"
                :ui="{ content: 'max-h-96 z-[2100]' }"
            >
                <UButton
                    color="neutral"
                    variant="outline"
                    size="md"
                    icon="i-lucide-usb"
                    trailing-icon="i-lucide-chevrons-up-down"
                    class="tg-connect__select"
                    :ui="{ leadingIcon: 'text-primary' }"
                    :disabled="isConnected || devicePickerDisabled"
                >
                    <span class="sidebar-connect__label">{{ portLabel }}</span>
                </UButton>
            </UDropdownMenu>
            <USwitch
                :model-value="devicePicker.autoConnect"
                size="sm"
                :label="$t('autoConnect')"
                @update:model-value="toggleAutoConnect"
            />
        </div>
        <button type="button" class="tg-connect__round" :disabled="connecting" @click="openFlasher">
            <span class="tg-connect__circle">
                <UIcon name="i-lucide-microchip" />
                <span class="tg-connect__badge"><UIcon name="i-lucide-arrow-down" /></span>
            </span>
            <span class="tg-connect__text">{{ $t("tabFirmwareFlasher") }}</span>
        </button>
        <button
            type="button"
            class="tg-connect__round"
            :class="{ 'is-connected': isConnected, 'is-connecting': connecting }"
            :disabled="devicePickerDisabled && !isConnected"
            @click="isConnected ? onDisconnectClick() : onConnectClick()"
        >
            <span class="tg-connect__circle">
                <UIcon v-if="connecting" name="i-lucide-loader-circle" class="animate-spin" />
                <!-- USB trident logo -->
                <svg v-else class="tg-connect__usb" viewBox="0 0 24 24" aria-hidden="true">
                    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M4 12h14.5" />
                        <path d="M7.5 12l3-4.5h3.2" />
                        <path d="M10 12l3 4.5h2" />
                    </g>
                    <g fill="currentColor">
                        <circle cx="3.6" cy="12" r="2.1" />
                        <path d="M17.6 9.6 22.4 12l-4.8 2.4z" />
                        <rect x="13.4" y="5.9" width="3.2" height="3.2" />
                        <circle cx="16.4" cy="16.5" r="1.7" />
                    </g>
                </svg>
            </span>
            <span class="tg-connect__text">{{
                connecting ? $t("connecting") : isConnected ? $t("disconnect") : $t("connect")
            }}</span>
        </button>
        <ConnectOptionsDialog
            v-model="dialogOpen"
            :mode="dialogMode"
            :initial-version="devicePicker.virtualMspVersion"
            :initial-port-override="devicePicker.portOverride"
            @confirm="onDialogConfirm"
        />
    </div>
    <div v-else class="sidebar-connect">
        <UButton
            v-if="isConnected"
            block
            color="error"
            variant="soft"
            icon="i-lucide-link-2-off"
            :size="size"
            :loading="connecting"
            :title="disconnectLabel"
            @click="onDisconnectClick"
        >
            <span class="sidebar-connect__label">{{ disconnectLabel }}</span>
        </UButton>
        <UFieldGroup v-else :size="size" orientation="horizontal" class="sidebar-connect__group w-full !flex">
            <UButton
                class="sidebar-connect__main"
                block
                color="success"
                variant="soft"
                icon="i-lucide-link-2"
                :loading="connecting"
                :disabled="devicePickerDisabled"
                :title="mainLabel"
                @click="onConnectClick"
            >
                <span class="sidebar-connect__label">{{ mainLabel }}</span>
            </UButton>
            <UDropdownMenu
                v-slot="{ open }"
                :items="menuItems"
                :content="{ align: 'end', side: menuSide }"
                :ui="{ content: 'max-h-96 z-[2100]' }"
            >
                <UButton
                    color="success"
                    variant="soft"
                    :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    square
                    :disabled="devicePickerDisabled"
                    :aria-label="$t('connect')"
                />
            </UDropdownMenu>
        </UFieldGroup>
        <ConnectOptionsDialog
            v-model="dialogOpen"
            :mode="dialogMode"
            :initial-version="devicePicker.virtualMspVersion"
            :initial-port-override="devicePicker.portOverride"
            @confirm="onDialogConfirm"
        />
    </div>
</template>

<script>
import { defineComponent, computed, ref } from "vue";
import { useConnectionStore } from "../../stores/connection";
import DeviceHandler from "../../js/device_handler";
import { connectDisconnect, disconnect } from "../../js/serial_backend";
import { i18n } from "../../js/localization";
import { set as setConfig } from "../../js/ConfigStorage";
import { isExpertModeEnabled } from "../../js/utils/isExpertModeEnabled";
import ConnectOptionsDialog from "./ConnectOptionsDialog.vue";
import GUI from "../../js/gui";
import { loadBoard, parseBoardFile, saveBoard } from "../../js/trueglide/offline/store.js";
import { OFFLINE_PATH } from "../../js/protocols/OfflineBoardSerial.js";

function selectAndConnect(path) {
    DeviceHandler.devicePicker.selectedDevice = path;
    connectDisconnect();
}

function onDialogConfirm({ mode, version, portOverride }) {
    if (mode === "virtual") {
        DeviceHandler.devicePicker.virtualMspVersion = version;
        setConfig({ virtualMspVersion: version });
        selectAndConnect("virtual");
    } else {
        DeviceHandler.devicePicker.portOverride = portOverride;
        setConfig({ portOverride });
        selectAndConnect("manual");
    }
}

function toggleAutoConnect(value) {
    DeviceHandler.devicePicker.autoConnect = value;
    setConfig({ autoConnect: value });
}

export default defineComponent({
    name: "ConnectButton",
    components: { ConnectOptionsDialog },
    props: {
        // TrueGlide: in the top bar the port menu opens downwards
        menuSide: { type: String, default: "top" },
        // TrueGlide: bigger button in the top bar
        size: { type: String, default: "sm" },
        // TrueGlide: top bar layout with round buttons
        round: { type: Boolean, default: false },
    },
    setup() {
        const connectionStore = useConnectionStore();

        const isConnected = computed(() => connectionStore.connectionValid);
        const connecting = computed(() => Boolean(connectionStore.connectingTo));
        const isVirtualMode = computed(() => connectionStore.virtualMode);
        // TrueGlide: offline board (harvested from a real board), refreshed when a harvest is saved or removed
        const offlineVersion = ref(0);
        globalThis.addEventListener?.("trueglide-offline-changed", () => offlineVersion.value++);
        const offlineBoard = computed(() => {
            offlineVersion.value; // dependency
            return loadBoard();
        });
        function openBoardFile() {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json";
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) {
                    return;
                }
                try {
                    saveBoard(parseBoardFile(await file.text()));
                    globalThis.dispatchEvent?.(new Event("trueglide-offline-changed"));
                    selectAndConnect(OFFLINE_PATH);
                } catch (e) {
                    globalThis.alert?.(`${i18n.getMessage("tfOfflineOpenFailed")} ${e.message}`);
                }
            };
            input.click();
        }
        const offlineLabel = computed(() =>
            i18n.getMessage("tfOfflineBoardPort", [offlineBoard.value?.carte?.nom || "?"]),
        );
        const connectedTo = computed(() => connectionStore.connectedTo);

        const disconnectLabel = computed(() => {
            if (isVirtualMode.value) {
                return i18n.getMessage("disconnectVirtual");
            }
            const path = connectedTo.value || "";
            if (path.startsWith("bluetooth")) {
                return i18n.getMessage("disconnectBluetooth");
            }
            if (/^(tcp|ws|wss):\/\//.test(path)) {
                return i18n.getMessage("disconnectManual");
            }
            return i18n.getMessage("disconnect");
        });
        const devicePickerDisabled = computed(() => DeviceHandler.devicePickerDisabled);

        const selectedDevice = computed(() => DeviceHandler.devicePicker.selectedDevice);
        const serialPorts = computed(() => DeviceHandler.currentSerialPorts);
        const usbPorts = computed(() => DeviceHandler.currentUsbPorts);
        const bluetoothPorts = computed(() => DeviceHandler.currentBluetoothPorts);

        const selectedDisplayName = computed(() => {
            const path = selectedDevice.value;
            if (!path || path === "noselection") {
                return null;
            }
            const all = [...serialPorts.value, ...usbPorts.value, ...bluetoothPorts.value];
            return all.find((d) => d.path === path)?.displayName ?? null;
        });

        const mainLabel = computed(() => {
            if (connecting.value) {
                return i18n.getMessage("connecting");
            }
            if (selectedDevice.value === "virtual") {
                return i18n.getMessage("connectVirtual");
            }
            return selectedDisplayName.value ?? i18n.getMessage("connect");
        });

        const dialogOpen = ref(false);
        const dialogMode = ref("virtual");
        const devicePicker = computed(() => DeviceHandler.devicePicker);

        function openConnectDialog(mode) {
            dialogMode.value = mode;
            dialogOpen.value = true;
        }

        function buildDeviceItems() {
            const expertMode = isExpertModeEnabled();
            const devices = [];
            if (DeviceHandler.showSerialOption) {
                for (const d of serialPorts.value) {
                    devices.push({
                        label: d.displayName,
                        icon: "i-lucide-usb",
                        onSelect: () => selectAndConnect(d.path),
                    });
                }
            }
            if (DeviceHandler.showUsbOption) {
                for (const d of usbPorts.value) {
                    devices.push({
                        label: d.displayName,
                        icon: "i-lucide-cpu",
                        onSelect: () => selectAndConnect(d.path),
                    });
                }
            }
            if (DeviceHandler.showBluetoothOption) {
                for (const d of bluetoothPorts.value) {
                    devices.push({
                        label: d.displayName,
                        icon: "i-lucide-bluetooth",
                        onSelect: () => selectAndConnect(d.path),
                    });
                }
            }
            // TrueGlide: a board file saved earlier (or given by someone) becomes the offline board
            devices.push({
                label: i18n.getMessage("tfOfflineOpenFile"),
                icon: "i-lucide-folder-open",
                onSelect: openBoardFile,
            });
            if (offlineBoard.value) {
                devices.push({
                    label: offlineLabel.value,
                    icon: "i-lucide-hard-drive",
                    onSelect: () => selectAndConnect(OFFLINE_PATH),
                });
            }
            if (expertMode && DeviceHandler.showVirtualMode) {
                devices.push({
                    label: i18n.getMessage("portsSelectVirtual"),
                    icon: "i-lucide-flask-conical",
                    onSelect: () => openConnectDialog("virtual"),
                });
            }
            if (expertMode && DeviceHandler.showManualMode) {
                devices.push({
                    label: i18n.getMessage("portsSelectManual"),
                    icon: "i-lucide-keyboard",
                    onSelect: () => openConnectDialog("manual"),
                });
            }
            return devices;
        }

        function buildPermissionItems() {
            const items = [];
            if (DeviceHandler.showSerialOption) {
                items.push({
                    label: i18n.getMessage("portsSelectPermission"),
                    icon: "i-lucide-plug-zap",
                    onSelect: () => DeviceHandler.requestDevicePermission("serial"),
                });
            }
            if (DeviceHandler.showBluetoothOption) {
                items.push({
                    label: i18n.getMessage("portsSelectPermissionBluetooth"),
                    icon: "i-lucide-bluetooth",
                    onSelect: () => DeviceHandler.requestDevicePermission("bluetooth"),
                });
            }
            return items;
        }

        const menuItems = computed(() => {
            const devices = buildDeviceItems();
            const items = devices.length ? [...devices, { type: "separator" }] : [];
            items.push(
                ...buildPermissionItems(),
                { type: "separator" },
                {
                    type: "checkbox",
                    label: i18n.getMessage("autoConnect"),
                    checked: devicePicker.value.autoConnect,
                    onUpdateChecked: toggleAutoConnect,
                    onSelect: (e) => e.preventDefault(),
                },
            );
            return items;
        });

        const portLabel = computed(() => {
            // Once connected, show the port actually in use (the selection may have been reset)
            if (isConnected.value && connectedTo.value === OFFLINE_PATH) {
                return offlineLabel.value;
            }
            if (isConnected.value && connectedTo.value && !isVirtualMode.value) {
                const all = [...serialPorts.value, ...usbPorts.value, ...bluetoothPorts.value];
                return all.find((d) => d.path === connectedTo.value)?.displayName ?? connectedTo.value;
            }
            if (selectedDevice.value === "virtual" || (isConnected.value && isVirtualMode.value)) {
                return i18n.getMessage("portsSelectVirtual");
            }
            if (selectedDevice.value === "manual") {
                return i18n.getMessage("portsSelectManual");
            }
            if (selectedDevice.value === OFFLINE_PATH) {
                return offlineLabel.value;
            }
            return selectedDisplayName.value ?? i18n.getMessage("tgPortChoose");
        });

        // Firmware update: the flasher needs the port free, so a connected board is disconnected first
        function openFlasher() {
            if (isConnected.value || connecting.value) {
                GUI.pendingTab = "firmware_flasher";
                connectDisconnect();
                return;
            }
            import("../../js/tab_switch").then(({ switchTab }) => switchTab("firmware_flasher", { mode: "disconnected" }));
        }

        async function onConnectClick() {
            if (devicePickerDisabled.value) {
                return;
            }

            // Guard against a persisted virtual/manual selection when expert mode is off.
            const gatedModes = ["virtual", "manual"];
            if (!isExpertModeEnabled() && gatedModes.includes(selectedDevice.value)) {
                DeviceHandler.devicePicker.selectedDevice = "noselection";
            }

            if (selectedDevice.value === "noselection") {
                DeviceHandler.selectActivePort();
                if (DeviceHandler.devicePicker.selectedDevice !== "noselection") {
                    connectDisconnect();
                    return;
                }
                await DeviceHandler.requestDevicePermission("serial");
                if (DeviceHandler.devicePicker.selectedDevice !== "noselection") {
                    connectDisconnect();
                }
                return;
            }

            connectDisconnect();
        }

        return {
            isConnected,
            connecting,
            devicePickerDisabled,
            disconnectLabel,
            mainLabel,
            menuItems,
            dialogOpen,
            dialogMode,
            devicePicker,
            onConnectClick,
            onDisconnectClick: disconnect,
            portLabel,
            openFlasher,
            toggleAutoConnect,
            onDialogConfirm,
        };
    },
});
</script>

<style scoped>
.tg-connect {
    display: flex;
    align-items: center;
    gap: 1.25rem;
}
.tg-connect__port {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}
.tg-connect__select {
    width: 16rem;
    justify-content: space-between;
}
.tg-connect__usb {
    width: 1.9rem;
    height: 1.9rem;
}
.tg-connect__round {
    display: flex;
    flex-direction: column;
    align-items: center;
    align-self: flex-start;
    gap: 0.3rem;
    width: 6.5rem;
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--ui-text-muted);
}
.tg-connect__round:disabled {
    opacity: 0.5;
    cursor: default;
}
/* Same look as the TrueGlide badge: dark disc, primary ring and glow */
.tg-connect__circle {
    --tg-ring: var(--ui-primary);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 999px;
    border: 2px solid var(--tg-ring);
    background: radial-gradient(circle at 50% 35%, var(--ui-bg-elevated), var(--ui-bg) 75%);
    color: var(--tg-ring);
    font-size: 1.55rem;
    box-shadow:
        0 0 0.6rem color-mix(in srgb, var(--tg-ring) 45%, transparent),
        inset 0 0 0.5rem color-mix(in srgb, var(--tg-ring) 20%, transparent);
    transition:
        transform 0.12s,
        background 0.12s,
        color 0.12s,
        box-shadow 0.12s;
}
.tg-connect__badge {
    position: absolute;
    right: -0.2rem;
    bottom: -0.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 999px;
    background-color: var(--tg-ring);
    color: var(--ui-bg);
    font-size: 0.85rem;
    border: 2px solid var(--ui-bg);
}
.tg-connect__round:not(:disabled):hover .tg-connect__circle {
    transform: scale(1.06);
    background: var(--tg-ring);
    color: var(--ui-bg);
    box-shadow: 0 0 1rem color-mix(in srgb, var(--tg-ring) 60%, transparent);
}
.tg-connect__round:not(:disabled):hover {
    color: var(--ui-text);
}
.tg-connect__round.is-connecting .tg-connect__circle {
    --tg-ring: var(--ui-warning);
}
.tg-connect__round.is-connected .tg-connect__circle {
    --tg-ring: var(--ui-error);
}
.tg-connect__text {
    min-height: 2.2em;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.1;
    text-align: center;
}
.sidebar-connect {
    padding: 0.5rem 0;
}

.sidebar-connect__group {
    display: flex !important;
    width: 100% !important;
}

.sidebar-connect__main {
    flex: 1 1 0 !important;
    min-width: 0;
}

.sidebar-connect__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

@media (max-width: 1055px) {
    .sidebar-connect {
        display: flex;
        justify-content: center;
    }
    .sidebar-connect__label {
        display: none;
    }
    .sidebar-connect__group {
        width: auto !important;
    }
}

/* Default Nuxt UI `success` soft tint is too pale in light mode — lift the contrast. */
html:not(.dark) .sidebar-connect :deep(button.color-success) {
    background-color: var(--success-400);
    border: 1px solid var(--success-600);
    color: var(--surface-900);
}
html:not(.dark) .sidebar-connect :deep(button.color-success:hover) {
    background-color: var(--success-500);
}

/* Disconnect button (error) styling for light mode - ensure it's red */
html:not(.dark) .sidebar-connect :deep(button.color-error) {
    background-color: var(--error-500);
    border: 1px solid var(--error-600);
    color: var(--surface-50);
}
html:not(.dark) .sidebar-connect :deep(button.color-error:hover) {
    background-color: var(--error-600);
}

/* Disconnect button (error) styling for dark mode - ensure proper contrast */
html.dark .sidebar-connect :deep(button.color-error) {
    background-color: var(--error-500);
    border: 1px solid var(--error-600);
    color: var(--surface-50);
}
html.dark .sidebar-connect :deep(button.color-error:hover) {
    background-color: var(--error-600);
}

.tab_container.reveal .sidebar-connect {
    display: block;
}
.tab_container.reveal .sidebar-connect__label {
    display: inline;
}
.tab_container.reveal .sidebar-connect__group {
    width: 100% !important;
}
</style>
