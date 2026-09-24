<script setup lang="ts">
/** 结算页（方案 §七 结束页面 / §八 评分系统）。 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { EMOTIONS } from '@/data/emotions'
import type { GameResult, ThrowOutcome, ThrowRecord } from '@/types'
import { drawPoster, posterToBlob } from '@/utils/poster'
import { playTick } from '@/utils/audio'

const props = defineProps<{ result: GameResult; records: ThrowRecord[] }>()
const emit = defineEmits<{ again: []; home: [] }>()

const meta = computed(() => EMOTIONS[props.result.emotion])

/** 数字滚动：结算页最爽的一下是看着评分往上跳 */
function useCountUp(target: () => number, duration = 850) {
  const value = ref(0)
  let raf = 0
  onMounted(() => {
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      value.value = Math.round(target() * eased)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  })
  onBeforeUnmount(() => cancelAnimationFrame(raf))
  return value
}

const shownScore = useCountUp(() => props.result.score, 950)
const shownRelease = useCountUp(() => props.result.releasePercent, 800)

const outcomes = computed<ThrowOutcome[]>(() => props.records.map((r) => r.outcome))

const stats = computed(() => [
  // hitCount 含暴击，这里扣掉，让「命中 + 暴击 + 打偏」正好等于投出去的镖数
  { label: '命中', value: String(props.result.hitCount - props.result.critical), tint: 'var(--text)' },
  { label: '暴击', value: String(props.result.critical), tint: '#ffd166' },
  { label: '打偏', value: String(props.result.missCount), tint: 'var(--text-faint)' },
  { label: '最高连击', value: props.result.maxCombo ? `${props.result.maxCombo}` : '—', tint: 'var(--glow)' }
])

// ——— 分享海报 ———
const posterUrl = ref('')
const posterBlob = ref<Blob | null>(null)
const showPoster = ref(false)
const toast = ref('')
let toastTimer = 0

const flash = (msg: string): void => {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 2200)
}

async function openPoster(): Promise<void> {
  playTick()
  if (!posterUrl.value) {
    const canvas = drawPoster(props.result, outcomes.value)
    const blob = await posterToBlob(canvas)
    posterBlob.value = blob
    posterUrl.value = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png')
  }
  showPoster.value = true
}

function download(): void {
  if (!posterUrl.value) return
  const a = document.createElement('a')
  a.href = posterUrl.value
  a.download = `情绪飞镖_${props.result.targetName}_${props.result.score}.png`
  a.click()
  flash('已保存到下载目录')
}

/** 移动端优先走系统分享面板，桌面端多数不支持带文件的分享，直接下载 */
async function systemShare(): Promise<void> {
  const blob = posterBlob.value
  if (!blob) return download()
  const file = new File([blob], 'emotion-dart.png', { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: '情绪飞镖场',
        text: `我把「${props.result.targetName}」扔了出去，释放度 ${props.result.releasePercent}%`
      })
      return
    } catch {
      /* 用户取消，静默 */
    }
  }
  download()
}

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer)
  if (posterUrl.value.startsWith('blob:')) URL.revokeObjectURL(posterUrl.value)
})
</script>

<template>
  <div class="result-layer">
    <div class="scrim" />

    <div class="panel card" :style="{ '--tint': meta.color, '--tint-glow': meta.glow }">
      <div class="burst">🎉</div>

      <h2 class="name">{{ result.targetName }}</h2>

      <p class="status" :class="{ undone: !result.destroyed }">
        {{ result.destroyed ? '已成功释放！' : '飞镖用完了，情绪还剩一点' }}
      </p>

      <div class="release">
        <div class="release-num">
          <span>{{ shownRelease }}</span><i>%</i>
        </div>
        <div class="release-label">情绪释放度</div>
        <div class="release-bar">
          <div class="release-fill" :style="{ width: `${result.releasePercent}%` }" />
        </div>
      </div>

      <div class="level">
        <span class="level-tag">Lv.{{ result.level }}</span>
        <span class="level-title">{{ result.levelTitle }}</span>
      </div>

      <div class="score">
        <span class="score-label">释放评分</span>
        <strong class="score-value">{{ shownScore }}</strong>
      </div>

      <div class="grid">
        <div v-for="s in stats" :key="s.label" class="cell">
          <span class="cell-value" :style="{ color: s.tint }">{{ s.value }}</span>
          <span class="cell-label">{{ s.label }}</span>
        </div>
      </div>

      <div v-if="outcomes.length" class="track">
        <span
          v-for="(o, i) in outcomes"
          :key="i"
          class="dot"
          :class="o"
          :title="o"
        />
      </div>

      <div class="today">
        今日情绪值
        <strong>⬇️ -{{ result.todayReleased }}</strong>
      </div>

      <div class="actions">
        <button class="btn btn-primary" type="button" @click="emit('again')">再来一次</button>
        <button class="btn btn-ghost" type="button" @click="openPoster">分享结果</button>
      </div>

      <button class="link" type="button" @click="emit('home')">换个对象</button>
    </div>

    <!-- 海报预览 -->
    <Transition name="fade">
      <div v-if="showPoster" class="poster-layer" @click.self="showPoster = false">
        <div class="poster-box">
          <img :src="posterUrl" alt="分享海报" class="poster-img" />
          <div class="poster-actions">
            <button class="btn btn-primary" type="button" @click="systemShare">分享 / 保存</button>
            <button class="btn btn-ghost" type="button" @click="showPoster = false">关闭</button>
          </div>
          <p class="poster-tip">手机上长按图片也能直接保存</p>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.result-layer {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 20px;
}

