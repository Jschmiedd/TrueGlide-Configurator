<template>
    <BaseTab tab-name="firmware_flasher">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabFirmwareFlasher") }}</div>

            <!-- TrueGlide : un seul écran (fichier .hex local ou mise à jour en ligne TrueGlide, puis flash). Pas de
                 compilation en ligne (cloud build Betaflight désactivé). -->
            <div class="flasher-tab-area">
                <OnlineFirmwarePanel
                    :disabled="state.flashingInProgress || state.loadFileButtonDisabled"
                    :on-firmware="handleOnlineFirmware"
                />
                <FlasherFlashTab
                    :state="state"
                    :on-load-firmware="handleLoadFile"
                    :flash-ring-color="flashRingColor"
                    :on-no-reboot-change="handleNoRebootChange"
                    :on-erase-chip-change="handleEraseChipChange"
                    :on-flash-manual-baud-change="handleFlashManualBaudChange"
                    :on-flash-manual-baud-rate-change="handleFlashManualBaudRateChange"
                    :on-restore-backup="handleRestoreBackup"
                />
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <UFieldGroup size="sm" orientation="horizontal" class="flex!">
                <UButton
                    :disabled="state.flashButtonDisabled"
                    :color="state.flashButtonDisabled ? 'neutral' : 'success'"
                    :loading="state.flashingInProgress"
                    @click="handleFlashFirmware"
                >
                    {{ $t("firmwareFlasherFlashFirmware") }}
                </UButton>
                <UDropdownMenu v-slot="{ open }" :items="flashActionMenuItems" :content="{ align: 'end', side: 'top' }">
                    <UButton
                        :color="state.flashButtonDisabled ? 'neutral' : 'success'"
                        :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        :aria-label="$t('firmwareFlasherFlashFirmwareOptions')"
                        square
                    />
                </UDropdownMenu>
            </UFieldGroup>
            <UButton
                size="sm"
                icon="i-lucide-hard-drive-download"
                :disabled="state.loadFileButtonDisabled"
                @click="handleLoadFile"
                >{{ $t("tfFlasherButtonLoadTrueGlide") }}</UButton
            >
        </div>

        <UModal v-model:open="verifyBoardOpen" :close="false" :dismissible="false">
            <template #body>
                <div v-html="verifyBoardContentHtml"></div>
            </template>
            <template #footer>
                <div class="flex justify-end gap-2 w-full">
                    <UButton
                        :label="$t('firmwareFlasherButtonAbort')"
                        variant="outline"
                        @click="handleVerifyBoardAbort"
                    />
                    <UButton :label="$t('firmwareFlasherButtonContinue')" @click="handleVerifyBoardContinue" />
                </div>
            </template>
        </UModal>
    </BaseTab>
</template>

