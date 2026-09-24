<script setup lang="ts">
/**
 * 投掷页（方案 §三 初始化 / §四 玩法 / §五 靶子变化）。
 *
 * 这一页只负责「手感」：飞镖从屏幕下方掷出 → 命中点判定 → 震屏 / 粒子 / 飘字 / 血条回扣。
 * 数值判定全在 useGame 里，这里不碰规则。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TargetBoard from '@/components/TargetBoard.vue'
import Dart from '@/components/Dart.vue'
import ParticleEffect from '@/components/ParticleEffect.vue'
import ResultPanel from '@/components/ResultPanel.vue'
import { useGame } from '@/composables/useGame'
import { randFloat } from '@/utils/random'
import { isMuted, playTick, toggleMuted, unlockAudio } from '@/utils/audio'
import type { ThrowResolution } from '@/composables/useGame'
import type { ThrowOutcome } from '@/types'

const {
  phase,
  targetName,
  emotion,
  hp,
  maxHp,
  dartCount,
  maxDarts,
  score,
  hitCount,
  combo,
  records,
  result,
  floaters,
  destroyed,
  over,
  again,
  restart,
  throwDart,
  finish,
  spawnFloater
} = useGame()

/** 飞镖飞行时长，和 Dart.vue 的 --fly 必须一致 */
const FLIGHT_MS = 340
/** 两次投掷之间的最小间隔，防连点把节奏打散 */
const THROW_GAP_MS = 150
/** 结算前的留白，等最后一次爆炸演完 */
const SETTLE_MS = 1250

const rootEl = ref<HTMLElement | null>(null)
const arenaEl = ref<HTMLElement | null>(null)
const boardComp = ref<InstanceType<typeof TargetBoard> | null>(null)
const fx = ref<InstanceType<typeof ParticleEffect> | null>(null)

const muted = ref(isMuted())

interface LiveDart {
  id: number
  dx: number
  dy: number
  spin: number
  mode: 'hit' | 'miss'
}

const liveDarts = ref<LiveDart[]>([])
let dartSeq = 0
let lastThrowAt = 0
let settleTimer = 0
const hpTimers: number[] = []

/** HUD 上的血量按飞镖落地时间回扣，而不是按下时 —— 否则血条会先掉、镖后到 */
const displayHp = ref(hp.value)
const hpPercent = computed(() => Math.max(0, displayHp.value))

const dartsLeft = computed(() => dartCount.value)

const hintText = computed(() => {
  if (destroyed.value) return '靶子已击碎'
  if (over.value) return '飞镖用完了'
  return records.length === 0 ? '点击屏幕投掷' : '继续点，别停'
})

function shake(power: number): void {
  const el = rootEl.value
  if (!el) return
  el.style.setProperty('--shake-power', power.toFixed(2))
  el.classList.remove('shaking', 'hard')
  // 强制回流，让同一个 animation 能反复触发
  void el.offsetWidth
  el.classList.add('shaking')
  if (power >= 1.5) el.classList.add('hard')
}

/** 只处理根节点自己的抖动结束 —— 子组件的 animationend 会冒泡上来 */
function onShakeEnd(ev: AnimationEvent): void {
  if (ev.target !== rootEl.value) return
  rootEl.value?.classList.remove('shaking', 'hard')
}

/** 靶面内随机一点（面积均匀分布，收在 80% 半径内，避免镖总扎在边上） */
function impactPoint(): { x: number; y: number } | null {
  const arena = arenaEl.value
  const board = boardComp.value?.boardEl
  if (!arena || !board) return null
  const a = arena.getBoundingClientRect()
  const b = board.getBoundingClientRect()
  const cx = b.left - a.left + b.width / 2
  const cy = b.top - a.top + b.height / 2
  const ang = randFloat(0, Math.PI * 2)
  const rad = Math.sqrt(Math.random()) * (b.width / 2) * 0.8
  return { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad }
}

