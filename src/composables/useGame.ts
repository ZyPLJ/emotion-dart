import { computed, reactive, ref } from 'vue'
import { EMOTIONS } from '@/data/emotions'
import { clamp, pick } from '@/utils/random'
import { loadBest, saveBest, saveHistory, todayReleased } from '@/utils/storage'
import type {
  EmotionType,
  Floater,
  GameResult,
  Phase,
  ThrowOutcome,
  ThrowRecord
} from '@/types'
import {
  playBreak,
  playCrit,
  playMiss,
  playPop,
  playStart,
  playSuccess,
  playUnfinished,
  playWhoosh
} from '@/utils/audio'

export const MAX_DARTS = 10
export const MAX_HP = 100

/** 普通命中伤害池（方案 §四：-8 / -12 / -15 / -20） */
const DAMAGE_POOL: readonly number[] = [8, 12, 15, 20]
/** 暴击伤害（方案 §九：情绪 -30） */
const CRIT_DAMAGE = 30

/**
 * 概率表（方案 §九：暴击 10%、偏转 20%、双倍 5%）。
 * 用「一次抽样 + 互斥区间」实现，保证三个概率精确且不会同时触发：
 *   [0, .05) 双倍 · [.05, .15) 暴击 · [.15, .35) 偏转 · [.35, 1) 普通命中
 */
const P_DOUBLE = 0.05
const P_CRIT = 0.1
const P_MISS = 0.2

/** 结算加成 */
const BONUS_DESTROY = 200
const BONUS_PER_DART_LEFT = 15

/**
 * 等级门槛按实测评分分布标定（scripts/smoke.mjs）：
 * 均值 525、p99 约 755、上限约 910，所以六级分别对应
 * 「垫底 ~7% / 大众 / 中位 / 前 30% / 前 5% / 前 0.2%」。
 */
const LEVELS = [
  { min: 0, title: '情绪新手' },
  { min: 200, title: '出气学徒' },
  { min: 380, title: '稳定发挥' },
  { min: 540, title: '释放好手' },
  { min: 700, title: '精准释放者' },
  { min: 840, title: '情绪管理大师' }
] as const

export interface ThrowResolution {
  outcome: ThrowOutcome
  /** 本次投掷造成的总伤害 */
  damage: number
  /** 消耗的飞镖数 */
  cost: number
  /** 结算后的连击数 */
  combo: number
  /** 是否由这一下击碎了靶子 */
  destroyed: boolean
  /** 飘出的文案 */
  line: string
}

// ——— 单例状态：一局游戏同时只有一个，组件直接共享 ———

const phase = ref<Phase>('input')
const targetName = ref('')
const emotionType = ref<EmotionType>('angry')

const hp = ref(MAX_HP)
const dartCount = ref(MAX_DARTS)
const score = ref(0)
const hitCount = ref(0)
const critical = ref(0)
const missCount = ref(0)
const combo = ref(0)
const maxCombo = ref(0)
const records = reactive<ThrowRecord[]>([])

const result = ref<GameResult | null>(null)
const best = ref(loadBest())
const floaters = reactive<Floater[]>([])

let floaterSeq = 0
let floaterTimers = new Set<number>()

const emotion = computed(() => EMOTIONS[emotionType.value])
const hpPercent = computed(() => clamp(hp.value, 0, MAX_HP))
const destroyed = computed(() => hp.value <= 0)
/** 飞镖用尽或靶子被击碎，本局结束 */
const over = computed(() => destroyed.value || dartCount.value <= 0)
const throwsMade = computed(() => records.length)
const accuracy = computed(() => {
  const totalDarts = records.reduce((n, r) => n + r.cost, 0)
  return totalDarts === 0 ? 0 : (hitCount.value / totalDarts) * 100
})

export function levelFor(value: number): { level: number; title: string } {
  let idx = 0
  for (let i = 0; i < LEVELS.length; i++) {
    if (value >= LEVELS[i].min) idx = i
  }
  return { level: idx + 1, title: LEVELS[idx].title }
}

/** 连击加成，单次最高 +100 */
const comboBonus = (at: number): number => Math.min((at - 1) * 10, 100)

export function spawnFloater(
  text: string,
  kind: Floater['kind'],
  x: number,
  y: number,
  ttl = 1100
): void {
  const id = ++floaterSeq
  floaters.push({ id, text, kind, x, y })
  const timer = window.setTimeout(() => {
    const i = floaters.findIndex((f) => f.id === id)
    if (i >= 0) floaters.splice(i, 1)
    floaterTimers.delete(timer)
  }, ttl)
  floaterTimers.add(timer)
}

function clearFloaters(): void {
  floaterTimers.forEach((t) => window.clearTimeout(t))
  floaterTimers = new Set()
  floaters.splice(0, floaters.length)
}

