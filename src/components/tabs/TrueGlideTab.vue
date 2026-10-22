<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
-->
<template>
    <BaseTab :tab-name="tabName">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t(title) }}</div>

            <UiBox v-if="state === 'unsupported'" type="warning" highlight class="mb-4">
                <p class="text-sm">{{ $t("trueglideUnsupported") }}</p>
            </UiBox>
            <UiBox v-else-if="state === 'loading'" class="mb-4">
                <p class="text-sm">{{ $t("trueglideLoading") }}</p>
            </UiBox>
            <UiBox v-else-if="state === 'error'" type="error" highlight class="mb-4">
                <p class="text-sm">{{ $t("trueglideReadError") }} {{ errorText }}</p>
            </UiBox>

            <template v-else>
                <UiBox v-if="sections.length" type="info" class="mb-4">
                    <p class="text-sm">{{ $t(intro) }}</p>
                </UiBox>
                <UiBox v-if="sections.length && !visibleSections.length" type="warning" highlight class="mb-4">
                    <p class="text-sm">{{ $t("tfTabNotInFirmware") }}</p>
                </UiBox>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <UiBox
                        v-for="section in visibleSections"
                        :key="section.key"
                        :title="$t(section.title)"
                        :help="$t(section.help)"
                    >
                        <SettingRow
                            v-for="s in section.settings.filter((x) => x.name in original)"
                            :key="s.name"
                            :label="$t(labelKey(s.name))"
                            :help="$t(helpKey(s.name))"
                        >
                            <USwitch
                                v-if="s.type === 'onoff'"
                                :model-value="edited[s.name] === 'ON'"
                                size="sm"
                                @update:model-value="(v) => (edited[s.name] = v ? 'ON' : 'OFF')"
                            />
                            <USelect
                                v-else-if="s.type === 'choice'"
                                v-model="edited[s.name]"
                                :items="s.values"
                                size="xs"
                                class="w-36"
                            />
                            <div v-else class="flex items-center gap-2">
                                <UInputNumber
                                    v-model="edited[s.name]"
                                    :min="s.scale ? s.min / s.scale : s.min"
                                    :max="s.scale ? s.max / s.scale : s.max"
                                    :step="s.scale ? 0.1 : 1"
                                    size="xs"
                                    orientation="vertical"
                                    :format-options="{ useGrouping: false }"
                                    class="w-24"
                                />
                                <span class="text-sm">{{ s.unit }}</span>
                            </div>
                        </SettingRow>
                    </UiBox>
                    <UiBox v-if="showCamera" :title="$t('tfCameraTitle')" :help="$t('tfCameraHelp')">
                        <p v-if="!camera.outputs.length" class="text-sm">{{ $t("tfCameraNoPinio") }}</p>
                        <template v-else>
                            <SettingRow :label="$t('tfCameraOutput')" :help="$t('tfCameraOutputHelp')">
                                <USelect v-model="camera.index" :items="cameraOutputItems" size="xs" class="w-56" />
                            </SettingRow>
                            <SettingRow :label="$t('tfCameraControl')" :help="$t('tfCameraControlHelp')">
                                <USelect v-model="camera.control" :items="cameraControlItems" size="xs" class="w-56" />
                            </SettingRow>
                            <p v-if="cameraConflict" class="text-sm mt-2 text-(--warning-700)">
                                {{ $t("tfCameraConflict", { use: cameraConflict }) }}
                            </p>
                            <p class="text-xs mt-2">{{ $t("tfCameraAfter") }}</p>
                            <div class="mt-3">
                                <UButton
                                    :label="$t('tfCameraApply')"
                                    size="sm"
                                    variant="subtle"
                                    icon="i-lucide-camera"
                                    :disabled="!camera.index || camera.control === null"
                                    @click="applyCameraPower"
                                />
                            </div>
                        </template>
                    </UiBox>
                    <!-- extra boxes of a tab (e.g. the Speeder diagram), fed with the values being edited -->
                    <slot name="extra" :edited="edited"></slot>
                </div>
            </template>
        </div>
        <div v-if="sections.length" class="content_toolbar toolbar_fixed_bottom">
            <UButton
                :label="$t('trueglideRefresh')"
                color="neutral"
                variant="subtle"
                :disabled="state === 'loading'"
                @click="load"
            />
            <UButton :label="$t('trueglideSave')" :disabled="state !== 'ready' || !dirty" @click="save" />
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "@/components/elements/UiBox.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
import { send, saveAndReconnect, isMspCliSupported } from "@/composables/useMspCliSession";
import { gui_log } from "@/js/gui_log";
import { i18n } from "@/js/localization";
import {
    SECTIONS,
    GET_COMMANDS,
    parseGet,
    changeCommands,
    labelKey,
    helpKey,
    ALL_SETTINGS,
    toDisplay,
} from "@/js/trueglide/settings";
import { CAMERA_CONTROLS, cameraPowerCommand, parsePinio, pinioConflict } from "@/js/trueglide/camera_power";

