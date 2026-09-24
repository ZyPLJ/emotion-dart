/** [min, max] 闭区间随机整数 */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** [min, max) 随机浮点 */
export function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

/** 按概率命中，p 为 0~1 */
export function chance(p: number): boolean {
  return Math.random() < p
}

/** 从数组中随机取一项 */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 洗牌（不修改原数组） */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))
