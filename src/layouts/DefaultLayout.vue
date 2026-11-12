<script setup lang="ts">
// Layout único por ahora. Si más adelante una vista necesita un chrome
// distinto (por ejemplo una vista de sala sin header), se agrega un
// segundo layout en vez de llenar este de condicionales.
</script>

<template>
  <div class="flex h-screen flex-col bg-bg text-text">
    <header
      class="flex flex-shrink-0 items-center gap-2.5 border-b border-gold-dim/20 px-4 py-3"
    >
      <div
        class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-lg shadow-[0_0_14px_rgba(200,150,50,0.4),0_0_30px_rgba(200,100,20,0.1)]"
        style="background: radial-gradient(circle, var(--color-gold-2) 0%, var(--color-gold) 60%, #7a5010 100%)"
      >
        🎵
      </div>
      <div class="leading-tight">
        <div class="font-display text-sm font-bold text-gold-2 [text-shadow:0_0_20px_rgba(230,180,60,0.4)]">
          TavernSound
        </div>
        <div class="font-body text-[10px] italic tracking-[2px] text-text-3 uppercase">
          Synchronized Bards
        </div>
      </div>
    </header>

    <main class="flex flex-1 flex-col overflow-hidden">
      <slot />
    </main>
  </div>
</template>