<script>
import { computed, defineComponent, reactive, ref, onMounted, onBeforeUnmount, inject, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import { i18n } from "../../js/localization";
import { useDialog } from "@/composables/useDialog";
import GUI, { TABS } from "../../js/gui";
import { useFirmwareFlashing, cleanUnifiedConfigFile } from "../../composables/useFirmwareFlashing.js";
import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";
import { tracking } from "../../js/Analytics";
import DeviceHandler from "../../js/device_handler";
import { gui_log } from "../../js/gui_log";
import FileSystem from "../../js/FileSystem";
import AutoBackup, { getLastBackupData, resetLastBackupData } from "../../js/utils/AutoBackup.js";
import AutoRestore from "../../js/utils/AutoRestore.js";
import { EventBus } from "../eventBus";
import STM32 from "../../js/protocols/webstm32";
import FC from "../../js/fc";
import FlasherFlashTab from "./firmware-flasher/FlasherFlashTab.vue";
import OnlineFirmwarePanel from "./firmware-flasher/OnlineFirmwarePanel.vue";
import { checkTrueGlideFirmwareFile } from "../../js/trueglide/firmware_source.js";

export default defineComponent({
    name: "FirmwareFlasherTab",
    components: {
        BaseTab,
        FlasherFlashTab,
        OnlineFirmwarePanel,
    },
    setup() {
        // Get $t from Vue i18n if available, otherwise use fallback
        const $t = inject("$t", (key, params) => i18n.getMessage(key, params));
        const dialog = useDialog();

        // Reactive state
        const state = reactive({
            localFirmwareLoaded: false,
            isConfigLocal: false,
            filename: null,
            configFilename: null,
            config: {},
            preFlashingMessage: null,
            preFlashingMessageType: null,
            firmware_type: undefined,
            // Contrôle du nom de fichier TrueGlide (voir js/trueglide/firmware_source.js)
            tfFirmwareCheck: null,
            tfNonTrueGlideConfirmed: false,
            tfBoardMismatchConfirmed: false,
            // UI State - Checkboxes
            noRebootSequence: false,
            flashOnConnect: false,
            eraseChip: false,
            flashManualBaud: false,
            // UI State - Button disabled flags
            flashButtonDisabled: true,
            loadFileButtonDisabled: false,
            dfuExitButtonDisabled: true,
            // UI State - Visibility flags
            flashOnConnectWrapperVisible: false,
            // UI State - Text content
            progressLabelText: "",
            progressLabelClass: "", // "valid", "invalid", "actionRequired"
            firmwareLoadedName: "",
            firmwareLoadedSize: "",
            firmwareLoadedIsLocal: false,
            /** 0–100; drives firmware flash UProgress (replaces native progress element). */
            flashProgressValue: 0,
            // UI State - Input values
            flashManualBaudRate: 256000,
            flashingInProgress: false,
            lastFlashResultText: "",
            lastFlashResultClass: "",
            // Restore-backup lifecycle (post-flash)
            restoreInProgress: false,
            restoreCompleted: false,
        });

        // Verify board dialog refs
        const verifyBoardOpen = ref(false);
        const verifyBoardContentHtml = ref("");
        const verifyBoardOnAcceptCallback = ref(null);
        const verifyBoardOnAbortCallback = ref(null);

        let dfuMonitorInterval = null;

        const logHead = "[FIRMWARE_FLASHER]";

        const FLASH_MESSAGE_TYPES = {
            NEUTRAL: "NEUTRAL",
            VALID: "VALID",
            INVALID: "INVALID",
            ACTION: "ACTION",
            ERASING: "ERASING",
            FLASHING: "FLASHING",
            VERIFYING: "VERIFYING",
        };

        // Helper functions
        const getExtension = (key) => {
            if (!key) {
                return undefined;
            }
            const lower = key.toLowerCase();
            return lower.split("?")[0].split("#")[0].split(".").pop();
        };

        // Flashing state control - update reactive state instead of DOM
        const enableFlashButton = (enabled) => {
            state.flashButtonDisabled = !enabled;
        };

        // Plus de chargement en ligne : conservé comme no-op pour les composables qui l'appellent.
        const enableLoadRemoteFileButton = () => {};

        const enableLoadFileButton = (enabled) => {
            state.loadFileButtonDisabled = !enabled;
        };

        const enableDfuExitButton = (enabled) => {
            state.dfuExitButtonDisabled = !enabled;
        };

        const updateDfuExitButtonState = () => {
            const selectedDevice = DeviceHandler.devicePicker?.selectedDevice || "";
            const hasDfuPortSelected = typeof selectedDevice === "string" && selectedDevice.startsWith("usb");
            enableDfuExitButton(DeviceHandler.dfuAvailable || hasDfuPortSelected);
        };

        const flashingMessage = (message, type) => {
            switch (type) {
                case FLASH_MESSAGE_TYPES.VALID:
                    state.progressLabelClass = "valid";
                    break;
                case FLASH_MESSAGE_TYPES.INVALID:
                    state.progressLabelClass = "invalid";
                    break;
                case FLASH_MESSAGE_TYPES.ACTION:
                    state.progressLabelClass = "actionRequired";
                    break;
                case FLASH_MESSAGE_TYPES.ERASING:
                    state.progressLabelClass = "erasing";
                    break;
                case FLASH_MESSAGE_TYPES.FLASHING:
                    state.progressLabelClass = "flashing";
                    break;
                case FLASH_MESSAGE_TYPES.VERIFYING:
                    state.progressLabelClass = "verifying";
                    break;
                case FLASH_MESSAGE_TYPES.NEUTRAL:
                default:
                    state.progressLabelClass = "";
                    break;
            }
            if (message !== null) {
                state.progressLabelText = message;
            }

            // Capture terminal flash results for persistence (VALID = success, INVALID = failure)
            // Must check flashProgressValue because flashProgress(100) clears flashingInProgress
            // before the final flashingMessage call arrives.
            if (
                (state.flashingInProgress || state.flashProgressValue > 0) &&
                (type === FLASH_MESSAGE_TYPES.VALID || type === FLASH_MESSAGE_TYPES.INVALID)
            ) {
                state.lastFlashResultText = state.progressLabelText;
                state.lastFlashResultClass = state.progressLabelClass;
            }

            return TABS.firmware_flasher;
        };

        const flashProgress = (value) => {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return TABS.firmware_flasher;
            }
            state.flashProgressValue = Math.max(0, Math.min(100, n));
            if (n >= 100) {
                state.flashingInProgress = false;
                GUI.flashingInProgress = false;
            }
            return TABS.firmware_flasher;
        };

        const resetFlashingState = () => {
            state.flashProgressValue = 0;
            state.flashingInProgress = false;
            GUI.flashingInProgress = false;
            enableFlashButton(
                !!firmwareFlashing.getParsedHex() ||
                    !!firmwareFlashing.getUf2Binary() ||
                    !!firmwareFlashing.getEspBinary(),
            );
            updateDfuExitButtonState();
            enableLoadFileButton(true);

            if (firmwareFlashing.getParsedHex() || firmwareFlashing.getUf2Binary() || firmwareFlashing.getEspBinary()) {
                if (state.preFlashingMessage && state.preFlashingMessageType) {
                    flashingMessage(state.preFlashingMessage, state.preFlashingMessageType);
                }
            } else {
                flashingMessage($t("firmwareFlasherFirmwareNotLoaded"), FLASH_MESSAGE_TYPES.NEUTRAL);
            }
        };

        const preservePreFlashingState = () => {
            state.preFlashingMessage = state.progressLabelText;

            if (state.progressLabelClass === "valid") {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.VALID;
            } else if (state.progressLabelClass === "invalid") {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.INVALID;
            } else if (state.progressLabelClass === "actionRequired") {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.ACTION;
            } else {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.NEUTRAL;
            }
        };

        const clearBoardConfig = () => {
            state.config = {};
            state.isConfigLocal = false;
            state.configFilename = null;
        };

        const setBoardConfig = (config, filename) => {
            state.config = config.join("\n");
            const hasFilename = filename !== undefined;
            state.isConfigLocal = hasFilename;
            state.configFilename = hasFilename ? filename : null;
        };

        const clearLoadedFirmwareInfo = () => {
            state.firmwareLoadedName = "";
            state.firmwareLoadedSize = "";
            state.firmwareLoadedIsLocal = false;
            state.tfFirmwareCheck = null;
            state.tfNonTrueGlideConfirmed = false;
        };

        const clearBufferedFirmware = () => {
            clearBoardConfig();
            firmwareFlashing.clearFirmwareState();
            state.firmware_type = undefined;
            state.localFirmwareLoaded = false;
            state.filename = null;
            clearLoadedFirmwareInfo();
            // NOTE: Do not reset the backup here. After a serial flash the board
            // reboots and the device-removed event calls clearBufferedFirmware(),
            // which would wipe the backup needed by the post-flash restore button.
            // The backup is reset when a new flash begins (handleFlashFirmware).
        };

        // Nom de carte connu localement (lu par MSP lors d'une connexion / d'un flash série), sinon vide.
        const getLocalBoardName = () => FC.CONFIG?.boardName || "";

        const refreshTrueGlideCheck = () => {
            if (!state.filename) {
                state.tfFirmwareCheck = null;
                return null;
            }
            state.tfFirmwareCheck = checkTrueGlideFirmwareFile(state.filename, getLocalBoardName());
            return state.tfFirmwareCheck;
        };

        const showLoadedFirmware = (filename, bytes) => {
            state.filename = filename;
            state.firmwareLoadedName = filename;
            state.lastFlashResultText = "";
            state.lastFlashResultClass = "";
            state.firmwareLoadedSize = $t("firmwareFlasherFirmwareSize", { bytes });
            state.firmwareLoadedIsLocal = state.localFirmwareLoaded;
            state.tfNonTrueGlideConfirmed = false;
            state.tfBoardMismatchConfirmed = false;
            refreshTrueGlideCheck();

            flashingMessage(
                $t("firmwareFlasherFirmwareLocalLoaded", { filename, bytes }),
                FLASH_MESSAGE_TYPES.NEUTRAL,
            );
            enableFlashButton(true);

            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, "FirmwareLoaded", {
                firmwareSize: bytes,
                firmwareName: filename,
                firmwareSource: "file",
            });
        };

        /**
         * Demande confirmation avant de flasher un fichier dont le nom n'est pas celui d'un firmware
         * TrueGlide. Une seule confirmation par fichier chargé.
         * @returns {Promise<boolean>} true si le flash peut continuer
         */
        const confirmNonTrueGlideFirmware = async () => {
            const check = refreshTrueGlideCheck();
            if (!check) {
                return true;
            }
            if (!check.isTrueGlide && !state.tfNonTrueGlideConfirmed) {
                const confirmed = await dialog.showYesNo(
                    $t("tfFlasherNotTrueGlideTitle"),
                    $t("tfFlasherNotTrueGlideConfirm", { filename: check.filename }),
                    {
                        yesText: $t("tfFlasherNotTrueGlideFlashAnyway"),
                        noText: $t("cancel"),
                    },
                );
                state.tfNonTrueGlideConfirmed = confirmed === true;
                if (!state.tfNonTrueGlideConfirmed) {
                    return false;
                }
            }
            // TrueGlide: a file for another board than the one connected needs an explicit yes too (not only a banner)
            if (check.boardMismatch && !state.tfBoardMismatchConfirmed) {
                const confirmed = await dialog.showYesNo(
                    $t("tfFlasherBoardMismatchTitle"),
                    $t("tfFlasherBoardMismatchWarning", { fileBoard: check.board, connectedBoard: check.connectedBoard }),
                    {
                        yesText: $t("tfFlasherNotTrueGlideFlashAnyway"),
                        noText: $t("cancel"),
                    },
                );
                state.tfBoardMismatchConfirmed = confirmed === true;
                return state.tfBoardMismatchConfirmed;
            }
            return true;
        };

        const cleanUnifiedConfigFileWrapper = (input) => {
            return cleanUnifiedConfigFile(input, {
                flashingMessage,
                gui_log,
                t: $t,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
            });
        };

        // Initialize UI setup on mount
        const setupUIHandlers = () => {
            // Setup erase chip setting
            let result = getConfig("erase_chip");
            state.eraseChip = result.erase_chip;

            // Setup no reboot setting
            result = getConfig("no_reboot_sequence");
            state.noRebootSequence = result.no_reboot_sequence;
            state.flashOnConnectWrapperVisible = state.noRebootSequence;

            // Setup manual baud rate
            result = getConfig("flash_manual_baud");
            state.flashManualBaud = result.flash_manual_baud;

            result = getConfig("flash_manual_baud_rate");
            state.flashManualBaudRate = result.flash_manual_baud_rate || 256000;

            flashingMessage($t("firmwareFlasherLoadFirmwareFile"), FLASH_MESSAGE_TYPES.NEUTRAL);

            updateDfuExitButtonState();
        };

        const saveFirmware = async () => {
            const fileType = state.firmware_type;
            try {
                const file = await FileSystem.pickSaveFile(
                    state.filename,
                    $t("fileSystemPickerFiles", { typeof: fileType.toUpperCase() }),
                    `.${fileType.toLowerCase()}`,
                );
                if (!file) {
                    return false;
                }

                await FileSystem.writeFile(
                    file,
                    fileType === "UF2" ? firmwareFlashing.getUf2Binary() : firmwareFlashing.getIntelHex(),
                );
                return true;
            } catch (err) {
                console.error(err);
                return false;
            }
        };

        let eventListenerRefs = null;

        const setupEventBusListeners = () => {
            const { detectedUsbDevice, onDeviceRemoved } = firmwareFlashing.setupFlashingEventListeners({
                getFlashOnConnect: () => state.flashOnConnect,
                // Plus de sélection de carte en ligne : rien à réinitialiser côté carte.
                onBoardChange: async () => {},
                clearBufferedFirmware,
                updateDfuExitButtonState,
                initiateFlashing,
                startFlashing,
                logHead,
            });

            EventBus.$on("device-handler:auto-select-usb-device", detectedUsbDevice);
            EventBus.$on("device-handler:device-removed", onDeviceRemoved);

            // Store references for proper cleanup in onBeforeUnmount
            eventListenerRefs = { detectedUsbDevice, onDeviceRemoved };
        };

        onMounted(() => {
            if (GUI.active_tab !== "firmware_flasher") {
                GUI.active_tab = "firmware_flasher";
            }

            // Reset state on tab initialization
            firmwareFlashing.clearFirmwareState();
            state.localFirmwareLoaded = false;
            state.isConfigLocal = false;
            state.lastFlashResultText = "";
            state.lastFlashResultClass = "";
            clearLoadedFirmwareInfo();

            // Setup UI handlers and event bus listeners
            setupUIHandlers();
            setupEventBusListeners();

            // Register this module for backward compatibility
            TABS.firmware_flasher = {
                targets: null,
                validateBuildKey: () => false,
                resetFlashingState,
                preservePreFlashingState,
                flashingMessage,
                flashProgress,
                cleanup,
                FLASH_MESSAGE_TYPES,
                requestDfuPermission,
                get parsed_hex() {
                    return firmwareFlashing.getParsedHex();
                },
                get hex() {
                    return firmwareFlashing.getIntelHex();
                },
                get uf2_binary() {
                    return firmwareFlashing.getUf2Binary();
                },
            };

            GUI.content_ready(function () {});

            // Localize content
            i18n.localizePage();
        });

        const teardownEventBusListeners = () => {
            if (!eventListenerRefs) {
                return;
            }

            EventBus.$off("device-handler:auto-select-usb-device", eventListenerRefs.detectedUsbDevice);
            EventBus.$off("device-handler:device-removed", eventListenerRefs.onDeviceRemoved);
            eventListenerRefs = null;
        };

        onBeforeUnmount(() => {
            teardownEventBusListeners();

            if (dfuMonitorInterval) {
                clearInterval(dfuMonitorInterval);
                dfuMonitorInterval = null;
            }
        });

        const cleanup = (callback) => {
            teardownEventBusListeners();

            if (callback) {
                callback();
            }
        };

        /**
         * Show a dialog prompting the user to grant USB permission for DFU.
         * Called by STM32 protocol when the browser blocks requestDevice()
         * due to missing user gesture. The dialog button provides that gesture.
         */
        const requestDfuPermission = () => {
            const onCancel = () => {
                STM32.handleError();
                enableDfuExitButton(true);
            };

            dialog.openYesNo(
                $t("stm32UsbDfuNotFound"),
                $t("stm32DfuPermissionRequired"),
                async () => {
                    try {
                        const device = await DeviceHandler.dfuProtocol.requestPermission();
                        if (!device) {
                            onCancel();
                        }
                        // handleNewDevice → addedDevice → detectedUsbDevice → startFlashing
                    } catch (e) {
                        console.error(`${logHead} DFU permission request failed:`, e);
                        onCancel();
                    }
                },
                onCancel,
                {
                    yesText: $t("portsSelectPermissionDFU"),
                    noText: $t("dialogClose"),
                },
            );
        };

        // Flashing methods
        const startFlashing = async () => {
            await firmwareFlashing.startFlashing({
                config: state.config,
                clearBoardConfig,
                // Flash HEX options
                eraseChip: state.eraseChip,
                noRebootSequence: state.noRebootSequence,
                flashManualBaud: state.flashManualBaud,
                flashManualBaudRate: state.flashManualBaudRate,
                filename: state.filename,
                resetFlashingState,
                // TrueGlide : quand le nom du fichier donne la carte, le protocole série la compare à la carte lue par
                // MSP juste avant le redémarrage (dialogue de vérification) ; sinon pas de carte à vérifier.
                selectedBoard: state.tfFirmwareCheck?.board ?? undefined,
                localFirmwareLoaded: !state.tfFirmwareCheck?.board,
                showDialogVerifyBoard,
                // UI callbacks
                flashingMessage,
                flashProgress,
                t: $t,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                setFlashOnConnect: (value) => {
                    state.flashOnConnect = value;
                },
                logHead,
            });
        };

        const startBackup = async (callback) => {
            GUI.connect_lock = true;

            const aborted = function (message) {
                GUI.connect_lock = false;
                state.flashingInProgress = false;
                GUI.flashingInProgress = false;
                enableFlashButton(true);
                enableLoadFileButton(true);
                flashingMessage($t(message), FLASH_MESSAGE_TYPES.INVALID);
            };

            const callBackWhenPortAvailable = function () {
                const startTime = Date.now();
                const interval = setInterval(() => {
                    if (DeviceHandler.portAvailable) {
                        clearInterval(interval);
                        callback();
                    } else if (Date.now() - startTime > 5000) {
                        clearInterval(interval);
                        aborted("portsSelectNone");
                    }
                }, 100);
            };

            AutoBackup.execute((result) => {
                GUI.connect_lock = false;
                if (result) {
                    callBackWhenPortAvailable();
                } else {
                    aborted("firmwareFlasherCanceledBackup");
                }
            });
        };

        const initiateFlashing = async () => {
            // Chemin « flasher une fois connecté » : la confirmation n'a peut-être pas encore été donnée.
            if (!(await confirmNonTrueGlideFirmware())) {
                resetFlashingState();
                return;
            }
            await startFlashing();
        };

        const processFirmwareFile = async (file, extension, data) => {
            state.localFirmwareLoaded = true;
            const result = await firmwareFlashing.processFirmware(data, extension, {
                flashingMessage,
                enableFlashButton,
                enableLoadRemoteFileButton,
                showLoadedFirmware,
                t: $t,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                key: file.name,
                logHead,
                isLocalFile: true,
            });
            if (result) {
                state.firmware_type = result.firmwareType;
            }
            enableLoadFileButton(true);
        };

        const processConfigFile = (file, data) => {
            clearBufferedFirmware();
            const config = cleanUnifiedConfigFileWrapper(data);
            if (config === null) {
                return;
            }

            setBoardConfig(config, file.name);

            if (state.isConfigLocal && !firmwareFlashing.getParsedHex()) {
                flashingMessage($t("firmwareFlasherLoadedConfig"), FLASH_MESSAGE_TYPES.NEUTRAL);
                return;
            }

            const shouldEnableFlash =
                (state.isConfigLocal && firmwareFlashing.getParsedHex() && !state.localFirmwareLoaded) ||
                state.localFirmwareLoaded;
            if (shouldEnableFlash) {
                enableFlashButton(true);
                flashingMessage(
                    $t("firmwareFlasherFirmwareLocalLoaded", {
                        filename: file.name,
                        bytes: firmwareFlashing.getParsedHex()?.bytes_total || 0,
                    }),
                    FLASH_MESSAGE_TYPES.NEUTRAL,
                );
            }
        };

        // DFU permission request — moved here from the global ConnectButton dropdown
        const showDfuButton = DeviceHandler.showUsbOption;
        const handleRequestDfuPermission = () => DeviceHandler.requestDevicePermission("usb");

        const handleNoRebootChange = () => {
            setConfig({ no_reboot_sequence: state.noRebootSequence });
            state.flashOnConnectWrapperVisible = state.noRebootSequence;
            if (!state.noRebootSequence) {
                state.flashOnConnect = false;
            }
        };

        const handleEraseChipChange = () => {
            setConfig({ erase_chip: state.eraseChip });
        };

        const handleFlashManualBaudChange = () => {
            setConfig({ flash_manual_baud: state.flashManualBaud });
        };

        const handleFlashManualBaudRateChange = () => {
            const baud = Number.parseInt(state.flashManualBaudRate);
            setConfig({ flash_manual_baud_rate: baud });
        };

        // Click event handlers for buttons
        const handleExitDfu = async () => {
            await firmwareFlashing.exitDfu({
                parsedHex: firmwareFlashing.getParsedHex(),
                dfuExitButtonDisabled: state.dfuExitButtonDisabled,
                connectLock: GUI.connect_lock,
                flashingMessage,
                flashProgress,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                logHead,
            });
        };

        const handleFlashFirmware = async () => {
            if (state.flashButtonDisabled) {
                return;
            }

            // Fichier qui ne semble pas être un firmware TrueGlide : confirmation explicite avant tout flash.
            if (!(await confirmNonTrueGlideFirmware())) {
                return;
            }

            // Reset any previous backup cache before starting a new flash
            resetLastBackupData();

            state.progressLabelText = "";
            state.lastFlashResultText = "";
            state.lastFlashResultClass = "";
            state.restoreInProgress = false;
            state.restoreCompleted = false;
            state.flashingInProgress = true;
            GUI.flashingInProgress = true;
            await nextTick();

            const options = {
                connectLock: GUI.connect_lock,
                firmwareType: state.firmware_type,
                filename: state.filename,
                flashOnConnect: state.flashOnConnect,
                portAvailable: DeviceHandler.portAvailable,
                dfuAvailable: DeviceHandler.dfuAvailable,
                preservePreFlashingState,
                enableFlashButton,
                enableDfuExitButton,
                enableLoadRemoteFileButton,
                enableLoadFileButton,
                flashingMessage,
                flashProgress,
                saveFirmware,
                startFlashing,
                startBackup,
                initiateFlashing,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                t: $t,
                progressCallback: () => {
                    /* callback reserved for future use */
                },
            };

            try {
                await firmwareFlashing.runFlashWorkflow(options);
            } catch (error) {
                state.flashingInProgress = false;
                GUI.flashingInProgress = false;
                throw error;
            }
        };

        // Firmware téléchargé et vérifié par la mise à jour en ligne : chargé comme un fichier local.
        const handleOnlineFirmware = async ({ name, text }) => {
            enableFlashButton(false);
            await processFirmwareFile({ name }, "hex", text);
        };

        // Chargement local d'un firmware TrueGlide (.hex), toujours possible sans Internet.
        const handleLoadFile = async () => {
            if (state.loadFileButtonDisabled) {
                return;
            }

            enableFlashButton(false);
            enableLoadFileButton(false);

            try {
                const file = await FileSystem.pickOpenFile($t("tfFlasherPickerFirmwareFiles"), [".hex"]);

                if (!file) {
                    enableFlashButton(!!firmwareFlashing.getParsedHex());
                    enableLoadFileButton(true);
                    return;
                }

                const extension = getExtension(file.name);

                if (extension === "uf2" || extension === "bin") {
                    const data = await FileSystem.readFileAsBlob(file);
                    await processFirmwareFile(file, extension, data);
                } else if (extension === "hex") {
                    const data = await FileSystem.readFile(file);
                    await processFirmwareFile(file, extension, data);
                } else {
                    const data = await FileSystem.readFile(file);
                    processConfigFile(file, data);
                }
            } catch (error) {
                console.error("Error reading file:", error);
                enableLoadFileButton(true);
            }
        };

        const handleVerifyBoardAbort = () => {
            verifyBoardOpen.value = false;
            const onAbort = verifyBoardOnAbortCallback.value;
            verifyBoardOnAcceptCallback.value = null;
            verifyBoardOnAbortCallback.value = null;
            if (onAbort) {
                onAbort();
            }
        };

        const handleVerifyBoardContinue = () => {
            verifyBoardOpen.value = false;
            const onAccept = verifyBoardOnAcceptCallback.value;
            verifyBoardOnAcceptCallback.value = null;
            verifyBoardOnAbortCallback.value = null;
            if (onAccept) {
                onAccept();
            }
        };

        // Handle restore backup functionality
        const handleRestoreBackup = async () => {
            // Check if there's a backup available
            const backupData = getLastBackupData();
            if (!backupData) {
                dialog.openInfo(
                    $t("warningTitle"),
                    $t("firmwareFlasherNoBackupAvailable"),
                    () => {}, // Empty callback to satisfy onConfirm requirement
                );
                return;
            }

            // Confirmation dialog
            dialog.openYesNo(
                $t("firmwareFlasherRestoreBackupTitle"),
                $t("firmwareFlasherRestoreBackupConfirm"),
                async () => {
                    // Parse backup content into CLI lines
                    const fileLines = backupData.split(/\r?\n/).map((line) => line.trim());

                    // Prepend "defaults nosave" if not present
                    const hasDefaultsNoSave = fileLines.some((line) => line.trim().toLowerCase() === "defaults nosave");
                    const cliLines = hasDefaultsNoSave ? fileLines : ["defaults nosave", ...fileLines];

                    // Set connect lock to prevent tab switching interference
                    GUI.connect_lock = true;
                    state.restoreInProgress = true;

                    // Open wait dialog
                    dialog.openWait($t("firmwareFlasherRestoreBackupTitle"), null);

                    // Execute restore
                    AutoRestore.execute(cliLines, (result) => {
                        dialog.close();
                        GUI.connect_lock = false;
                        state.restoreInProgress = false;

                        if (result.success) {
                            // Hide the restore button — restore already applied and saved.
                            state.restoreCompleted = true;
                            if (result.skipped > 0) {
                                gui_log($t("firmwareFlasherRestoreBackupSuccessSkipped", { count: result.skipped }));
                            } else {
                                gui_log($t("firmwareFlasherRestoreBackupSuccess"));
                            }
                        } else {
                            const errorMsg = result.errors || "Unknown error";
                            gui_log($t("firmwareFlasherRestoreBackupFailed", { 1: errorMsg }));
                            dialog.openInfo(
                                $t("warningTitle"),
                                $t("firmwareFlasherRestoreBackupFailed", { 1: errorMsg }),
                                () => {}, // onConfirm — openInfo's 3rd arg must be a callback, not options
                            );
                        }
                    });
                },
                () => {
                    // No-op for "No" click
                },
            );
        };

        const showDialogVerifyBoard = (selected, verified, onAccept, onAbort) => {
            verifyBoardContentHtml.value = $t("firmwareFlasherVerifyBoard", {
                selected_board: selected,
                verified_board: verified,
            });

            if (!verifyBoardOpen.value) {
                verifyBoardOnAcceptCallback.value = onAccept;
                verifyBoardOnAbortCallback.value = onAbort;
                verifyBoardOpen.value = true;
            }
        };

        const flashActionMenuItems = computed(() => {
            const group = [
                {
                    label: $t("firmwareFlasherFlashFirmware"),
                    icon: "i-lucide-zap",
                    disabled: state.flashButtonDisabled,
                    onSelect: handleFlashFirmware,
                },
                {
                    label: $t("firmwareFlasherExitDfu"),
                    icon: "i-lucide-usb",
                    disabled: state.dfuExitButtonDisabled,
                    onSelect: handleExitDfu,
                },
            ];
            if (showDfuButton) {
                group.push({
                    label: $t("firmwareFlasherFindDfuDevice"),
                    icon: "i-lucide-cpu",
                    onSelect: handleRequestDfuPermission,
                });
            }
            return [group];
        });

        const flashRingColor = computed(() => {
            switch (state.progressLabelClass) {
                case "invalid":
                case "erasing":
                    return "error";
                case "flashing":
                    return "warning";
                case "valid":
                case "verifying":
                    return "success";
                default:
                    return "primary";
            }
        });

        // Initialize firmware flashing composable
        const firmwareFlashing = useFirmwareFlashing({
            flashingMessage,
            flashProgress,
            FLASH_MESSAGE_TYPES,
            $t,
            logHead,
        });

        // Return all public methods and state
        return {
            state,
            flashRingColor,
            flashActionMenuItems,
            FLASH_MESSAGE_TYPES,
            verifyBoardOpen,
            verifyBoardContentHtml,
            // Functions
            enableFlashButton,
            enableLoadFileButton,
            enableDfuExitButton,
            flashingMessage,
            flashProgress,
            resetFlashingState,
            startFlashing,
            cleanup,
            handleNoRebootChange,
            handleEraseChipChange,
            handleFlashManualBaudChange,
            handleFlashManualBaudRateChange,
            handleExitDfu,
            handleFlashFirmware,
            handleLoadFile,
            handleOnlineFirmware,
            handleRequestDfuPermission,
            showDfuButton,
            handleVerifyBoardAbort,
            handleVerifyBoardContinue,
            handleRestoreBackup,
            saveFirmware,
        };
    },
});
</script>

