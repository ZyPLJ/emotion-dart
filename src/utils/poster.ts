import { EMOTIONS } from '@/data/emotions'
import type { GameResult, ThrowOutcome } from '@/types'

/**
 * 分享海报（方案 §十四：生成分享海报）。
 *
 * 纯 canvas 绘制，不依赖任何外部图片，所以离线、无跨域问题。
 * 图标全部用矢量画出来，不靠 emoji —— emoji 在各平台的基线/宽度差异
 * 会让排版在海报这种固定尺寸的介质上跑偏。
 */

const W = 750
const H = 1040
const PAD = 64

const FONT = '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans SC", sans-serif'

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

/** 按可用宽度自动缩放字号，保证长名字不被截断 */
function fitText(
  c: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  startSize: number,
  minSize = 26
): number {
  let size = startSize
  while (size > minSize) {
    c.font = `${weight} ${size}px ${FONT}`
    if (c.measureText(text).width <= maxWidth) break
    size -= 2
  }
  return size
}

const OUTCOME_COLOR: Record<ThrowOutcome, string> = {
  hit: '#8b93a7',
  crit: '#ffd166',
  miss: '#3a4152',
  double: '#5ce1a8'
}

export function drawPoster(result: GameResult, outcomes: ThrowOutcome[]): HTMLCanvasElement {
  const meta = EMOTIONS[result.emotion]
  const canvas = document.createElement('canvas')
  const dpr = 2
  canvas.width = W * dpr
  canvas.height = H * dpr
  const c = canvas.getContext('2d')
  if (!c) return canvas
  c.scale(dpr, dpr)

  // ——— 背景 ———
  const bg = c.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0b0d14')
  bg.addColorStop(1, meta.deep)
  c.fillStyle = bg
  c.fillRect(0, 0, W, H)

  const halo = c.createRadialGradient(W / 2, 120, 0, W / 2, 120, 620)
  halo.addColorStop(0, hexA(meta.color, 0.42))
  halo.addColorStop(0.5, hexA(meta.glow, 0.12))
  halo.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = halo
  c.fillRect(0, 0, W, 700)

  // 外描边
  c.strokeStyle = 'rgba(255,255,255,0.075)'
  c.lineWidth = 2
  roundRect(c, 22, 22, W - 44, H - 44, 40)
  c.stroke()

  c.textAlign = 'center'

  // ——— 顶部：矢量小靶心 ———
  const cx = W / 2
  const cy = 130
  drawTarget(c, cx, cy, 42, meta.color, meta.glow)

  c.fillStyle = 'rgba(255,255,255,0.5)'
  c.font = `600 22px ${FONT}`
  c.fillText('情 绪 飞 镖 场', cx, cy + 86)

  // ——— 对象名 ———
  const name = result.targetName || '无名'
  const nameSize = fitText(c, name, W - PAD * 2 - 40, 900, 78)
  c.fillStyle = '#ffffff'
  c.font = `900 ${nameSize}px ${FONT}`
  c.shadowColor = hexA(meta.glow, 0.75)
  c.shadowBlur = 34
  c.fillText(name, cx, cy + 188)
  c.shadowBlur = 0

  // ——— 状态语 ———
  c.fillStyle = hexA(meta.glow, 0.95)
  c.font = `700 26px ${FONT}`
  c.fillText(
    result.destroyed ? `已成功释放 · ${meta.label}模式` : `${meta.label}还没散尽 · 下次再来`,
    cx,
    cy + 234
  )

  // ——— 释放度圆环 ———
  const ringY = 508
  const ringR = 108
  c.lineWidth = 20
  c.lineCap = 'round'
  c.strokeStyle = 'rgba(255,255,255,0.08)'
  c.beginPath()
  c.arc(cx, ringY, ringR, 0, Math.PI * 2)
  c.stroke()

  const end = -Math.PI / 2 + (Math.PI * 2 * result.releasePercent) / 100
  const ringGrad = c.createLinearGradient(cx - ringR, ringY - ringR, cx + ringR, ringY + ringR)
  ringGrad.addColorStop(0, meta.color)
  ringGrad.addColorStop(1, meta.glow)
  c.strokeStyle = ringGrad
  c.beginPath()
  c.arc(cx, ringY, ringR, -Math.PI / 2, end)
  c.stroke()

  c.fillStyle = '#ffffff'
  c.font = `900 76px ${FONT}`
  c.fillText(`${result.releasePercent}%`, cx, ringY + 14)
  c.fillStyle = 'rgba(255,255,255,0.42)'
  c.font = `600 22px ${FONT}`
  c.fillText('情绪释放度', cx, ringY + 52)

  // ——— 三段数据 ———
  const cells: Array<[string, string]> = [
    ['释放评分', String(result.score)],
    ['等级', `Lv.${result.level}`],
    ['最高连击', result.maxCombo > 0 ? `${result.maxCombo} 连` : '—']
  ]
  const cellW = (W - PAD * 2 - 32) / 3
  const cellY = 656
  cells.forEach(([label, value], i) => {
    const x = PAD + i * (cellW + 16)
    c.fillStyle = 'rgba(255,255,255,0.045)'
    roundRect(c, x, cellY, cellW, 104, 22)
    c.fill()
    c.strokeStyle = 'rgba(255,255,255,0.07)'
    c.lineWidth = 1.5
    c.stroke()

    c.fillStyle = 'rgba(255,255,255,0.45)'
    c.font = `600 19px ${FONT}`
    c.fillText(label, x + cellW / 2, cellY + 38)

    c.fillStyle = i === 1 ? meta.glow : '#ffffff'
    c.font = `900 34px ${FONT}`
    c.fillText(value, x + cellW / 2, cellY + 80)
  })

  // ——— 评级 ———
  c.fillStyle = meta.glow
  c.font = `800 30px ${FONT}`
  c.fillText(result.levelTitle, cx, 812)

  // ——— 投掷轨迹 ———
  if (outcomes.length) {
    const dotR = 8
    // 镖数多时自动收紧间距，避免溢出画布
    const gap = Math.min(30, (W - PAD * 2 - 60) / Math.max(1, outcomes.length - 1))
    const startX = cx - ((outcomes.length - 1) * gap) / 2
    const y = 860
    outcomes.forEach((o, i) => {
      c.fillStyle = OUTCOME_COLOR[o]
      c.globalAlpha = o === 'miss' ? 0.55 : 1
      c.beginPath()
      c.arc(startX + i * gap, y, o === 'crit' ? dotR + 3 : dotR, 0, Math.PI * 2)
      c.fill()
    })
    c.globalAlpha = 1
    c.fillStyle = 'rgba(255,255,255,0.3)'
    c.font = `600 17px ${FONT}`
    c.fillText('投 掷 轨 迹', cx, y + 36)
  }

  // ——— 底部 ———
  c.fillStyle = 'rgba(255,255,255,0.26)'
  c.font = `600 20px ${FONT}`
  c.fillText('把今天的不爽扔出去', cx, 958)

  const d = new Date()
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
    d.getDate()
  ).padStart(2, '0')}`
  c.fillStyle = 'rgba(255,255,255,0.16)'
  c.font = `600 18px ${FONT}`
  c.fillText(date, cx, 998)

  return canvas
}

/** 画一个迷你靶心，替代表情图标 */
function drawTarget(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  glow: string
): void {
  c.save()
  c.shadowColor = hexA(glow, 0.9)
  c.shadowBlur = 40
  c.fillStyle = hexA(color, 0.22)
  c.beginPath()
  c.arc(cx, cy, r, 0, Math.PI * 2)
  c.fill()
  c.restore()

  const rings = 3
  for (let i = rings; i >= 1; i--) {
    const rr = (r * i) / rings
    c.strokeStyle = i % 2 === 1 ? color : glow
    c.lineWidth = 6
    c.beginPath()
    c.arc(cx, cy, rr, 0, Math.PI * 2)
    c.stroke()
  }
  c.fillStyle = glow
  c.beginPath()
  c.arc(cx, cy, r * 0.16, 0, Math.PI * 2)
  c.fill()
}

/** #rrggbb + alpha → rgba() */
function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((s) => s + s).join('') : h
  const n = parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function posterToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((b) => resolve(b), 'image/png', 0.95)
    } else {
      resolve(null)
    }
  })
}
