<script setup lang="ts">
/**
 * 粒子层（方案 §三 动画反馈 / §六 情绪模式差异化）。
 *
 * 单个 canvas 承载所有特效，一组 rAF 循环驱动，无粒子时自动停帧。
 * 粒子的形态由情绪决定：
 *   ember  火焰余烬 —— 上飘、加色混合
 *   drop   水滴     —— 落下、带拖尾
 *   rain   雨丝     —— 快速下坠的细线
 *   bubble 气泡     —— 缓慢上浮并破裂的圆环
 *   shard  碎片     —— 高速旋转的碎块
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { ParticleShape } from '@/types'
import { randFloat } from '@/utils/random'

export interface BurstOptions {
  x: number
  y: number
  shape: ParticleShape
  color: string
  glow: string
  count?: number
  /** 力度倍率，暴击/击碎时调高 */
  power?: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  shape: ParticleShape
  rot: number
  vrot: number
  gravity: number
  drag: number
}

interface Ring {
  x: number
  y: number
  r: number
  vr: number
  life: number
  max: number
  color: string
  width: number
}

const canvas = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let last = 0
let w = 0
let h = 0
let particles: Particle[] = []
let rings: Ring[] = []
let observer: ResizeObserver | null = null

function resize(): void {
  const el = canvas.value
  const host = el?.parentElement
  if (!el || !host) return
  const rect = host.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = rect.width
  h = rect.height
  el.width = Math.max(1, Math.round(w * dpr))
  el.height = Math.max(1, Math.round(h * dpr))
  el.style.width = `${w}px`
  el.style.height = `${h}px`
  const c = el.getContext('2d')
  if (c) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx = c
  }
}

/** 各形态的物理参数：情绪不同，坠落的「手感」也不同 */
function physicsOf(shape: ParticleShape) {
  switch (shape) {
    case 'ember':
      return { gravity: -190, drag: 0.86, spread: 300, speed: [90, 330] as const }
    case 'drop':
      return { gravity: 900, drag: 0.97, spread: 210, speed: [140, 400] as const }
    case 'rain':
      return { gravity: 1500, drag: 0.99, spread: 120, speed: [180, 460] as const }
    case 'bubble':
      return { gravity: -70, drag: 0.9, spread: 260, speed: [50, 190] as const }
    case 'shard':
    default:
      return { gravity: 620, drag: 0.94, spread: 460, speed: [180, 620] as const }
  }
}

function makeParticle(o: BurstOptions): Particle {
  const phys = physicsOf(o.shape)
  const angle = randFloat(0, Math.PI * 2)
  const speed = randFloat(phys.speed[0], phys.speed[1]) * (o.power ?? 1)
  const life = randFloat(0.5, 1.15) * (o.shape === 'ember' ? 1.25 : 1)
  return {
    x: o.x + randFloat(-4, 4),
    y: o.y + randFloat(-4, 4),
    vx: Math.cos(angle) * speed + randFloat(-40, 40),
    vy: Math.sin(angle) * speed * (o.shape === 'ember' ? 0.6 : 1) - (o.shape === 'ember' ? 120 : 0),
    life,
    max: life,
    size: randFloat(2.2, 6.4) * (o.power ?? 1),
    color: Math.random() < 0.62 ? o.color : o.glow,
    shape: o.shape,
    rot: randFloat(0, Math.PI * 2),
    vrot: randFloat(-9, 9),
    gravity: phys.gravity,
    drag: phys.drag
  }
}

/** 命中处炸开一片粒子 + 一圈冲击波 */
function burst(o: BurstOptions): void {
  const count = o.count ?? Math.round(26 * (o.power ?? 1))
  for (let i = 0; i < count; i++) particles.push(makeParticle(o))

  rings.push({
    x: o.x,
    y: o.y,
    r: 8,
    vr: 420 * (o.power ?? 1),
    life: 0.42,
    max: 0.42,
    color: o.glow,
    width: 5
  })
  rings.push({
    x: o.x,
    y: o.y,
    r: 2,
    vr: 210 * (o.power ?? 1),
    life: 0.62,
    max: 0.62,
    color: o.color,
    width: 2
  })

  start()
}