<style scoped lang="less">
.tab-firmware_flasher {
    min-height: 100%;

    .flasher-tab-area {
        min-height: 200px;
    }

    .content_wrapper .flashing-wait {
        min-height: 150px;
        height: 50%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
    }
    .flash-status-message {
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        font-size: 0.85rem;
    }
    .flash-status-error {
        background-color: var(--error-500);
        color: #fff;
    }
    .grid-box-spacer {
        height: 1rem;
    }
    ul {
        li {
            list-style: initial;
            list-style-type: circle;
            margin-left: 30px;
        }
    }
    .options {
        position: relative;
        line-height: 18px;
        text-align: left;
        label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            input {
                margin-right: 0;
            }
            .helpicon {
                float: none;
                margin-left: 3px;
                margin-top: 0;
                display: inline-block;
                align-self: center;
            }
        }
        #flash_manual_baud_rate {
            margin-left: 0.5rem;
        }
    }
    .board-selection-grid {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 0.5rem;
        align-items: start;
    }

    .board-selection-grid .grid-row {
        display: contents;
    }

    .board-selection-grid .grid-row.select-row {
        display: contents;
    }

    .board-selection-grid .grid-row:not(.select-row) {
        display: grid;
        grid-column: 1 / -1;
    }

    .board-selection-grid .build-select,
    .board-selection-grid .board-select,
    .board-selection-grid .firmware-version {
        grid-column: 1;
    }

    .board-selection-grid .help-icon-cell {
        grid-column: 2;
        text-align: center;
        padding-left: 0.5rem;
        padding-right: 0.5rem;
        width: 30px;
    }

    .board-selection-grid .action-button-cell {
        grid-column: 3;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        align-self: center;
    }
    .select-wrapper-simple {
        &.no-board-selected {
            pointer-events: none;
            opacity: 0.5;
        }
    }
    .select-wrapper {
        width: calc(100% - 2rem) !important;
        max-width: 30rem !important;
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: 0.5rem;
        box-sizing: border-box;
        &.no-board-selected {
            pointer-events: none;
            opacity: 0.5;
        }
    }
    .detect-board {
        position: relative;
        top: auto;
        height: auto;
        right: auto;
        z-index: auto;
        pointer-events: all;
        display: flex;
        span {
            padding: 0 0.5rem;
            background-color: var(--primary-500);
            cursor: pointer;
            color: var(--surface-50);
            font-size: 10px;
            border-radius: 999px;
            transition:
                color 200ms,
                background-color 200ms;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        &.disabled {
            pointer-events: none;
            cursor: default;
            span {
                background-color: var(--surface-500);
                color: var(--text);
                cursor: default;
            }
        }
    }

    .select-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        .select-wrapper {
            width: 100% !important;
            max-width: none !important;
        }
        strong {
            font-size: 12px;
        }
    }
    /* Keep help icons inline with multiselects inside Build Configuration */
    .build_configuration .select-group {
        display: grid;
        grid-template-columns: 1fr auto;
        row-gap: 0.25rem;
        align-items: center;
    }
    .build_configuration .select-group > strong {
        grid-column: 1 / -1;
    }
    .build_configuration .select-group .select-wrapper {
        grid-column: 1;
        /* allow help icon to sit alongside; avoid forcing full-width */
        max-width: none !important;
        width: 100% !important;
    }
    .build_configuration .select-group .helpicon {
        grid-column: 2;
        margin-top: 0; /* keep vertically centered */
    }
    .build_configuration {
        .build_configuration_toggle_wrapper {
            display: flex;
            flex-wrap: nowrap;
            align-items: center;
            gap: 0.5rem;
        }
        .spacer_box_title {
            white-space: nowrap;
        }
        #customDefinesInfo {
            width: 100%;
        }
    }

    /* Style multiselect tags for "Other options" selector */
    #optionsInfo :deep(.multiselect__tags) {
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        gap: 4px !important;
    }

    #optionsInfo :deep(.multiselect__tag) {
        background: var(--surface-500) !important;
        color: var(--text) !important;
        font-size: 11px;
        padding: 3px 20px 3px 6px;
        border-radius: 3px;
        display: inline-flex !important;
        align-items: center !important;
    }

    #optionsInfo :deep(.multiselect__tag-icon) {
        &:after {
            color: var(--text) !important;
        }
        &:hover {
            background: var(--surface-600) !important;
        }
    }

    .default_btn {
        width: fit-content;
        padding-top: 0.25rem;
        padding-right: 0.25rem;
        a {
            padding: 0.15rem 0.5rem;
        }
    }

    /* Three-column grid layout for release info */
    .release_info_grid {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 1rem 2rem;
        align-items: center;
    }

    .release_info_grid .info_row {
        display: contents;
    }

    .release_info_grid strong {
        text-align: right;
        white-space: nowrap;
        padding-right: 1rem;
    }

    .release_info_grid span,
    .release_info_grid a {
        text-align: left;
    }

    .release_info_grid .board_support {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        justify-self: start;
    }

    .release_info_grid .board_support a#targetSupportInfoUrl {
        padding: 0 0.5rem;
        background-color: var(--primary-500);
        cursor: pointer;
        color: var(--surface-50);
        font-size: 10px;
        border-radius: 999px;
        transition: all 200ms;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        height: auto;
        line-height: 1.4;
        text-decoration: none;

        &:hover {
            background-color: var(--primary-400);
            transition: all ease 0.2s;
        }

        &:active {
            background-color: var(--primary-500);
            box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
        }
    }

    .release_info_grid .board_support .helpicon {
        margin-top: 0;
        float: none;
        display: inline-block;
        align-self: center;
    }

    /* Waiting overlay shown during flashing */
    .flashing-wait p {
        text-align: center;
        padding: 0 1rem;
        font-size: 14px;
    }

    /* Cloud build info grid */
    .cloud_build_grid {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 1rem 2rem;
        align-items: center;
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border);
    }

    .cloud_build_grid .info_row {
        display: contents;
    }

    .cloud_build_grid strong {
        text-align: right;
        white-space: nowrap;
        padding-right: 1rem;
    }

    .cloud_build_grid a {
        text-align: left;
    }

    .cloud_build_grid .status_wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    #cloudTargetStatus {
        padding-left: 0.5rem;
    }

    .release_info_grid .btn {
        justify-self: start;
    }

    .release_info_grid .btn a.cloud_build_cancel {
        padding: 0 0.5rem;
        background-color: var(--primary-500);
        cursor: pointer;
        color: var(--surface-50);
        font-size: 10px;
        border-radius: 999px;
        transition: all 200ms;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        height: auto;
        line-height: 1.4;
        text-decoration: none;

        &:hover:not(.disabled) {
            background-color: var(--primary-400);
            transition: all ease 0.2s;
        }

        &:active:not(.disabled) {
            background-color: var(--primary-500);
            box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
        }

        &.disabled {
            pointer-events: none;
            cursor: default;
            background-color: var(--surface-500);
            color: var(--text);
        }
    }

    @media all and (max-width: 1455px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr 1fr;
            }
        }
    }
    @media all and (max-width: 991px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr;
            }
        }
    }
    & + .content_toolbar {
        width: fit-content;
    }
    @media all and (max-width: 575px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr;
            }
        }
        .detect-board {
            span {
                height: 18px;
                padding: 0 1rem !important;
                & > div {
                    display: none;
                }
            }
        }
    }
}

