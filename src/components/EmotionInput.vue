<script setup lang="ts">
/** 首页输入（方案 §二）：一行输入框 + 几个示例词，越少摩擦越好。 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { EXAMPLE_TARGETS } from '@/data/emotions'
import { playTick, unlockAudio } from '@/utils/audio'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()

const inputEl = ref<HTMLInputElement | null>(null)
const invalid = ref(false)

const value = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v)
})

const canSubmit = computed(() => value.value.trim().length > 0)

const shown = ref<string[]>([])

function rollExamples(): void {
  // 每次展示 4 个，避免 6 个挤成两行显得啰嗦
  shown.value = shufflePick()
}

function shufflePick(): string[] {
  const pool = [...EXAMPLE_TARGETS]
  const out: string[] = []
  while (out.length < 4 && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  return out
}

function useExample(word: string): void {
  unlockAudio()
  playTick()
  value.value = word
  invalid.value = false
  inputEl.value?.focus()
}

function submit(): void {
  unlockAudio()
  if (!canSubmit.value) {
    invalid.value = true
    window.setTimeout(() => (invalid.value = false), 520)
    inputEl.value?.focus()
    return
  }
  playTick()
  emit('submit')
}

onMounted(() => {
  rollExamples()
  void nextTick(() => {
    // 移动端自动弹键盘会顶掉布局，只在指针设备上聚焦
    if (window.matchMedia('(hover: hover)').matches) inputEl.value?.focus()
  })
})
</script>

<template>
  <section class="stage input-stage no-select">
    <header class="hero">
      <div class="logo">🎯</div>
      <h1 class="title">情绪飞镖场</h1>
      <p class="tagline">把今天的不爽扔出去</p>
    </header>

    <div class="ask">今天有什么让你不爽？</div>

    <form class="field" :class="{ invalid }" @submit.prevent="submit">
      <input
        ref="inputEl"
        v-model="value"
        type="text"
        maxlength="12"
        enterkeyhint="go"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        placeholder="输入一个人，或者一件事"
        aria-label="情绪对象"
      />
      <span class="counter">{{ value.length }}/12</span>
    </form>

    <div class="examples">
      <button
        v-for="word in shown"
        :key="word"
        type="button"
        class="chip"
        @click="useExample(word)"
      >
        {{ word }}
      </button>
      <button type="button" class="chip chip-roll" title="换一批" @click="rollExamples">
        ⟳
      </button>
    </div>

    <button class="btn btn-primary go" type="button" :disabled="!canSubmit" @click="submit">
      开始释放
    </button>

    <p class="hint">输入只存在你自己的浏览器里，不会上传</p>
  </section>
</template>

<style scoped>
.input-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px 24px calc(32px + env(safe-area-inset-bottom));
  gap: 18px;
  text-align: center;
}

.hero {
  animation: popIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.logo {
  font-size: 54px;
  line-height: 1;
  filter: drop-shadow(0 8px 24px color-mix(in srgb, var(--accent) 60%, transparent));
  animation: breathe 3s ease-in-out infinite;
}

.title {
  margin: 12px 0 4px;
  font-size: clamp(28px, 8vw, 38px);
  font-weight: 900;
  letter-spacing: 0.06em;
  background: linear-gradient(120deg, var(--text) 30%, var(--glow));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.tagline {
  margin: 0;
  font-size: 14px;
  letter-spacing: 0.24em;
  color: var(--text-faint);
  text-indent: 0.24em;
}

.ask {
  margin-top: 10px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-dim);
}

.field {
  position: relative;
  width: min(100%, 380px);
  animation: popIn 0.5s 0.06s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.field input {
  width: 100%;
  height: 62px;
  padding: 0 60px 0 22px;
  font-size: 19px;
  font-weight: 600;
  text-align: center;
  border-radius: var(--radius);
  border: 1.5px solid var(--line);
  background: rgba(255, 255, 255, 0.045);
  outline: none;
  transition:
    border-color 0.22s ease,
    box-shadow 0.28s ease,
    background 0.22s ease;
}

.field input::placeholder {
  color: var(--text-faint);
  font-weight: 500;
}

.field input:focus {
  border-color: color-mix(in srgb, var(--accent) 72%, transparent);
  background: rgba(255, 255, 255, 0.07);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent);
}

.counter {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: var(--text-faint);
  pointer-events: none;
}

.field.invalid {
  animation: shakeX 0.5s ease;
}

.field.invalid input {
  border-color: #ff4b6b;
  box-shadow: 0 0 0 4px rgba(255, 75, 107, 0.18);
}

@keyframes shakeX {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-9px);
  }
  40% {
    transform: translateX(8px);
  }
  60% {
    transform: translateX(-5px);
  }
  80% {
    transform: translateX(3px);
  }
}

.examples {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 380px;
}

.chip {
  padding: 7px 15px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.035);
  transition:
    transform 0.16s ease,
    color 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}

.chip:hover {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.chip:active {
  transform: scale(0.94);
}

.chip-roll {
  padding: 7px 12px;
  color: var(--text-faint);
}

.go {
  width: min(100%, 380px);
  margin-top: 6px;
  animation: popIn 0.5s 0.12s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-faint);
}
</style>
