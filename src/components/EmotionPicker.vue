<script setup lang="ts">
/** 情绪选择（方案 §六）：先定情绪，再定特效与文案基调。 */
import { EMOTIONS, EMOTION_ORDER } from '@/data/emotions'
import type { EmotionType } from '@/types'
import { playTick, unlockAudio } from '@/utils/audio'

const props = defineProps<{ modelValue: EmotionType; targetName: string }>()
const emit = defineEmits<{ 'update:modelValue': [EmotionType]; confirm: []; back: [] }>()

const options = EMOTION_ORDER.map((t) => EMOTIONS[t])

function choose(type: EmotionType): void {
  unlockAudio()
  playTick()
  emit('update:modelValue', type)
}

function confirm(): void {
  playTick()
  emit('confirm')
}
</script>

<template>
  <section class="stage pick-stage no-select">
    <header class="head">
      <p class="eyebrow">靶子已就位</p>
      <h2 class="target">「{{ props.targetName }}」</h2>
      <p class="ask">现在是什么情绪？</p>
    </header>

    <div class="grid">
      <button
        v-for="(e, i) in options"
        :key="e.type"
        type="button"
        class="mood"
        :class="{ on: e.type === modelValue }"
        :style="{ '--tint': e.color, '--tint-glow': e.glow, '--d': `${i * 55}ms` }"
        @click="choose(e.type)"
      >
        <span class="mood-emoji">{{ e.emoji }}</span>
        <span class="mood-label">{{ e.label }}</span>
        <span class="mood-slogan">{{ e.slogan }}</span>
        <span class="mood-check">✓</span>
      </button>
    </div>

    <div class="actions">
      <button class="btn btn-ghost back" type="button" @click="emit('back')">返回</button>
      <button class="btn btn-primary" type="button" @click="confirm">开始释放</button>
    </div>
  </section>
</template>

<style scoped>
.pick-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 28px 20px calc(28px + env(safe-area-inset-bottom));
  gap: 22px;
}

.head {
  text-align: center;
  animation: popIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.34em;
  color: var(--text-faint);
  text-indent: 0.34em;
}

.target {
  margin: 8px 0 6px;
  max-width: 84vw;
  font-size: clamp(24px, 7vw, 32px);
  font-weight: 900;
  letter-spacing: 0.02em;
  word-break: break-word;
  text-shadow: 0 0 26px color-mix(in srgb, var(--accent) 55%, transparent);
}

.ask {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-dim);
  letter-spacing: 0.06em;
}

/* 五个选项：固定一行三个，剩下两个居中 —— 比 grid 留下一个孤零零的尾项好看 */
.grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  width: min(100%, 460px);
}

.mood {
  flex: 0 0 calc((100% - 20px) / 3);
  max-width: 148px;
}

.mood {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 15px 8px 13px;
  min-width: 0;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015));
  overflow: hidden;
  animation: popIn 0.42s var(--d) cubic-bezier(0.34, 1.56, 0.64, 1) both;
  transition:
    transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
    border-color 0.24s ease,
    box-shadow 0.28s ease;
}

.mood::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(circle at 50% 118%, var(--tint) 0%, transparent 68%);
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.mood:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--tint) 45%, transparent);
}

.mood:active {
  transform: scale(0.96);
}

.mood.on {
  border-color: var(--tint);
  box-shadow:
    0 8px 26px color-mix(in srgb, var(--tint) 40%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--tint) 30%, transparent);
}

.mood.on::after {
  opacity: 0.28;
}

.mood-emoji {
  position: relative;
  z-index: 1;
  font-size: 27px;
  line-height: 1.1;
  filter: grayscale(0.55) opacity(0.75);
  transition: filter 0.26s ease, transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.mood.on .mood-emoji {
  filter: none;
  transform: scale(1.14);
}

.mood-label {
  position: relative;
  z-index: 1;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  transition: color 0.24s ease;
}

.mood.on .mood-label {
  color: var(--text);
}

.mood-slogan {
  position: relative;
  z-index: 1;
  font-size: 10.5px;
  color: var(--text-faint);
  letter-spacing: 0.04em;
}

.mood-check {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 2;
  width: 17px;
  height: 17px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 900;
  color: #fff;
  border-radius: 50%;
  background: var(--tint);
  opacity: 0;
  transform: scale(0.4);
  transition: opacity 0.22s ease, transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.mood.on .mood-check {
  opacity: 1;
  transform: scale(1);
}

.actions {
  display: flex;
  gap: 10px;
  width: min(100%, 460px);
}

.actions .btn {
  flex: 1;
}

.back {
  flex: 0 0 96px;
}
</style>
