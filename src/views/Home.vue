<script setup lang="ts">
/** 首页（方案 §二）：输入 → 选情绪，两步进入游戏。 */
import { computed, ref } from 'vue'
import EmotionInput from '@/components/EmotionInput.vue'
import EmotionPicker from '@/components/EmotionPicker.vue'
import { EMOTIONS } from '@/data/emotions'
import { useGame } from '@/composables/useGame'
import { loadBest, recentTargets, type Aggregated } from '@/utils/storage'
import { playTick, unlockAudio } from '@/utils/audio'
import type { EmotionType } from '@/types'

const { setName, setEmotion, start } = useGame()

const step = ref<'input' | 'select'>('input')
const name = ref('')
const mood = ref<EmotionType>('angry')

const best = ref(loadBest())
const recent = ref<Aggregated[]>(recentTargets(7))

const hasHistory = computed(() => recent.value.length > 0)

function toSelect(): void {
  setName(name.value)
  step.value = 'select'
}

function toInput(): void {
  playTick()
  step.value = 'input'
}

function launch(): void {
  unlockAudio()
  setName(name.value)
  setEmotion(mood.value)
  start()
}

/** 首页点历史对象直接复用 */
function reuse(entry: Aggregated): void {
  playTick()
  name.value = entry.name
  mood.value = entry.emotion
  toSelect()
}

const emojiOf = (t: EmotionType): string => EMOTIONS[t].emoji
const colorOf = (t: EmotionType): string => EMOTIONS[t].color
</script>

<template>
  <div class="home">
    <Transition name="fade" mode="out-in">
      <EmotionInput
        v-if="step === 'input'"
        v-model="name"
        @submit="toSelect"
      />
      <EmotionPicker
        v-else
        v-model="mood"
        :target-name="name"
        @confirm="launch"
        @back="toInput"
      />
    </Transition>

    <footer v-if="step === 'input' && (hasHistory || best > 0)" class="foot">
      <div v-if="best > 0" class="best">
        <span class="best-label">最高释放评分</span>
        <strong class="best-value">{{ best }}</strong>
      </div>

      <div v-if="hasHistory" class="recent">
        <div class="recent-head">最近 7 天，你扔过这些</div>
        <div class="recent-list">
          <button
            v-for="item in recent"
            :key="item.name"
            type="button"
            class="recent-chip"
            :style="{ '--tint': colorOf(item.emotion) }"
            @click="reuse(item)"
          >
            <span class="recent-emoji">{{ emojiOf(item.emotion) }}</span>
            <span class="recent-name">{{ item.name }}</span>
            <span class="recent-count">×{{ item.count }}</span>
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.home {
  position: relative;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16px 20px calc(16px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--bg) 42%, transparent);
  pointer-events: none;
  animation: popIn 0.5s 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.best,
.recent {
  pointer-events: auto;
  width: min(100%, 460px);
  margin: 0 auto;
}

.best {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
}

.best-label {
  font-size: 12px;
  color: var(--text-faint);
  letter-spacing: 0.14em;
}

.best-value {
  font-size: 18px;
  font-weight: 900;
  color: var(--glow);
  text-shadow: 0 0 18px color-mix(in srgb, var(--glow) 60%, transparent);
}

.recent-head {
  margin-bottom: 8px;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--text-faint);
  text-align: center;
}

.recent-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 7px;
  max-height: 84px;
  overflow: hidden;
}

.recent-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-dim);
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.04);
  transition: transform 0.16s ease, color 0.2s ease, border-color 0.2s ease;
}

.recent-chip:hover {
  color: var(--text);
  border-color: color-mix(in srgb, var(--tint) 60%, transparent);
}

.recent-chip:active {
  transform: scale(0.94);
}

.recent-emoji {
  font-size: 13px;
}

.recent-count {
  font-size: 11px;
  color: var(--tint);
  font-weight: 800;
}
</style>
