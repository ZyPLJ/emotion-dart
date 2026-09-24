<script setup lang="ts">
/**
 * 情绪靶子（方案 §三 游戏初始化 / §五 靶子变化效果）。
 *
 * 三层结构：光环 → 靶环 → 裂纹 SVG，中间压着目标名字。
 * 受击次数决定裂纹阶段：0~2 完好，3~6 裂纹，7+ 严重破坏，归零则炸开。
 */
import { computed, ref } from 'vue'
import type { EmotionMeta } from '@/types'
import { clamp } from '@/utils/random'

/** 供 Game.vue 量取靶面位置，用来算飞镖落点 */
const boardEl = ref<HTMLElement | null>(null)
defineExpose({ boardEl })

const props = defineProps<{
  name: string
  hp: number
  maxHp: number
  /** 已命中次数 */
  hits: number
  destroyed: boolean
  emotion: EmotionMeta
}>()

/** 裂纹阶段：0 完好 / 1 裂纹 / 2 严重破坏（方案 §五） */
const stage = computed(() => {
  if (props.destroyed) return 3
  if (props.hits >= 7) return 2
  if (props.hits >= 3) return 1
  return 0
})

const vars = computed(() => ({
  // 供给 CSS 做去饱和：血越少，靶子越灰败
  '--hp': String(clamp(props.hp, 0, props.maxHp))
}))

const stageHint = computed(() => {
  switch (stage.value) {
    case 1:
      return '裂开了'
    case 2:
      return '快碎了'
    case 3:
      return '已击碎'
    default:
      return ''
  }
})
</script>

<template>
  <div class="board-wrap" :style="vars">
    <div class="halo" :class="{ strong: stage >= 2 }" />

    <div ref="boardEl" class="board" :class="[`stage-${stage}`, { destroyed }]">
      <div class="rings" />
      <div class="face" />
      <div class="bull" />

      <svg class="cracks" viewBox="0 0 200 200" aria-hidden="true">
        <!-- 阶段一：三道主裂纹 -->
        <g class="crack-set one">
          <path d="M100 100 L118 72 L112 50 L126 26" />
          <path d="M100 100 L72 84 L52 92 L28 80" />
          <path d="M100 100 L106 128 L92 150 L98 176" />
        </g>
        <!-- 阶段二：再裂三道并生出分支 -->
        <g class="crack-set two">
          <path d="M100 100 L130 104 L152 96 L176 108" />
          <path d="M100 100 L86 70 L74 54 L60 44" />
          <path d="M100 100 L80 120 L58 126 L42 144" />
          <path class="branch" d="M118 72 L140 66 M112 50 L100 38" />
          <path class="branch" d="M72 84 L64 60 M52 92 L40 104" />
          <path class="branch" d="M106 128 L124 142 M92 150 L80 168" />
        </g>
      </svg>

      <div class="core">
        <div class="emoji">{{ destroyed ? '✨' : '🎯' }}</div>
        <div class="name">{{ name }}</div>
        <div v-if="stageHint && !destroyed" class="stage-hint">{{ stageHint }}</div>
      </div>

      <!-- 击碎瞬间的爆闪与碎片 -->
      <div v-if="destroyed" class="shatter">
        <span v-for="n in 10" :key="n" class="bit" :style="{ '--i': n }" />
      </div>
    </div>

    <p class="slogan">{{ emotion.slogan }}</p>
  </div>
</template>

<style scoped>
.board-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

/* ——— 背光 ——— */
.halo {
  position: absolute;
  top: calc(50% - 46px);
  left: 50%;
  width: 128%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--accent) 32%, transparent) 0%,
    color-mix(in srgb, var(--glow) 12%, transparent) 42%,
    transparent 70%
  );
  animation: breathe 3.4s ease-in-out infinite;
  pointer-events: none;
  transition: background 0.5s ease;
}

.halo.strong {
  animation-duration: 1.6s;
  filter: brightness(1.35);
}

