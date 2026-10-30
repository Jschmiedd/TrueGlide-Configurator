<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
-->
<template>
    <BaseTab tab-name="dashboard">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabDashboard") }}</div>
            <p class="text-sm mb-4">{{ boardLine }}</p>

            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <TrueGlideOfflineBox />
                <UiBox :title="$t('tfDashDrone')">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex flex-col">
                            <span class="text-sm opacity-80">{{ $t("tfDashBattery") }}</span>
                            <span v-if="battery.measured" class="text-2xl font-semibold"
                                >{{ num(battery.voltage) }} V</span
                            >
                            <span v-else class="text-lg">{{ $t("tfDashNotMeasured") }}</span>
                            <span v-if="battery.perCell" class="text-sm opacity-80">
                                {{ $t("tfDashPerCell", { cells: battery.cells, volts: num(battery.perCell) }) }}
                            </span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-sm opacity-80">{{ $t("tfDashLink") }}</span>
                            <span class="text-2xl font-semibold">{{ link }} %</span>
                            <span class="text-sm opacity-80">RSSI</span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-sm opacity-80">GPS</span>
                            <template v-if="gps.present">
                                <span class="text-2xl font-semibold">{{ gps.sats }}</span>
                                <span class="text-sm opacity-80">{{
                                    gps.fix ? $t("tfDashGpsFix") : $t("tfDashGpsNoFix")
                                }}</span>
                            </template>
                            <span v-else class="text-lg">{{ $t("tfDashGpsNone") }}</span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-sm opacity-80">{{ $t("tfDashArming") }}</span>
                            <span v-if="!blockers.length" class="text-xl font-semibold text-(--ui-primary)">
                                {{ $t("tfDashArmReady") }}
                            </span>
                            <span v-else class="text-xl font-semibold text-(--warning-700)">
                                {{ $t("tfDashArmBlocked") }}
                            </span>
                        </div>
                    </div>
                    <ul v-if="blockers.length" class="mt-3 text-sm flex flex-col gap-1">
                        <li v-for="b in blockers" :key="b.name">
                            <strong>{{ b.name }}</strong> : {{ b.text }}
                        </li>
                    </ul>
                </UiBox>

                <UiBox :title="$t('tfDashFeatures')">
                    <p v-if="!features.length" class="text-sm">{{ $t("tfDashFeaturesNone") }}</p>
                    <div v-for="f in features" :key="f.key" class="py-2 border-b border-default last:border-0">
                        <div class="flex justify-between items-center">
                            <span>{{ $t(`tfDashFeature_${f.key}`) }}</span>
                            <UBadge
                                :color="f.on === true ? 'primary' : 'neutral'"
                                :variant="f.on === true ? 'soft' : 'subtle'"
                                :label="featureLabel(f)"
                            />
                        </div>
                        <p v-if="f.warn" class="text-sm text-warning mt-1">{{ $t(f.warn) }}</p>
                    </div>
                    <div class="mt-3">
                        <UButton
                            size="sm"
                            variant="subtle"
                            :label="$t('tfDashOpenTrueGlide')"
                            @click="go('tf_protections')"
                        />
                    </div>
                </UiBox>

                <UiBox :title="$t('tfDashSetup')">
                    <div class="flex items-center gap-3 mb-3">
                        <div class="h-2 flex-1 rounded bg-(--surface-300)">
                            <div class="h-2 rounded bg-(--ui-primary)" :style="{ width: `${progressPct}%` }"></div>
                        </div>
                        <span class="text-sm font-semibold">{{ progress.count }} / {{ progress.total }}</span>
                    </div>
                    <ul class="text-sm flex flex-col gap-1">
                        <li v-for="s in steps" :key="s.tab" class="flex items-center gap-2">
                            <UIcon
                                :name="s.done ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                                :class="s.done ? 'text-(--ui-primary)' : 'opacity-60'"
                            />
                            <a href="#" @click.prevent="go(s.tab)">{{ $t(s.label) }}</a>
                        </li>
                    </ul>
                    <div class="mt-3">
                        <UButton
                            v-if="progress.next"
                            size="sm"
                            :label="$t('tfDashContinue', { step: $t(progress.next.label) })"
                            @click="go(progress.next.tab)"
                        />
                        <span v-else class="text-sm">{{ $t("tfDashSetupDone") }}</span>
                        <UButton
                            v-if="setupProgress.hidden"
                            class="ml-2"
                            size="sm"
                            variant="link"
                            :label="$t('tfGuideShow')"
                            @click="setGuideHidden(false)"
                        />
                    </div>
                </UiBox>

                <UiBox :title="$t('tfDashFirmware')">
                    <p class="text-sm">{{ firmwareLine }}</p>
                    <div class="mt-3 flex flex-wrap items-center gap-2">
                        <UButton
                            size="sm"
                            variant="subtle"
                            icon="i-lucide-cloud-download"
                            :loading="updateBusy"
                            :label="$t('tfOnlineCheck')"
                            @click="checkUpdate"
                        />
                        <UButton
                            v-if="update.entry && update.status !== 'current'"
                            size="sm"
                            icon="i-lucide-zap"
                            :label="$t('tfDashUpdateNow')"
                            @click="startUpdate"
                        />
                    </div>
                    <p v-if="update.text" class="text-sm mt-2">{{ update.text }}</p>
                </UiBox>

                <UiBox :title="$t('tfDashShortcuts')">
                    <div class="grid grid-cols-2 gap-2">
                        <UButton block :label="$t('tabTrueGlideTune')" @click="go('trueglide_tune')" />
                        <UButton
                            block
                            color="neutral"
                            variant="subtle"
                            :label="$t('tfDashBackup')"
                            :loading="backupBusy"
                            @click="backup"
                        />
                        <UButton
                            block
                            color="neutral"
                            variant="subtle"
                            :label="$t('tabBlackboxViewer')"
                            @click="go('blackbox_viewer', 'shared')"
                        />
                        <UButton block color="neutral" variant="subtle" :label="$t('tfDocsMemo')" @click="openMemo" />
                    </div>
                    <p v-if="backupMessage" class="text-sm mt-2">{{ backupMessage }}</p>
                </UiBox>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "@/components/elements/UiBox.vue";
