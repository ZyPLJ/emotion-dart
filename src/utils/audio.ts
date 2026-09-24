/**
 * 音效层（方案 §十三）。
 *
 * 方案里写的是 whoosh/hit/break/success 四个 mp3，但音频文件不是代码能生成的。
 * 这里改用 Web Audio API 实时合成：零资源体积、无加载等待、离线可用，
 * 而且每次命中的音高可以带一点随机抖动，连续投掷不会听腻。
 *
 * 浏览器自动播放策略要求 AudioContext 必须由用户手势创建/恢复，
 * 所以所有播放函数内部都会做一次 ensure()，并在首次点击时解锁。
 */

const MUTE_KEY = 'emotion-dart:muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null

let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
})()

export const isMuted = (): boolean => muted

export function setMuted(next: boolean): void {
  muted = next
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0')
  } catch {
    /* 忽略隐私模式写入失败 */
  }
  if (master && ctx) {
    master.gain.setTargetAtTime(next ? 0 : 0.9, ctx.currentTime, 0.01)
  }
}

export const toggleMuted = (): boolean => {
  setMuted(!muted)
  return muted
}

/** 在首次用户手势里调用，解锁音频上下文 */
export function unlockAudio(): void {
  ensure()
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try {
      ctx = new AC()
    } catch {
      return null
    }
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.9
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function whiteNoise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    const len = Math.floor(c.sampleRate * 1.2)
    noiseBuf = c.createBuffer(1, len, c.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

interface ToneOpts {
  type?: OscillatorType
  from: number
  to?: number
  dur: number
  gain?: number
  delay?: number
}

/** 一个带指数衰减包络的扫频音 */
function tone(c: AudioContext, o: ToneOpts): void {
  if (!master) return
  const t0 = c.currentTime + (o.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.from, t0)
  if (o.to !== undefined && o.to !== o.from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.dur)
  }
  const peak = o.gain ?? 0.3
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, o.dur * 0.2))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  osc.connect(g).connect(master)
  osc.start(t0)
  osc.stop(t0 + o.dur + 0.02)
}

interface NoiseOpts {
  dur: number
  gain?: number
  delay?: number
  type?: BiquadFilterType
  from?: number
  to?: number
  q?: number
}

/** 一段经过滤波、带衰减的噪声 */
function noise(c: AudioContext, o: NoiseOpts): void {
  if (!master) return
  const t0 = c.currentTime + (o.delay ?? 0)
  const src = c.createBufferSource()
  src.buffer = whiteNoise(c)
  const filter = c.createBiquadFilter()
  filter.type = o.type ?? 'bandpass'
  filter.frequency.setValueAtTime(o.from ?? 1200, t0)
  if (o.to !== undefined && o.to !== o.from) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur)
  }
  filter.Q.value = o.q ?? 1
  const g = c.createGain()
  const peak = o.gain ?? 0.25
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.01, o.dur * 0.25))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  src.connect(filter).connect(g).connect(master)
  src.start(t0)
  src.stop(t0 + o.dur + 0.02)
}

/** 投掷破空声 */
export function playWhoosh(): void {
  const c = ensure()
  if (!c || muted) return
  noise(c, { dur: 0.26, gain: 0.16, type: 'bandpass', from: 2400, to: 260, q: 0.9 })
  tone(c, { type: 'sine', from: 620, to: 180, dur: 0.2, gain: 0.06 })
}

/** 普通命中：低频闷响 + 高频碎裂 */
export function playHit(combo = 0): void {
  const c = ensure()
  if (!c || muted) return
  // 连击越高，音高越亮，制造「越打越顺」的手感
  const lift = Math.min(combo, 8) * 22
  tone(c, { type: 'sine', from: 190 + lift, to: 58, dur: 0.16, gain: 0.42 })
  noise(c, { dur: 0.09, gain: 0.2, type: 'highpass', from: 1400, to: 3200 })
}

/** 暴击：命中声 + 一记上扬的亮音 + 长尾噪声 */
export function playCrit(): void {
  const c = ensure()
  if (!c || muted) return
  tone(c, { type: 'sine', from: 220, to: 50, dur: 0.28, gain: 0.5 })
  tone(c, { type: 'square', from: 880, to: 1760, dur: 0.18, gain: 0.1 })
  noise(c, { dur: 0.34, gain: 0.28, type: 'bandpass', from: 3000, to: 700, q: 0.7 })
}

/** 偏转：一声轻轻掠过的下滑音，不带攻击性 */
export function playMiss(): void {
  const c = ensure()
  if (!c || muted) return
  tone(c, { type: 'sine', from: 520, to: 170, dur: 0.34, gain: 0.1 })
  noise(c, { dur: 0.3, gain: 0.07, type: 'bandpass', from: 900, to: 2400, q: 1.2 })
}

/** 破坏 / 击碎 */
export function playBreak(): void {
  const c = ensure()
  if (!c || muted) return
  noise(c, { dur: 0.55, gain: 0.34, type: 'lowpass', from: 4200, to: 420, q: 0.6 })
  tone(c, { type: 'sawtooth', from: 160, to: 40, dur: 0.42, gain: 0.24 })
  // 几片零散的碎屑声
  for (let i = 0; i < 4; i++) {
    noise(c, {
      dur: 0.07,
      gain: 0.1,
      type: 'highpass',
      from: 2600 + Math.random() * 2200,
      delay: 0.04 + i * 0.055
    })
  }
}

/** 气泡破裂（压力模式） */
export function playPop(): void {
  const c = ensure()
  if (!c || muted) return
  tone(c, { type: 'sine', from: 900, to: 220, dur: 0.075, gain: 0.24 })
  noise(c, { dur: 0.05, gain: 0.12, type: 'highpass', from: 2200 })
}

/** 释放完成的上行琶音 */
export function playSuccess(): void {
  const c = ensure()
  if (!c || muted) return
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => {
    tone(c, { type: 'triangle', from: f, dur: 0.5, gain: 0.16, delay: i * 0.095 })
    tone(c, { type: 'sine', from: f * 2, dur: 0.32, gain: 0.05, delay: i * 0.095 })
  })
}

/** 未击碎、飞镖用尽时的收尾音 */
export function playUnfinished(): void {
  const c = ensure()
  if (!c || muted) return
  const notes = [440, 392, 329.63]
  notes.forEach((f, i) => {
    tone(c, { type: 'triangle', from: f, dur: 0.45, gain: 0.13, delay: i * 0.13 })
  })
}

/** UI 轻点 */
export function playTick(): void {
  const c = ensure()
  if (!c || muted) return
  tone(c, { type: 'sine', from: 1180, to: 900, dur: 0.06, gain: 0.1 })
}

/** 开始释放的入场音 */
export function playStart(): void {
  const c = ensure()
  if (!c || muted) return
  tone(c, { type: 'triangle', from: 220, to: 660, dur: 0.36, gain: 0.16 })
  noise(c, { dur: 0.4, gain: 0.12, type: 'bandpass', from: 400, to: 2600, q: 0.8 })
}