:deep(.toolbar_fixed_bottom.content_toolbar) {
    width: fit-content;
}

:deep(.content_toolbar) {
    width: fit-content;
    background-color: var(--surface-300);
    box-shadow: rgba(0, 0, 0, 0.1) 0 -0.5rem 0.5rem;
    display: flex;
    align-items: center;
    justify-content: end;
    gap: 0.5rem;
    padding: 0.75rem 1rem 0.75rem 1rem;
    border-top-left-radius: 1.5rem;
    &::before {
        width: 1.5rem;
        aspect-ratio: 1;
        content: "";
        mask: url(../images/corner.svg);
        background-color: var(--surface-300);
        position: absolute;
        left: -1.5rem;
        bottom: 0;
    }
    .btn {
        a {
            margin-top: 0;
            margin-bottom: 0;
            background-color: var(--primary-500);
            border-radius: 3px;
            border: 1px solid var(--primary-600);
            color: #000;
            float: right;
            font-weight: bold;
            font-size: 12px;
            display: block;
            cursor: pointer;
            transition: all ease 0.2s;
            padding: 0 0.5rem;
            line-height: 28px;
            user-select: none;
            white-space: nowrap;
            &:hover {
                background-color: var(--primary-400);
                transition: all ease 0.2s;
            }
            &:active {
                background-color: var(--primary-500);
                transition: all ease 0s;
                box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
            }
            .helpicon {
                margin-left: 5px;
            }
        }
        a.disabled {
            cursor: default;
            color: var(--surface-900);
            background-color: var(--surface-500);
            border: 1px solid var(--surface-500);
            pointer-events: none;
            opacity: 1;
        }
    }
}