/** 偏转时的掠过点：靶外一圈，仍留在屏幕内 */
function grazePoint(): { x: number; y: number } | null {
  const arena = arenaEl.value
  const board = boardComp.value?.boardEl
  if (!arena || !board) return null
  const a = arena.getBoundingClientRect()
  const b = board.getBoundingClientRect()
  const cx = b.left - a.left + b.width / 2
  const cy = b.top - a.top + b.height / 2
  const ang = randFloat(0, Math.PI * 2)
  const rad = (b.width / 2) * randFloat(1.1, 1.42)
  return { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad }
}

/** 把靶面坐标换算成相对投掷原点（屏幕下方中央）的位移与镖尖角度 */
function toDartVector(p: { x: number; y: number }, arena: HTMLElement) {
  const a = arena.getBoundingClientRect()
  const dx = p.x - a.width / 2
  const dy = p.y - a.height
  return { dx, dy, spin: (Math.atan2(dx, -dy) * 180) / Math.PI }
}

const FLOAT_KIND: Record<ThrowOutcome, 'damage' | 'crit' | 'miss'> = {
  hit: 'damage',
  double: 'damage',
  crit: 'crit',
  miss: 'miss'
}

/** 落点特效：粒子、飘字、震屏 */
function impact(res: ThrowResolution, p: { x: number; y: number }): void {
  const meta = emotion.value

  if (res.outcome === 'miss') {
    fx.value?.puff(p.x, p.y, meta.glow)
    spawnFloater(res.line, 'miss', p.x, p.y, 1300)
    return
  }

  const power = res.outcome === 'crit' ? 1.9 : res.outcome === 'double' ? 1.5 : 1
  fx.value?.burst({
    x: p.x,
    y: p.y,
    shape: meta.particle,
    color: meta.color,
    glow: meta.glow,
    power
  })
  if (res.destroyed) {
    fx.value?.burst({
      x: p.x,
      y: p.y,
      shape: meta.particle,
      color: '#ffffff',
      glow: meta.glow,
      count: 54,
      power: 2.2
    })
  }

  const text =
    res.outcome === 'crit' ? `暴击 -${res.damage}` : res.outcome === 'double' ? `双倍 -${res.damage}` : `-${res.damage}`
  spawnFloater(text, FLOAT_KIND[res.outcome], p.x, p.y)

  shake(power)
  // 连击只放在底部状态条上 —— 跟着落点飘会和伤害数字叠在一起
}

function onThrow(): void {
  unlockAudio()
  if (phase.value !== 'playing' || over.value) return

  const now = performance.now()
  if (now - lastThrowAt < THROW_GAP_MS) return
  lastThrowAt = now

  const arena = arenaEl.value
  if (!arena) return

  const res = throwDart()
  if (!res) return

  const isMiss = res.outcome === 'miss'
  const point = isMiss ? grazePoint() : impactPoint()
  if (!point) return

  const { dx, dy, spin } = toDartVector(point, arena)

  liveDarts.value.push({
    id: ++dartSeq,
    dx,
    dy,
    spin,
    mode: isMiss ? 'miss' : 'hit'
  })

  // 血条跟着飞镖一起落地
  const target = hp.value
  const t = window.setTimeout(() => {
    displayHp.value = target
  }, FLIGHT_MS)
  hpTimers.push(t)

  const impactAt = window.setTimeout(() => impact(res, point), FLIGHT_MS)
  hpTimers.push(impactAt)
}

function removeDart(id: number): void {
  const i = liveDarts.value.findIndex((d) => d.id === id)
  if (i >= 0) liveDarts.value.splice(i, 1)
}

function toggleSound(): void {
  muted.value = toggleMuted()
  if (!muted.value) playTick()
}

/** 清掉这一局的定时器与残留特效 */
function clearLive(): void {
  window.clearTimeout(settleTimer)
  hpTimers.forEach((t) => window.clearTimeout(t))
  hpTimers.length = 0
  liveDarts.value = []
  fx.value?.clear()
  displayHp.value = hp.value
}

