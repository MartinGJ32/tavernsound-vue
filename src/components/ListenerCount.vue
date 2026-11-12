<script setup lang="ts">
withDefaults(defineProps<{ count?: number }>(), { count: 1 });
</script>

<template>
  <span class="flex items-center gap-1.5 font-heading text-[10px] tracking-[1.5px] text-text-3 uppercase">
    <span aria-hidden="true">♪</span>
    {{ count }} {{ count === 1 ? "oyente" : "oyentes" }}
  </span>
</template>