export function useGame() {
  function setName(name: string): void {
    targetName.value = name.trim().slice(0, 12)
  }

  function setEmotion(type: EmotionType): void {
    emotionType.value = type
  }

  function toPhase(next: Phase): void {
    phase.value = next
  }

  function reset(): void {
    hp.value = MAX_HP
    dartCount.value = MAX_DARTS
    score.value = 0
    hitCount.value = 0
    critical.value = 0
    missCount.value = 0
    combo.value = 0
    maxCombo.value = 0
    records.splice(0, records.length)
    result.value = null
    clearFloaters()
  }

  /** 确认目标与情绪后进入投掷 */
  function start(): void {
    reset()
    phase.value = 'playing'
    playStart()
  }

  /** 回到首页重新输入 */
  function restart(): void {
    reset()
    phase.value = 'input'
  }

  /** 只换情绪、保留同一个靶子再来一局 */
  function again(): void {
    reset()
    phase.value = 'playing'
    playStart()
  }

  /**
   * 结算一次投掷。视觉表现由 Game.vue 负责，这里只做数值与判定。
   * 返回 null 表示当前不可投掷。
   */
  function throwDart(): ThrowResolution | null {
    if (phase.value !== 'playing' || over.value) return null

    playWhoosh()

    const roll = Math.random()
    let outcome: ThrowOutcome
    if (roll < P_DOUBLE && dartCount.value >= 2) outcome = 'double'
    else if (roll < P_DOUBLE + P_CRIT) outcome = 'crit'
    else if (roll < P_DOUBLE + P_CRIT + P_MISS) outcome = 'miss'
    else outcome = 'hit'

    const meta = emotion.value
    const cost = outcome === 'double' ? 2 : 1
    let damage = 0
    let earned = 0
    let line = ''

    if (outcome === 'miss') {
      combo.value = 0
      missCount.value += 1
      line = pick(meta.missLines)
      playMiss()
    } else if (outcome === 'crit') {
      damage = CRIT_DAMAGE
      critical.value += 1
      hitCount.value += 1
      combo.value += 1
      maxCombo.value = Math.max(maxCombo.value, combo.value)
      earned = 80 + comboBonus(combo.value)
      line = pick(meta.critLines)
      playCrit()
    } else {
      if (outcome === 'double') {
        // 双倍释放：两支镖分别结算伤害与连击
        for (let i = 0; i < 2; i++) {
          const d = pick(DAMAGE_POOL)
          damage += d
          hitCount.value += 1
          combo.value += 1
          maxCombo.value = Math.max(maxCombo.value, combo.value)
          earned += 20 + comboBonus(combo.value)
        }
        line = `${meta.hitLines[0]} 双倍释放！`
      } else {
        damage = pick(DAMAGE_POOL)
        hitCount.value += 1
        combo.value += 1
        maxCombo.value = Math.max(maxCombo.value, combo.value)
        earned = 20 + comboBonus(combo.value)
        line = pick(meta.hitLines)
      }
      // 压力模式听气泡破裂更贴切
      if (meta.particle === 'bubble') playPop()
    }

    score.value += earned
    dartCount.value = Math.max(0, dartCount.value - cost)

    const wasAlive = hp.value > 0
    hp.value = Math.max(0, hp.value - damage)
    const justDestroyed = wasAlive && hp.value <= 0

    records.push({
      index: records.length + 1,
      outcome,
      damage,
      combo: combo.value,
      cost
    })

    if (outcome !== 'miss' && justDestroyed) {
      playBreak()
      setTimeout(() => playSuccess(), 320)
    }

    return {
      outcome,
      damage,
      cost,
      combo: combo.value,
      destroyed: justDestroyed,
      line
    }
  }

  /** 收尾：计算释放度、评级，落盘历史 */
  function finish(): GameResult {
    const dealt = MAX_HP - Math.max(0, hp.value)
    const damagePercent = clamp((dealt / MAX_HP) * 100, 0, 100)
    // 释放度 = 七成看打掉多少，三成看有没有打偏 —— 打飞镖也算数，但别全偏
    const releasePercent = Math.round(damagePercent * 0.7 + accuracy.value * 0.3)
    const total =
      score.value +
      (destroyed.value ? BONUS_DESTROY : 0) +
      dartCount.value * BONUS_PER_DART_LEFT
    const { level, title } = levelFor(total)

    const payload: GameResult = {
      targetName: targetName.value,
      emotion: emotionType.value,
      destroyed: destroyed.value,
      releasePercent,
      score: total,
      level,
      levelTitle: title,
      hitCount: hitCount.value,
      critical: critical.value,
      missCount: missCount.value,
      maxCombo: maxCombo.value,
      totalDamage: dealt,
      todayReleased: 0
    }

    const history = saveHistory({
      name: payload.targetName,
      emotion: payload.emotion,
      score: payload.score,
      releasePercent: payload.releasePercent,
      at: Date.now()
    })
    payload.todayReleased = history
      .filter((e) => e.at >= startOfToday())
      .reduce((sum, e) => sum + e.releasePercent, 0)
    // 兜底：万一 storage 不可用，直接用工具函数再算一次
    if (payload.todayReleased === 0) payload.todayReleased = todayReleased()

    best.value = saveBest(payload.score)
    result.value = payload
    phase.value = 'result'

    if (!payload.destroyed) playUnfinished()
    return payload
  }

  return {
    // 状态
    phase,
    targetName,
    emotionType,
    emotion,
    hp,
    hpPercent,
    maxHp: MAX_HP,
    dartCount,
    maxDarts: MAX_DARTS,
    score,
    hitCount,
    critical,
    missCount,
    combo,
    maxCombo,
    records,
    result,
    best,
    floaters,
    destroyed,
    over,
    throwsMade,
    accuracy,
    // 动作
    setName,
    setEmotion,
    toPhase,
    start,
    restart,
    again,
    throwDart,
    finish,
    spawnFloater
  }
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

