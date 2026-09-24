/**
 * 用无头 Chrome 走一遍完整流程并截图，用来肉眼验收动画与排版。
 * 不依赖 puppeteer —— Node 22 自带 fetch 和 WebSocket，直接讲 CDP。
 *
 *   node scripts/shot.mjs [baseUrl] [outDir]
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:5180/'
const OUT = process.argv[3] ?? 'shots'
const PORT = 9333

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(OUT, { recursive: true })
const profile = join(tmpdir(), `ed-shot-${Date.now()}`)

const chrome = spawn(
  CHROME[0],
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=430,940',
    'about:blank'
  ],
  { stdio: 'ignore' }
)

const cleanup = () => {
  try {
    chrome.kill()
  } catch {
    /* 已退出 */
  }
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* 文件占用，忽略 */
  }
}
process.on('exit', cleanup)

/** 等 CDP HTTP 端点起来 */
async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (r.ok) return
    } catch {
      /* 还没起来 */
    }
    await sleep(250)
  }
  throw new Error('Chrome 调试端口没起来')
}

await waitForChrome()

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('没有可用页面')

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let msgId = 0
const pending = new Map()

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

/** 在页面里求值，返回 JSON 结果 */
async function evaluate(expr) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true
  })
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? '页面求值报错')
  }
  return result.value
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  const file = join(OUT, `${name}.png`)
  writeFileSync(file, Buffer.from(data, 'base64'))
  console.log(`  📸 ${file}`)
}

/** 等某个选择器出现 */
async function waitFor(selector, timeout = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return true
    await sleep(100)
  }
  return false
}

async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1
  })
  await sleep(30)
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1
  })
}

/** 点某个选择器的中心 */
async function clickEl(selector) {
  const box = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!box) throw new Error(`找不到元素：${selector}`)
  await clickAt(box.x, box.y)
}

async function setInput(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
}

// ——————————— 流程 ———————————
await send('Page.enable')
await send('Runtime.enable')

const errors = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description ?? '未知异常')
  }
})

await send('Page.navigate', { url: BASE })
await sleep(1200)

console.log('\n① 首页')
if (!(await waitFor('.title'))) throw new Error('首页没渲染出来')
await shot('01-home')

console.log('② 输入对象')
await setInput('.field input', '老板')
await sleep(200)
await clickEl('.go')
if (!(await waitFor('.pick-stage'))) throw new Error('情绪选择页没出现')
await sleep(500)
await shot('02-emotion')

console.log('③ 选情绪并开始')
// 点「崩溃」那一档，顺便验证换肤是否生效
await clickEl('.grid .mood:nth-child(5)')
await sleep(300)
await clickEl('.actions .btn-primary')
if (!(await waitFor('.board'))) throw new Error('投掷页没渲染出来')
await sleep(700)
await shot('03-game-start')

console.log('④ 投掷')
const arena = await evaluate(`(() => {
  const r = document.querySelector('.arena').getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})()`)
const cx = arena.x + arena.w / 2
const cy = arena.y + arena.h / 2 - 40

// 单发：飞镖刚钉在靶上的瞬间（飞行 340ms + 抖动 420ms）
await clickAt(cx - 20, cy + 10)
await sleep(430)
await shot('04-dart-stuck')

// 连投：看多镖同时在靶 + 连击 + 粒子
for (let i = 0; i < 3; i++) {
  const a = (i / 3) * Math.PI * 2
  await clickAt(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46)
  await sleep(500)
}
await shot('05-throwing')

console.log('⑥ 打到结束')
for (let i = 0; i < 14; i++) {
  const onResult = await evaluate(`!!document.querySelector('.panel')`)
  if (onResult) break
  const a = (i * 2.399) % (Math.PI * 2)
  await clickAt(cx + Math.cos(a) * 52, cy + Math.sin(a) * 52)
  await sleep(430)
}
if (!(await waitFor('.panel', 12000))) throw new Error('结算面板没出现')
await sleep(1400)
await shot('06-result')

console.log('⑦ 分享海报')
const shareBtn = await evaluate(`(() => {
  const btns = [...document.querySelectorAll('.actions .btn')]
  const i = btns.findIndex(b => b.textContent.includes('分享'))
  return i
})()`)
if (shareBtn >= 0) {
  await evaluate(
    `[...document.querySelectorAll('.actions .btn')].find(b => b.textContent.includes('分享')).click()`
  )
  await sleep(1600)
  await shot('07-poster')
}

console.log('\n控制台异常：')
console.log(errors.length ? errors.join('\n') : '  无')

ws.close()
cleanup()
process.exit(errors.length ? 1 : 0)
