<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
-->
<template>
    <TrueGlideTab
        tab-name="tf_navigation"
        title="tabTfNavigation"
        :sections="['navsafety', 'truenav']"
        intro="trueglideIntroNavigation"
    />
</template>

<script setup>
import TrueGlideTab from "./TrueGlideTab.vue";
</script>