import TrueGlideOfflineBox from "@/components/trueglide/TrueGlideOfflineBox.vue";
import FC from "@/js/fc";
import { i18n } from "@/js/localization";
import { have_sensor } from "@/js/sensor_helpers";
import { send, readDumpAll, isMspCliSupported } from "@/composables/useMspCliSession";
import { GET_COMMANDS, parseGet } from "@/js/trueglide/settings";
import { parsePinio } from "@/js/trueglide/camera_power";
import { MEMO_PAGE, requestDocsPage } from "@/js/trueglide/docs";
import { SETUP_STEPS, armingBlockers, batteryInfo, rssiPercent, trueglideStatus } from "@/js/trueglide/dashboard";
import { setupProgress, loadSetupProgress, currentProgress, setGuideHidden } from "@/js/trueglide/setup_progress";
import {
    fetchFirmwareIndex,
    findFirmware,
    installedStatus,
    modelFromBuildOptions,
    modelFromVersionLines,
    rememberConnectedBoard,
    requestFirmwareUpdate,
} from "@/js/trueglide/firmware_source";
import GUI from "@/js/gui";

const battery = ref({ measured: false });
const link = ref(0);
const gps = ref({ present: false, sats: 0, fix: false });
const blockers = ref([]);
const features = ref([]);

const boardLine = computed(() => {
    const c = FC.CONFIG ?? {};
    return [c.boardName, c.flightControllerVersion].filter(Boolean).join(" · ");
});

function refresh() {
    const c = FC.CONFIG ?? {};
    battery.value = batteryInfo(FC.ANALOG?.voltage, FC.BATTERY_STATE?.cellCount);
    link.value = rssiPercent(FC.ANALOG?.rssi ?? 0);
    const hasGps = have_sensor(c.activeSensors, "gps");
    gps.value = { present: hasGps, sats: FC.GPS_DATA?.numSat ?? 0, fix: Boolean(FC.GPS_DATA?.fix) };
    blockers.value = armingBlockers(c.apiVersion, c.armingDisableCount ?? 0, c.armingDisableFlags ?? 0).map((name) => {
        const key = `initialSetupArmingDisableFlagsTooltip${name}`;
        const text = i18n.getMessage(key);
        return { name, text: text === key ? "" : text };
    });
}

async function loadFeatures() {
    if (!isMspCliSupported()) {
        return;
    }
    try {
        const values = {};
        for (const command of GET_COMMANDS) {
            Object.assign(values, parseGet(await send(command)));
        }
        const pinio = parsePinio(await send("get pinio_box"));
        // the CLI "version" line names the model; build options alone cannot tell TRUENAV_LIGHT from TRUENAV
        versionModel = modelFromVersionLines(await send("version"));
        features.value = trueglideStatus(values, pinio.boxes);
        // the board runs TrueGlide when its CLI "version" line names a TrueGlide model, or when it answers a setting only
        // TrueGlide has (Betaflight also answers gps_rescue_* and failsafe_procedure)
        readInstalled();
        installed.value.isTrueGlide = versionModel !== null || "power_guard_current" in values;
        rememberConnectedBoard(installed.value);
    } catch (error) {
        console.error("TrueGlide dashboard:", error);
    }
}

