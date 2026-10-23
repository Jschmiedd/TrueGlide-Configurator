<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
-->
<template>
    <BaseTab tab-name="esc">
        <div class="content_wrapper esc-tab">
            <p class="esc-note">{{ $t("tfEscIntro") }}</p>
            <iframe ref="frame" class="esc-frame" :src="ESC_TAB_URL" allow="serial; usb" :title="$t('tabEsc')"></iframe>
        </div>
    </BaseTab>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import { ESC_TAB_URL, attachEscFrame, detachEscFrame } from "../../js/trueglide/esc_tab.js";

const frame = ref(null);

onMounted(() => attachEscFrame(frame.value));
onBeforeUnmount(() => detachEscFrame());
</script>

<style scoped>
.esc-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.esc-note {
    margin: 0 0 8px;
    font-size: 13px;
    opacity: 0.8;
}
.esc-frame {
    flex: 1;
    width: 100%;
    min-height: 600px;
    height: calc(100vh - 190px);
    border: 0;
    border-radius: 8px;
}
</style>