// TrueGlide features are split into several tabs (Protections, Speeder, Navigation, Camera, Radio telemetry):
// each one shows its own sections of the same settings list.
const props = defineProps({
    tabName: { type: String, required: true },
    title: { type: String, required: true },
    sections: { type: Array, default: () => [] },
    showCamera: { type: Boolean, default: false },
    // intro text above the settings; the navigation tab shows mostly Betaflight settings, so it has its own
    intro: { type: String, default: "trueglideIntro" },
});

const state = ref("loading");
const errorText = ref("");
const original = reactive({});
const edited = reactive({});

// A section is shown only if the connected firmware has at least one of its settings (STANDARD has no mission
// settings, plain Betaflight has none of them).
const visibleSections = computed(() =>
    SECTIONS.filter((s) => props.sections.includes(s.key) && s.settings.some((x) => x.name in original)),
);
const dirty = computed(() => changeCommands(original, edited).commands.length > 0);

async function load() {
    if (!isMspCliSupported()) {
        state.value = "unsupported";
        return;
    }
    state.value = "loading";
    try {
        const values = {};
        for (const command of GET_COMMANDS) {
            Object.assign(values, parseGet(await send(command)));
        }
        for (const k of Object.keys(original)) {
            delete original[k];
            delete edited[k];
        }
        for (const s of ALL_SETTINGS) {
            if (s.name in values) {
                original[s.name] = values[s.name];
                edited[s.name] = toDisplay(s, values[s.name]);
            }
        }
        await loadCamera();
        state.value = Object.keys(values).length ? "ready" : "unsupported";
    } catch (error) {
        errorText.value = String(error?.message ?? error);
        state.value = "error";
    }
}

async function save() {
    const { commands, errors } = changeCommands(original, edited);
    if (errors.length) {
        gui_log(`${i18n.getMessage("trueglideInvalid")} ${errors.join(", ")}`);
        return;
    }
    if (!commands.length) {
        return;
    }
    state.value = "loading";
    try {
        for (const command of commands) {
            const reply = await send(command);
            const failed = reply.find((line) => line.startsWith("###ERROR") || /Invalid|out of range/i.test(line));
            if (failed) {
                throw new Error(`${command} : ${failed}`);
            }
        }
    } catch (error) {
        errorText.value = String(error?.message ?? error);
        state.value = "error";
        return;
    }
    gui_log(i18n.getMessage("trueglideSaved"));
    // "save" reboots the flight controller; the app reconnects like after a preset.
    await saveAndReconnect();
}

// Camera / payload power: a PINIO output switched by a radio switch (USER1..4) or by arming
const camera = reactive({ boxes: [], outputs: [], index: null, control: null });

async function loadCamera() {
    const lines = [...(await send("get pinio_box")), ...(await send("resource", { timeoutMs: 5000 }))];
    const pinio = parsePinio(lines);
    camera.boxes = pinio.boxes;
    camera.outputs = pinio.outputs;
    // preselect an output already switched by a USER mode, else the first free one
    const current = pinio.outputs.find((o) => o.box >= 40 && o.box <= 43);
    const free = pinio.outputs.find((o) => o.use === null);
    const pick = current ?? free ?? null;
    camera.index = pick ? pick.index : null;
    camera.control = current ? current.box : 40;
}

const cameraOutputItems = computed(() =>
    camera.outputs.map((o) => ({
        value: o.index,
        label: `PINIO ${o.index} (${o.pin}) : ${o.use ?? i18n.getMessage("tfCameraFree")}`,
    })),
);
const cameraControlItems = computed(() =>
    CAMERA_CONTROLS.map((c) => ({
        value: c.id,
        label: c.id === 0 ? i18n.getMessage("tfCameraWhenArmed") : i18n.getMessage("tfCameraSwitch", { mode: c.name }),
    })),
);
const cameraConflict = computed(() => {
    const output = camera.outputs.find((o) => o.index === camera.index);
    return output ? pinioConflict(output, camera.control) : null;
});

async function applyCameraPower() {
    let command;
    try {
        command = cameraPowerCommand(camera.boxes, camera.index, camera.control);
    } catch (error) {
        gui_log(String(error?.message ?? error));
        return;
    }
    state.value = "loading";
    try {
        const reply = await send(command);
        const failed = reply.find((line) => line.startsWith("###ERROR") || /Invalid|out of range/i.test(line));
        if (failed) {
            throw new Error(`${command} : ${failed}`);
        }
    } catch (error) {
        errorText.value = String(error?.message ?? error);
        state.value = "error";
        return;
    }
    gui_log(i18n.getMessage("tfCameraDone"));
    await saveAndReconnect();
}

onMounted(load);
</script>