/** 飞镖偏了：只在落点扬起一小撮尘土 */
function puff(x: number, y: number, color: string): void {
  for (let i = 0; i < 10; i++) {
    particles.push({
      x,
      y,
      vx: randFloat(-90, 90),
      vy: randFloat(-140, -30),
      life: 0.5,
      max: 0.5,
      size: randFloat(1.6, 3.6),
      color,
      shape: 'rain',
      rot: 0,
      vrot: 0,
      gravity: 420,
      drag: 0.95
    })
  }
  start()
}

const alive = (): boolean => particles.length > 0 || rings.length > 0

function start(): void {
  if (raf || typeof window === 'undefined') return
  last = performance.now()
  raf = requestAnimationFrame(frame)
}

function stop(): void {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function draw(p: Particle, alpha: number): void {
  if (!ctx) return
  ctx.globalAlpha = alpha
  ctx.fillStyle = p.color
  ctx.strokeStyle = p.color

  switch (p.shape) {
    case 'ember': {
      // 加色混合的小光点，越亮越像火
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
      g.addColorStop(0, p.color)
      g.addColorStop(0.4, `${p.color}80`)
      g.addColorStop(1, 'transparent')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'drop': {
      // 水滴：圆头 + 朝上的尖，顺着速度方向拉长
      const len = p.size * 2.6
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(Math.atan2(p.vy, p.vx) - Math.PI / 2)
      ctx.beginPath()
      ctx.moveTo(0, -len)
      ctx.quadraticCurveTo(p.size, -len * 0.3, p.size, 0)
      ctx.arc(0, 0, p.size, 0, Math.PI)
      ctx.quadraticCurveTo(-p.size, -len * 0.3, 0, -len)
      ctx.fill()
      ctx.restore()
      break
    }
    case 'rain': {
      // 雨丝：一条沿速度方向的短线
      const k = 0.035
      ctx.lineWidth = Math.max(1, p.size * 0.5)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k)
      ctx.stroke()
      break
    }
    case 'bubble': {
      // 气泡：空心圆，越往上越大
      const grow = 1 + (1 - p.life / p.max) * 0.9
      ctx.lineWidth = Math.max(1, p.size * 0.42 * (p.life / p.max))
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * grow, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'shard':
    default: {
      // 碎片：旋转的细长三角形
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      const s = p.size * 2.1
      ctx.beginPath()
      ctx.moveTo(0, -s)
      ctx.lineTo(s * 0.5, s * 0.62)
      ctx.lineTo(-s * 0.5, s * 0.62)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      break
    }
  }
}

function frame(now: number): void {
  raf = 0
  if (!ctx) return
  const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000))
  last = now

  ctx.setTransform(
    Math.min(window.devicePixelRatio || 1, 2),
    0,
    0,
    Math.min(window.devicePixelRatio || 1, 2),
    0,
    0
  )
  ctx.clearRect(0, 0, w, h)

  // 冲击波
  ctx.globalCompositeOperation = 'lighter'
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]
    r.life -= dt
    if (r.life <= 0) {
      rings.splice(i, 1)
      continue
    }
    const t = r.life / r.max
    r.r += r.vr * dt
    r.vr *= 0.93
    ctx.globalAlpha = t * t
    ctx.strokeStyle = r.color
    ctx.lineWidth = Math.max(0.5, r.width * t)
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 粒子本体
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life -= dt
    if (p.life <= 0) {
      particles.splice(i, 1)
      continue
    }
    const damp = Math.pow(p.drag, dt * 60)
    p.vx *= damp
    p.vy = p.vy * damp + p.gravity * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rot += p.vrot * dt

    ctx.globalCompositeOperation =
      p.shape === 'ember' || p.shape === 'bubble' ? 'lighter' : 'source-over'

    const t = p.life / p.max
    // 淡入很快、淡出很慢，尾巴拖得长一点更有「消散」感
    draw(p, t > 0.85 ? (1 - t) / 0.15 : t * t)
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  if (alive()) raf = requestAnimationFrame(frame)
}

function clear(): void {
  particles = []
  rings = []
  if (ctx) ctx.clearRect(0, 0, w, h)
  stop()
}

onMounted(() => {
  resize()
  const host = canvas.value?.parentElement
  if (host && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize)
    observer.observe(host)
  }
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', resize)
  stop()
})

defineExpose({ burst, puff, clear, resize })
</script>

<template>
  <canvas ref="canvas" class="fx" aria-hidden="true" />
</template>

<style scoped>
.fx {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
}
</style>
