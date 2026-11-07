<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
-->
<template>
    <UiBox :title="$t('tfOnlineTitle')" class="mt-4">
        <p class="text-sm mb-3">{{ $t("tfOnlineIntro") }}</p>

        <div v-if="!index" class="flex flex-wrap items-center gap-2">
            <UButton
                size="sm"
                icon="i-lucide-cloud-download"
                :loading="busy"
                :disabled="disabled"
                :label="$t('tfOnlineCheck')"
                @click="check"
            />
        </div>

        <template v-else>
            <p class="text-sm mb-2">
                {{ $t("tfOnlinePublished", { version: index.version, revision: index.revision, date: index.date }) }}
            </p>
            <div class="flex flex-wrap items-end gap-3">
                <label class="flex flex-col gap-1 text-sm">
                    {{ $t("tfFlasherBoardLabel") }}
                    <USelectMenu v-model="board" :items="boards" size="sm" class="w-64" />
                </label>
                <label class="flex flex-col gap-1 text-sm">
                    {{ $t("tfFlasherModelLabel") }}
                    <USelect v-model="model" :items="modelItems" size="sm" class="w-56" />
                </label>
                <UButton
                    size="sm"
                    icon="i-lucide-download"
                    :loading="busy"
                    :disabled="disabled || !entry"
                    :label="$t('tfOnlineDownload')"
                    @click="download()"
                />
            </div>
            <p v-if="known" class="text-sm mt-2">
                {{ $t("tfOnlineLastBoard", { board: known.board }) }}
            </p>
            <p v-if="board && !entry" class="text-sm mt-2 text-(--warning-700)">
                {{ $t("tfOnlineNotPublished", { board, model: modelName(model) }) }}
            </p>
        </template>

        <p v-if="message" class="text-sm mt-2" :class="{ 'text-(--error-700)': failed }">{{ message }}</p>
    </UiBox>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
import { i18n } from "@/js/localization";
import {
    downloadFirmware,
    fetchFirmwareIndex,
    findFirmware,
    indexBoards,
    lastConnectedBoard,
    takeRequestedFirmwareUpdate,
} from "@/js/trueglide/firmware_source.js";

// TrueGlide online update: fetches the published list only when the pilot asks, then downloads the .hex of the
// chosen board and model, checks it, and hands it to the flasher like a local file.
const props = defineProps({
    disabled: { type: Boolean, default: false },
    onFirmware: { type: Function, required: true },
});

const MODEL_KEYS = {
    STANDARD: "tfFlasherModelStandard",
    TRUENAV: "tfFlasherModelTrueNav",
    TRUENAV_LIGHT: "tfFlasherModelTrueNavLeger",
};
const modelName = (m) => i18n.getMessage(MODEL_KEYS[m] ?? m);

const index = ref(null);
const busy = ref(false);
const message = ref("");
const failed = ref(false);
const known = lastConnectedBoard();
const board = ref(known?.board ?? undefined);
const model = ref(known?.model ?? "STANDARD");

const boards = computed(() => (index.value ? indexBoards(index.value) : []));
const modelItems = computed(() =>
    Object.keys(MODEL_KEYS)
        .filter((m) => index.value?.files.some((f) => f.model === m))
        .map((m) => ({ value: m, label: modelName(m) })),
);
const entry = computed(() => (index.value && board.value ? findFirmware(index.value, board.value, model.value) : null));

function report(text, isError = false) {
    message.value = text;
    failed.value = isError;
}

async function check() {
    busy.value = true;
    report("");
    try {
        index.value = await fetchFirmwareIndex();
        if (board.value && !boards.value.includes(board.value)) {
            board.value = undefined;
        }
    } catch (error) {
        report(i18n.getMessage("tfOnlineUnavailable", { error: error?.message ?? error }), true);
    } finally {
        busy.value = false;
    }
}

async function download(chosen = entry.value) {
    if (!chosen) {
        return;
    }
    busy.value = true;
    report(i18n.getMessage("tfOnlineDownloading"));
    try {
        const firmware = await downloadFirmware(chosen);
        await props.onFirmware(firmware);
        report(i18n.getMessage("tfOnlineReady", { file: firmware.name }));
    } catch (error) {
        // TrueGlide (audit du 07/11/2026, mineur) : jamais d'erreur vide « () »
        const detail = String(error?.message || error || "").trim() || "fichier incomplet ou illisible";
        report(i18n.getMessage("tfOnlineFailed", { error: detail }), true);
    } finally {
        busy.value = false;
    }
}

// update asked from the dashboard: list already checked there, download straight away
onMounted(async () => {
    const requested = takeRequestedFirmwareUpdate();
    if (requested) {
        await check();
        if (index.value) {
            board.value = requested.board;
            model.value = requested.model;
            await download(findFirmware(index.value, requested.board, requested.model));
        }
    }
});
</script>