.btn {
    a {
        margin-top: 0;
        margin-bottom: 0;
        background-color: var(--primary-500);
        border-radius: 3px;
        border: 1px solid var(--primary-600);
        color: #000;
        float: right;
        font-weight: bold;
        font-size: 12px;
        display: block;
        cursor: pointer;
        transition: all ease 0.2s;
        padding: 0 0.5rem;
        line-height: 28px;
        user-select: none;
        white-space: nowrap;
        &:hover {
            background-color: var(--primary-400);
            transition: all ease 0.2s;
        }
        &:active {
            background-color: var(--primary-500);
            transition: all ease 0s;
            box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
        }
        &.disabled {
            background-color: var(--surface-500);
            border: 1px solid var(--surface-400);
            color: var(--surface-900);
            cursor: default;
        }
    }
}

.osd-needs-attention {
    :deep(.multiselect__single),
    :deep(.multiselect__placeholder) {
        color: red !important;
    }
}

/* Container management */
.select-wrapper.fixed-width {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 240px;
    max-width: 440px;
    position: relative;
    z-index: 1002; /* Lower than board select, but active state will be above expert options */
}

:deep(.standard-select) {
    min-height: 28px;
    font-size: 12px;
    flex: 1;
    z-index: 1001 !important;
    font-family: "Open Sans", "Segoe UI", Tahoma, sans-serif;
    position: relative;
}