.scrim {
  position: absolute;
  inset: 0;
  background: rgba(5, 6, 11, 0.82);
  backdrop-filter: blur(9px);
  animation: fadeIn 0.35s ease both;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
}

.panel {
  position: relative;
  width: min(100%, 420px);
  max-height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 26px 24px calc(24px + env(safe-area-inset-bottom));
  text-align: center;
  animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.7),
    0 0 0 1px color-mix(in srgb, var(--tint) 22%, transparent),
    0 0 70px color-mix(in srgb, var(--tint) 22%, transparent);
}

.burst {
  font-size: 46px;
  line-height: 1;
  animation: burstIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes burstIn {
  0% {
    opacity: 0;
    transform: scale(0.2) rotate(-30deg);
  }
  60% {
    opacity: 1;
    transform: scale(1.22) rotate(8deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}

.name {
  margin: 10px 0 2px;
  font-size: clamp(24px, 7vw, 31px);
  font-weight: 900;
  letter-spacing: 0.02em;
  word-break: break-word;
  text-shadow: 0 0 28px color-mix(in srgb, var(--tint-glow) 60%, transparent);
}

.status {
  margin: 0 0 18px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--tint-glow);
}

.status.undone {
  color: var(--text-dim);
}

.release-num {
  font-size: 60px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.release-num i {
  font-size: 26px;
  font-style: normal;
  margin-left: 2px;
  color: var(--text-dim);
}

.release-label {
  margin-top: 4px;
  font-size: 11px;
  letter-spacing: 0.3em;
  color: var(--text-faint);
  text-indent: 0.3em;
}

.release-bar {
  height: 6px;
  margin: 10px auto 18px;
  width: 78%;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.release-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--tint), var(--tint-glow));
  box-shadow: 0 0 16px color-mix(in srgb, var(--tint-glow) 70%, transparent);
  transition: width 0.9s cubic-bezier(0.22, 1, 0.36, 1);
}

.level {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tint) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--tint) 38%, transparent);
}

.level-tag {
  font-size: 13px;
  font-weight: 900;
  color: var(--tint-glow);
}

.level-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.06em;
}

.score {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  margin: 16px 0 14px;
}

.score-label {
  font-size: 12px;
  color: var(--text-faint);
  letter-spacing: 0.18em;
}

.score-value {
  font-size: 32px;
  font-weight: 900;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 20px color-mix(in srgb, var(--tint-glow) 55%, transparent);
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 4px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
}

.cell-value {
  font-size: 19px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.cell-label {
  font-size: 10.5px;
  color: var(--text-faint);
}

.track {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-bottom: 14px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #8b93a7;
}

.dot.crit {
  background: #ffd166;
  box-shadow: 0 0 10px #ffd166;
  transform: scale(1.25);
}

.dot.double {
  background: #5ce1a8;
}

.dot.miss {
  background: transparent;
  border: 1.5px solid #3a4152;
}

.today {
  padding: 9px 0;
  margin-bottom: 16px;
  font-size: 12.5px;
  color: var(--text-dim);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.today strong {
  margin-left: 6px;
  font-size: 15px;
  color: var(--tint-glow);
}

.actions {
  display: flex;
  gap: 10px;
}

.actions .btn {
  flex: 1;
  min-height: 48px;
  font-size: 15.5px;
}

.link {
  margin-top: 14px;
  font-size: 13px;
  color: var(--text-faint);
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: rgba(255, 255, 255, 0.2);
}

.link:hover {
  color: var(--text-dim);
}

/* ——— 海报 ——— */
.poster-layer {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(5, 6, 11, 0.9);
  backdrop-filter: blur(10px);
}

.poster-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-height: 100%;
}

.poster-img {
  max-width: min(78vw, 320px);
  max-height: 66vh;
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
  animation: popIn 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.poster-actions {
  display: flex;
  gap: 10px;
}

.poster-actions .btn {
  min-height: 44px;
  font-size: 14.5px;
  padding: 0 20px;
}

.poster-tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-faint);
}

.toast {
  position: absolute;
  left: 50%;
  bottom: 12%;
  z-index: 40;
  transform: translateX(-50%);
  padding: 10px 20px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(20, 24, 36, 0.95);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}
</style>
