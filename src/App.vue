<script setup lang="ts">
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import ToastHost from "@/components/ToastHost.vue";
</script>

<template>
  <DefaultLayout>
    <RouterView />
  </DefaultLayout>
  <ToastHost />
</template>