/* Multi Selects */
:deep(.standard-select .multiselect__tags) {
    min-height: 28px;
    padding: 0 30px 0 8px;
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    background: var(--surface-200);
    display: flex;
    align-items: center;
}

:deep(.standard-select .multiselect__single),
:deep(.standard-select .multiselect__input),
:deep(.standard-select .multiselect__placeholder) {
    color: var(--text) !important;
    background: transparent !important;
    line-height: 26px;
    margin-bottom: 0;
}

/* FIX: Hide search text when selection is present */
:deep(.standard-select:not(.multiselect--active) .multiselect__input) {
    opacity: 0 !important;
    position: absolute !important;
}

/* Dropdown list styling */
:deep(.standard-select .multiselect__content-wrapper) {
    position: absolute;
    display: block;
    background: var(--surface-400);
    border: 1px solid var(--surface-600);
    border-top: none;
    z-index: 99999 !important;
    max-height: 250px;
    overflow-y: auto;
    width: 100%;
    left: 0;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.6);
}

:deep(.standard-select .multiselect__option) {
    font-size: 12px !important;
    color: var(--text) !important;
    padding: 8px 12px;
    min-height: 30px;
}

:deep(.standard-select .multiselect__option--highlight) {
    background: var(--surface-300) !important; /* Darker blue for better contrast */
    color: var(--text) !important;
}