function goHome(): void {
  playTick()
  clearLive()
  restart()
}

/** 结果页的「再来一次」：同一个靶子、同一种情绪，重新开始 */
function playAgain(): void {
  clearLive()
  again()
}

/** 一局结束：等最后一次爆炸演完再弹结算 */
watch(over, (v) => {
  if (!v) return
  window.clearTimeout(settleTimer)
  settleTimer = window.setTimeout(() => finish(), SETTLE_MS)
})

watch(hp, (v) => {
  // 重置时血量回满，显示值立即跟上
  if (v > displayHp.value) displayHp.value = v
})

onMounted(() => {
  // 从首页带过来的情绪：清掉上一局的残留
  liveDarts.value = []
  displayHp.value = hp.value
})

onBeforeUnmount(() => {
  window.clearTimeout(settleTimer)
  hpTimers.forEach((t) => window.clearTimeout(t))
})
</script>

<template>
  <div
    ref="rootEl"
    class="game"
    :style="{ '--accent': emotion.color, '--glow': emotion.glow }"
    @animationend="onShakeEnd"
  >
    <!-- 顶栏：对象名 + 情绪血条 + 剩余飞镖 -->
    <header class="hud">
      <button class="icon-btn" type="button" aria-label="返回" @click="goHome">←</button>

      <div class="hud-main">
        <div class="hud-top">
          <span class="hud-name">{{ targetName }}</span>
          <span class="hud-hp">{{ hpPercent }}%</span>
        </div>
        <div class="hp">
          <div class="hp-ghost" :style="{ width: `${hpPercent}%` }" />
          <div class="hp-fill" :style="{ width: `${hpPercent}%` }" />
        </div>
      </div>

      <button
        class="icon-btn"
        type="button"
        :aria-label="muted ? '开启音效' : '静音'"
        @click="toggleSound"
      >
        {{ muted ? '🔇' : '🔊' }}
      </button>
    </header>

    <div class="darts-left">
      <span class="darts-label">飞镖</span>
      <span class="pips">
        <i v-for="n in maxDarts" :key="n" class="pip" :class="{ used: n > dartsLeft }" />
      </span>
      <span class="darts-num">{{ dartsLeft }}</span>
    </div>

    <!-- 投掷区：整块都是点击热区 -->
    <main ref="arenaEl" class="arena no-select" @pointerdown="onThrow">
      <TargetBoard
        ref="boardComp"
        :name="targetName"
        :hp="hp"
        :max-hp="maxHp"
        :hits="hitCount"
        :destroyed="destroyed"
        :emotion="emotion"
      />

      <Dart
        v-for="d in liveDarts"
        :key="d.id"
        :dx="d.dx"
        :dy="d.dy"
        :spin="d.spin"
        :mode="d.mode"
        :duration="FLIGHT_MS"
        @done="removeDart(d.id)"
      />

      <ParticleEffect ref="fx" />

      <div
        v-for="f in floaters"
        :key="f.id"
        class="floater"
        :class="f.kind"
        :style="{ left: `${f.x}px`, top: `${f.y}px` }"
      >
        {{ f.text }}
      </div>
    </main>

    <!-- 底部提示 -->
    <footer class="foot">
      <Transition name="fade" mode="out-in">
        <p :key="hintText" class="hint">{{ hintText }}</p>
      </Transition>
      <div v-if="records.length" class="score-line">
        <span class="score-num">{{ score }}</span>
        <span class="score-cap">分</span>
        <span v-if="combo >= 2" class="combo">连击 ×{{ combo }}</span>
      </div>
    </footer>

    <Transition name="fade">
      <ResultPanel
        v-if="phase === 'result' && result"
        :result="result"
        :records="records"
        @again="playAgain"
        @home="goHome"
      />
    </Transition>
  </div>
