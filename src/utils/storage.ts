import type { EmotionType, HistoryEntry } from '@/types'

const HISTORY_KEY = 'emotion-dart:history:v1'
const BEST_KEY = 'emotion-dart:best:v1'
const MAX_ENTRIES = 200

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    // 隐私模式 / 数据损坏时静默降级，不影响游戏主流程
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 忽略配额或隐私模式错误 */
  }
}

export function loadHistory(): HistoryEntry[] {
  const list = read<HistoryEntry[]>(HISTORY_KEY, [])
  return Array.isArray(list) ? list : []
}

export function saveHistory(entry: HistoryEntry): HistoryEntry[] {
  const list = [entry, ...loadHistory()].slice(0, MAX_ENTRIES)
  write(HISTORY_KEY, list)
  return list
}

export function clearHistory(): void {
  write(HISTORY_KEY, [])
}

const startOfDay = (t: number): number => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 今天（自然日）累计释放的情绪量 */
export function todayReleased(now = Date.now()): number {
  const from = startOfDay(now)
  return loadHistory()
    .filter((e) => e.at >= from)
    .reduce((sum, e) => sum + e.releasePercent, 0)
}

export interface Aggregated {
  name: string
  count: number
  totalRelease: number
  emotion: EmotionType
}

/** 最近 N 天的对象排行（方案 §十四 版本 3.0） */
export function recentTargets(days = 7, now = Date.now()): Aggregated[] {
  const from = startOfDay(now) - (days - 1) * 86400_000
  const map = new Map<string, Aggregated>()

  for (const e of loadHistory()) {
    if (e.at < from) continue
    const hit = map.get(e.name)
    if (hit) {
      hit.count += 1
      hit.totalRelease += e.releasePercent
    } else {
      map.set(e.name, {
        name: e.name,
        count: 1,
        totalRelease: e.releasePercent,
        emotion: e.emotion
      })
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count || b.totalRelease - a.totalRelease)
}

export function loadBest(): number {
  return read<number>(BEST_KEY, 0)
}

/** 写入并返回历史最高分 */
export function saveBest(score: number): number {
  const best = Math.max(loadBest(), score)
  write(BEST_KEY, best)
  return best
}