/* 1. Reset the internal input to remove borders/outlines */
:deep(.standard-select .multiselect__input) {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    background: transparent !important;
    color: var(--text) !important;
    font-size: 12px !important;
}

/* 2. Target the placeholder text specifically */
:deep(.standard-select .multiselect__placeholder) {
    color: var(--text) !important;
    font-size: 12px !important;
    margin-bottom: 0;
    padding-top: 0;
    line-height: 26px; /* Vertical centering */
    border: none !important;
}

/* 3. Target the native placeholder inside the search input */
:deep(.standard-select .multiselect__input::placeholder) {
    color: var(--text) !important;
    font-size: 12px !important;
    border: none !important;
}

/* 4. Ensure the selected single value matches page font size */
:deep(.standard-select .multiselect__single) {
    font-size: 12px !important;
    line-height: 26px;
    padding: 0 0 0 2px;
    margin-bottom: 0;
}

/* Firmware version dropdown should appear above expert options but below board select when both open */
.select-wrapper.fixed-width :deep(.standard-select.multiselect--active) {
    z-index: 1005 !important; /* Below board select active (100000) but above everything else */
}

.select-wrapper.fixed-width :deep(.standard-select .multiselect__content-wrapper) {
    z-index: 1001 !important;
}

.select-wrapper {
    /* When multiselect is open, enable positioning and high z-index */
    :deep(.standard-select.multiselect--active) {
        position: relative;
        z-index: 10000 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content-wrapper) {
        z-index: 10001 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content) {
        z-index: 10001 !important;
    }
}