/* ——— 靶体 ——— */
.board {
  position: relative;
  width: min(68vw, 288px);
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  isolation: isolate;
  filter: saturate(calc(0.42 + var(--hp) * 0.0058)) brightness(calc(0.72 + var(--hp) * 0.0028));
  transition:
    filter 0.45s ease,
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* 受击时整体往后一缩 */
.board.stage-1 {
  transform: scale(0.985);
}

.board.stage-2 {
  transform: scale(0.97);
}

.rings {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: repeating-radial-gradient(
    circle at 50% 50%,
    color-mix(in srgb, var(--accent) 16%, #0a0c13) 0 8.5%,
    color-mix(in srgb, var(--glow) 34%, #0a0c13) 8.5% 17%,
    color-mix(in srgb, var(--accent) 9%, #0e1119) 17% 25.5%,
    color-mix(in srgb, var(--glow) 20%, #0e1119) 25.5% 34%
  );
  box-shadow:
    inset 0 0 60px rgba(0, 0, 0, 0.75),
    0 0 0 2px color-mix(in srgb, var(--glow) 45%, transparent),
    0 0 44px color-mix(in srgb, var(--accent) 34%, transparent),
    0 26px 60px rgba(0, 0, 0, 0.6);
  transition: background 0.5s ease, box-shadow 0.5s ease;
}

/* 一层内阴影，让靶面有点凹陷的立体感 */
.face {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 42%,
    rgba(255, 255, 255, 0.12) 0%,
    transparent 46%,
    rgba(0, 0, 0, 0.5) 100%
  );
}

.bull {
  position: absolute;
  width: 19%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, var(--glow), var(--accent));
  box-shadow:
    0 0 22px color-mix(in srgb, var(--glow) 75%, transparent),
    inset 0 0 12px rgba(0, 0, 0, 0.4);
}

/* ——— 裂纹 ——— */
.cracks {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.crack-set path {
  fill: none;
  stroke: #05060a;
  stroke-width: 2.6;
  stroke-linecap: round;
  opacity: 0;
  filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.45));
}

.crack-set path.branch {
  stroke-width: 1.5;
}

/* 裂纹用「抽线」揭示，像真的从中心裂出来 */
.stage-1 .crack-set.one path,
.stage-2 .crack-set.one path,
.stage-3 .crack-set.one path {
  opacity: 0.92;
  animation: crackGrow 0.45s ease-out both;
}

.stage-2 .crack-set.two path,
.stage-3 .crack-set.two path {
  opacity: 0.92;
  animation: crackGrow 0.45s ease-out both;
}

.stage-2 .crack-set.two path:nth-child(2) {
  animation-delay: 0.06s;
}

.stage-2 .crack-set.two path:nth-child(3) {
  animation-delay: 0.12s;
}

@keyframes crackGrow {
  from {
    stroke-dasharray: 240;
    stroke-dashoffset: 240;
    opacity: 0;
  }
  to {
    stroke-dasharray: 240;
    stroke-dashoffset: 0;
    opacity: 0.92;
  }
}

/* ——— 中心内容 ——— */
.core {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transform: translateY(-6%);
  text-align: center;
  pointer-events: none;
}

.emoji {
  font-size: 30px;
  line-height: 1;
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.7));
}

.name {
  max-width: 62%;
  font-size: clamp(20px, 6.2vw, 27px);
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1.2;
  word-break: break-word;
  text-shadow:
    0 2px 10px rgba(0, 0, 0, 0.9),
    0 0 22px color-mix(in srgb, var(--glow) 55%, transparent);
}

.stage-hint {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.22em;
  color: var(--text-dim);
  text-indent: 0.22em;
}

/* ——— 击碎 ——— */
.board.destroyed {
  animation: boardBreak 0.9s cubic-bezier(0.3, 0, 0.2, 1) both;
}

.board.destroyed .rings {
  animation: ringsAway 0.9s ease-out both;
}

.board.destroyed .bull {
  animation: bullFlash 0.7s ease-out both;
}

@keyframes boardBreak {
  0% {
    transform: scale(0.97);
    filter: brightness(1.05);
  }
  18% {
    transform: scale(1.09);
    filter: brightness(2.4) saturate(1.3);
  }
  100% {
    transform: scale(1.02);
    filter: brightness(0.9);
  }
}

@keyframes ringsAway {
  0% {
    opacity: 1;
  }
  30% {
    opacity: 1;
    filter: brightness(2.2);
  }
  100% {
    opacity: 0.24;
    filter: brightness(0.5) blur(3px);
    transform: scale(1.12);
  }
}

@keyframes bullFlash {
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(2.6);
    opacity: 0.9;
  }
  100% {
    transform: scale(3.4);
    opacity: 0;
  }
}

.shatter {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 4;
}

.bit {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  border-radius: 1px;
  background: var(--glow);
  transform-origin: center;
  animation: bitFly 0.85s cubic-bezier(0.2, 0.6, 0.3, 1) both;
  animation-delay: calc(var(--i) * 0.014s);
}

@keyframes bitFly {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(0deg) translateX(0);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) rotate(calc(var(--i) * 36deg)) translateX(64%)
      rotate(220deg);
  }
}

.slogan {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.32em;
  color: var(--text-faint);
  text-indent: 0.32em;
  transition: color 0.4s ease;
}
</style>