// decimal separator of the chosen language (24,6 V in French)
function num(value) {
    return Number(value).toLocaleString(i18n.getCurrentLocale?.() || undefined, { maximumFractionDigits: 2 });
}

function featureLabel(f) {
    if (f.on === null) {
        return f.detail;
    }
    const state = i18n.getMessage(f.on ? "tfDashOn" : "tfDashOff");
    return f.detail ? `${state} · ${f.detail}` : state;
}

const progress = computed(() => {
    void setupProgress.done;
    return currentProgress();
});
const progressPct = computed(() => Math.round((progress.value.count / progress.value.total) * 100));
const steps = computed(() => SETUP_STEPS.map((s) => ({ ...s, done: Boolean(setupProgress.done[s.tab]) })));

function go(tab, mode = "connected") {
    import("@/js/tab_switch").then(({ switchTab }) => {
        switchTab(tab, { mode });
        document.getElementById("content")?.scrollTo(0, 0);
    });
}

function openMemo() {
    requestDocsPage(MEMO_PAGE);
    go("help", "shared");
}

// Installed firmware, remembered for the flasher (the board no longer answers once it reboots to flash)
const installed = ref({ board: "", model: "STANDARD", version: "", revision: "", isTrueGlide: false });
let versionModel = null;
function readInstalled() {
    const c = FC.CONFIG ?? {};
    installed.value = {
        ...installed.value,
        board: c.boardName ?? "",
        model: versionModel ?? modelFromBuildOptions(c.buildOptions),
        version: c.flightControllerVersion ?? "",
        revision: c.gitRevision ?? "",
    };
}
const firmwareLine = computed(() => {
    const i = installed.value;
    const name = i.isTrueGlide ? modelName(i.model) : "Betaflight";
    return [name, i.version, i.revision && `(${i.revision})`].filter(Boolean).join(" ");
});

// TrueGlide and its two variants, as the pilot sees them
const MODEL_NAMES = { TRUENAV: "tfFlasherModelTrueNav", TRUENAV_LIGHT: "tfFlasherModelTrueNavLeger" };
function modelName(model) {
    return i18n.getMessage(MODEL_NAMES[model] ?? "tfFlasherModelStandard");
}

// Online update: the published list is fetched only when the pilot asks
const updateBusy = ref(false);
const update = ref({ status: null, entry: null, text: "" });
async function checkUpdate() {
    updateBusy.value = true;
    readInstalled();
    try {
        const index = await fetchFirmwareIndex();
        // a Betaflight board is offered the STANDARD model
        const model = installed.value.isTrueGlide ? installed.value.model : "STANDARD";
        const entry = findFirmware(index, installed.value.board, model);
        const status = installedStatus(index, installed.value);
        let text;
        if (!installed.value.board) {
            text = i18n.getMessage("tfDashBoardUnknown");
        } else if (!entry) {
            text = i18n.getMessage("tfOnlineNotPublished", { board: installed.value.board, model: modelName(model) });
        } else if (status === "current") {
            text = i18n.getMessage("tfDashUpToDate", { version: index.version, revision: index.revision });
        } else {
            text = i18n.getMessage("tfDashUpdateAvailable", {
                version: index.version,
                revision: index.revision,
                date: index.date,
            });
        }
        update.value = { status, entry, text };
    } catch (error) {
        update.value = {
            status: null,
            entry: null,
            text: i18n.getMessage("tfOnlineUnavailable", { error: error?.message ?? error }),
        };
    } finally {
        updateBusy.value = false;
    }
}

// Disconnects, then the flasher opens, downloads the file and waits for the pilot to press Flash
function startUpdate() {
    requestFirmwareUpdate(update.value.entry);
    GUI.pendingTab = "firmware_flasher";
    import("@/js/serial_backend").then(({ connectDisconnect }) => connectDisconnect());
}

// "diff all" saved as a text file: the configuration backup to keep before changing anything
const backupBusy = ref(false);
const backupMessage = ref("");
async function backup() {
    backupBusy.value = true;
    backupMessage.value = "";
    try {
        const lines = await readDumpAll();
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        const name = `trueglide_${FC.CONFIG?.boardName || "carte"}_${stamp}.txt`;
        const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
        backupMessage.value = i18n.getMessage("tfDashBackupDone", { file: name });
    } catch (error) {
        backupMessage.value = `${i18n.getMessage("tfDashBackupError")} ${error?.message ?? error}`;
    } finally {
        backupBusy.value = false;
    }
}

let timer = null;
onMounted(() => {
    loadSetupProgress();
    refresh();
    readInstalled();
    timer = setInterval(refresh, 500);
    loadFeatures();
});
onUnmounted(() => clearInterval(timer));
</script>