.select-wrapper-simple {
    /* When multiselect is open, enable positioning and high z-index */
    :deep(.standard-select.multiselect--active) {
        position: relative;
        z-index: 10000 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content-wrapper) {
        z-index: 10001 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content) {
        z-index: 10001 !important;
    }
}

/* When multiselect is open, increase z-index to be above everything */
:deep(.standard-select.multiselect--active) {
    position: relative;
    z-index: 10000 !important;
}

:deep(.standard-select.multiselect--active .multiselect__content-wrapper) {
    z-index: 10001 !important;
}

:deep(.standard-select.multiselect--active .multiselect__content) {
    z-index: 10001 !important;
}

:deep(.standard-select .multiselect__option--selected) {
    background: var(--surface-300) !important;
    color: var(--text) !important;
    font-weight: normal;
}

:deep(.standard-select .multiselect__option--selected.multiselect__option--highlight) {
    background: var(--surface-500) !important;
    color: var(--surface-50) !important;
}

/* Group headers (Legacy, Supported, etc.) */
:deep(.standard-select .multiselect__option--group) {
    background: var(--surface-600) !important;
    color: var(--text) !important;
    font-size: 10px !important;
    font-weight: bold;
}

/* List styling for recovery and warning text - using :deep to pierce scoped styles */
:deep(.note-text-format ul) {
    list-style: none !important;
    margin-left: 0.5rem !important;
    margin-top: 0.5rem !important;
    margin-bottom: 0.5rem !important;
    padding-left: 0 !important;
}

:deep(.note-text-format li) {
    margin-bottom: 0.25rem !important;
    margin-left: 0 !important;
    padding-left: 1.5em !important; /* space for dash */
    text-indent: -1.5em !important; /* hanging indent so wrapped lines align after dash */
    position: relative;
}

:deep(.note-text-format li::before) {
    content: "– " !important;
    margin-right: 0.5rem !important;
    color: var(--text) !important;
}

/* Unstable firmware dialog content styling */
#dialogUnstableFirmwareAcknowledgement {
    .content {
        margin-bottom: 1rem;

        ul {
            margin: 0.5rem 0;
            padding-left: 1.5rem;
            list-style-type: disc;
        }

        li {
            margin: 0.25rem 0;
            line-height: 1.5;
        }

        strong {
            font-weight: bold;
            color: var(--warning);
        }
    }
}

/* Unstable firmware dialog list styling */
#dialogUnstableFirmwareAcknowledgement {
    :deep(ul) {
        margin-left: 1.5rem;
        margin-top: 0.5rem;
        margin-bottom: 0.5rem;
    }

    :deep(li) {
        list-style: disc;
        margin-bottom: 0.25rem;
        margin-left: 0.5rem;
    }
}
</style>
