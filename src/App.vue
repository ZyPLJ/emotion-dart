<script setup lang="ts">
import { watchEffect } from 'vue'
import Home from '@/views/Home.vue'
import Game from '@/views/Game.vue'
import { useGame } from '@/composables/useGame'

const { phase, emotion } = useGame()

/**
 * 当前情绪的三种颜色写到 :root，
 * 血条、按钮、氛围光、粒子全部跟着变，切换情绪整页换肤。
 */
watchEffect(() => {
  const root = document.documentElement
  root.style.setProperty('--accent', emotion.value.color)
  root.style.setProperty('--glow', emotion.value.glow)
  root.style.setProperty('--deep', emotion.value.deep)
})
</script>

<template>
  <div class="app-shell">
    <Transition name="fade" mode="out-in">
      <Home v-if="phase === 'input' || phase === 'select'" />
      <Game v-else />
    </Transition>
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  z-index: 1;
  height: 100%;
  height: 100dvh;
}
</style>
