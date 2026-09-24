/** 五种情绪模式（方案 §六） */
export type EmotionType = 'angry' | 'wronged' | 'sad' | 'stress' | 'breakdown'

/** 页面阶段：输入 → 选情绪 → 投掷 → 结算 */
export type Phase = 'input' | 'select' | 'playing' | 'result'

/** 一次投掷的判定结果 */
export type ThrowOutcome =
  | 'hit' // 普通命中
  | 'crit' // 暴击（10%）
  | 'miss' // 偏转（20%）
  | 'double' // 双倍释放（5%）

/** 粒子形态，决定爆炸时碎屑的画法与运动轨迹 */
export type ParticleShape = 'ember' | 'drop' | 'rain' | 'bubble' | 'shard'

export interface EmotionMeta {
  type: EmotionType
  /** 中文名，如「愤怒」 */
  label: string
  emoji: string
  /** 主色，用于血条 / 高亮 */
  color: string
  /** 光晕色，用于辉光与渐隐 */
  glow: string
  /** 环形靶面的深色底 */
  deep: string
  particle: ParticleShape
  /** 情绪氛围一句话 */
  slogan: string
  /** 命中时随机飘出的短句 */
  hitLines: string[]
  critLines: string[]
  missLines: string[]
  finishLines: string[]
}

/** 方案 §十一 核心数据模型 */
export interface GameState {
  targetName: string
  emotionType: EmotionType
  hp: number
  maxHp: number
  dartCount: number
  score: number
  hitCount: number
  critical: number
}

/** 一次投掷的完整记录，用于结算与回放 */
export interface ThrowRecord {
  index: number
  outcome: ThrowOutcome
  damage: number
  combo: number
  /** 消耗的飞镖数，双倍释放为 2 */
  cost: number
}

export interface GameResult {
  targetName: string
  emotion: EmotionType
  /** 是否彻底击碎靶子 */
  destroyed: boolean
  /** 情绪释放度 0~100 */
  releasePercent: number
  score: number
  level: number
  levelTitle: string
  hitCount: number
  critical: number
  missCount: number
  maxCombo: number
  totalDamage: number
  /** 今日累计释放量（含本次） */
  todayReleased: number
}

/** 本地历史记录（方案 §十四 版本 3.0 的轻量版） */
export interface HistoryEntry {
  name: string
  emotion: EmotionType
  score: number
  releasePercent: number
  /** 时间戳（ms） */
  at: number
}

/** 飘字 / 冲击波等一次性特效 */
export interface Floater {
  id: number
  text: string
  kind: 'damage' | 'crit' | 'miss' | 'hint'
  x: number
  y: number
}