</template>

<style scoped>
.game {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.game.shaking {
  animation: screenShake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  --shake-power: 1;
}

/* 力度靠 --shake-power 缩放位移，暴击时更狠 */
.game.shaking.hard {
  animation-duration: 0.52s;
}

/* ——— 顶栏 ——— */
.hud {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(14px + env(safe-area-inset-top)) 16px 12px;
  background: linear-gradient(to bottom, rgba(11, 13, 20, 0.92) 30%, transparent);
}

.icon-btn {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  font-size: 17px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.05);
  transition: transform 0.16s ease, background 0.2s ease;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.icon-btn:active {
  transform: scale(0.92);
}

.hud-main {
  flex: 1;
  min-width: 0;
}

.hud-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}

.hud-name {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hud-hp {
  font-size: 12px;
  font-weight: 800;
  color: var(--glow);
  font-variant-numeric: tabular-nums;
}

.hp {
  position: relative;
  height: 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.hp-ghost,
.hp-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 999px;
}

/* 白条滞后一点跟上，扣掉的那一段会短暂留白 —— 打击感的一大半在这里 */
.hp-ghost {
  background: rgba(255, 255, 255, 0.55);
  transition: width 0.42s cubic-bezier(0.22, 1, 0.36, 1) 0.26s;
}

.hp-fill {
  background: linear-gradient(90deg, var(--accent), var(--glow));
  box-shadow: 0 0 14px color-mix(in srgb, var(--glow) 65%, transparent);
  transition: width 0.2s ease;
}

/* ——— 剩余飞镖 ——— */
.darts-left {
  position: absolute;
  top: calc(68px + env(safe-area-inset-top));
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: none;
}

.darts-label,
.darts-num {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--text-faint);
}

.darts-num {
  font-variant-numeric: tabular-nums;
  color: var(--glow);
}

.pips {
  display: flex;
  gap: 4px;
}

.pip {
  width: 13px;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--accent), var(--glow));
  box-shadow: 0 0 8px color-mix(in srgb, var(--glow) 60%, transparent);
  transition: opacity 0.3s ease, transform 0.3s ease, background 0.3s ease;
}

.pip.used {
  opacity: 0.22;
  background: #5b6379;
  box-shadow: none;
  transform: scaleY(0.6);
}

/* ——— 投掷区 ——— */
.arena {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: calc(112px + env(safe-area-inset-top)) 20px calc(120px + env(safe-area-inset-bottom));
  cursor: crosshair;
  touch-action: manipulation;
}

/* ——— 飘字 ——— */
.floater {
  position: absolute;
  z-index: 9;
  font-weight: 900;
  font-size: 26px;
  white-space: nowrap;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
  animation: floatUp 1.1s cubic-bezier(0.22, 1, 0.36, 1) both;
  text-shadow: 0 3px 12px rgba(0, 0, 0, 0.85);
}

.floater.damage {
  color: #fff;
}

.floater.crit {
  font-size: 34px;
  color: #ffd166;
  text-shadow:
    0 3px 12px rgba(0, 0, 0, 0.85),
    0 0 24px rgba(255, 209, 102, 0.85);
  animation-duration: 1.25s;
}

.floater.miss {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-dim);
  animation-duration: 1.35s;
}

/* ——— 底部 ——— */
.foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 20px calc(20px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, rgba(11, 13, 20, 0.92) 34%, transparent);
  pointer-events: none;
}

.hint {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-indent: 0.22em;
  color: var(--text-faint);
  animation: breathe 2.6s ease-in-out infinite;
}

.score-line {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.score-num {
  font-size: 21px;
  font-weight: 900;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.score-cap {
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.16em;
}

.combo {
  margin-left: 8px;
  padding: 2px 10px;
  font-size: 11.5px;
  font-weight: 800;
  color: #05060a;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--glow));
  animation: comboPulse 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes comboPulse {
  from {
    transform: scale(0.5);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
