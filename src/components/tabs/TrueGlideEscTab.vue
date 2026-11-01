<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
-->
<template>
    <BaseTab tab-name="esc">
        <div class="content_wrapper esc-tab">
            <p class="esc-note">{{ $t("tfEscIntro") }}</p>
            <iframe
                ref="frame"
                class="esc-frame"
                :src="ESC_TAB_URL"
                allow="serial; usb"
                :title="$t('tabEsc')"
                :style="{ height: `${frameHeight}px` }"
            ></iframe>
        </div>
    </BaseTab>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import { ESC_TAB_URL, attachEscFrame, detachEscFrame } from "../../js/trueglide/esc_tab.js";

const frame = ref(null);

// TrueGlide: the ESC page fills the window down to the status bar (its sliders and buttons are at the bottom)
const STATUS_BAR = 48; // status bar at the bottom of the app, with a small margin
const MIN_HEIGHT = 420;
const frameHeight = ref(600);
function fitFrame() {
    const top = frame.value?.getBoundingClientRect().top ?? 0;
    frameHeight.value = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top - STATUS_BAR));
}

onMounted(() => {
    attachEscFrame(frame.value);
    fitFrame();
    window.addEventListener("resize", fitFrame);
});
onBeforeUnmount(() => {
    window.removeEventListener("resize", fitFrame);
    detachEscFrame();
});
</script>

<style scoped>
.esc-tab {
    display: flex;
    flex-direction: column;
    padding-bottom: 0;
}
.esc-note {
    margin: 0 0 8px;
    font-size: 13px;
    opacity: 0.8;
}
.esc-frame {
    width: 100%;
    border: 0;
    border-radius: 8px;
}
</style>
