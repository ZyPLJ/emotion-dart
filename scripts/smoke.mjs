/**
 * 逻辑冒烟测试：用 vite 的 SSR 加载器直接跑真实的 useGame 模块，
 * 校验概率表、边界值、评分区间是否符合方案（§四 / §八 / §九）。
 *
 *   node scripts/smoke.mjs
 */
import { createServer } from 'vite'

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error'
})

const mod = await server.ssrLoadModule('/src/composables/useGame.ts')
const { useGame, MAX_DARTS, MAX_HP } = mod

const g = useGame()
const EMOTIONS = ['angry', 'wronged', 'sad', 'stress', 'breakdown']

const counts = { hit: 0, crit: 0, miss: 0, double: 0 }
const results = []
const problems = []
let games = 0
const GAMES = 4000

while (games < GAMES) {
  g.setName(games % 3 === 0 ? '张三' : games % 3 === 1 ? '老板' : '加班')
  g.setEmotion(EMOTIONS[games % EMOTIONS.length])
  g.start()

  let guard = 0
  while (!g.over.value && guard++ < 60) {
    const r = g.throwDart()
    if (!r) {
      problems.push(`第 ${games} 局：over=false 但 throwDart 返回 null`)
      break
    }
    counts[r.outcome]++

    if (g.hp.value < 0) problems.push(`第 ${games} 局：血量出现负值 ${g.hp.value}`)
    if (g.dartCount.value < 0) problems.push(`第 ${games} 局：飞镖数出现负值`)
    if (g.dartCount.value > MAX_DARTS) problems.push(`第 ${games} 局：飞镖数超过上限`)
    if (r.cost === 2 && r.outcome !== 'double') problems.push('扣了两支镖但不是双倍释放')
    if (r.outcome === 'miss' && r.damage !== 0) problems.push('偏转却造成了伤害')
    if (r.outcome === 'crit' && r.damage !== 30) problems.push(`暴击伤害应为 30，实为 ${r.damage}`)
    if (r.outcome === 'hit' && ![8, 12, 15, 20].includes(r.damage)) {
      problems.push(`普通命中伤害 ${r.damage} 不在伤害池内`)
    }
    if (r.combo > 0 && r.outcome === 'miss') problems.push('偏转后连击没有清零')
  }

  if (g.dartCount.value !== 0 && g.hp.value > 0) {
    problems.push(`第 ${games} 局：既没打空飞镖也没打空血却结束了`)
  }
  if (g.hp.value === 0 && g.dartCount.value < 0) problems.push('血量归零时飞镖数为负')

  results.push(g.finish())
  games++
}

// ——— 概率表核对（方案 §九：双倍 5% / 暴击 10% / 偏转 20%）———
const totalThrows = counts.hit + counts.crit + counts.miss + counts.double
const rate = (n) => ((n / totalThrows) * 100).toFixed(2)
const expect = { double: 5, crit: 10, miss: 20 }

console.log(`\n共 ${GAMES} 局 / ${totalThrows} 次投掷\n`)
console.log('判定分布  实测      期望')
for (const [k, want] of Object.entries(expect)) {
  const got = Number(rate(counts[k]))
  const ok = Math.abs(got - want) < 0.9
  console.log(
    `  ${k.padEnd(7)} ${String(got).padStart(6)}%   ${String(want).padStart(3)}%   ${ok ? '✓' : '✗ 偏离'}`
  )
}
console.log(`  hit     ${String(rate(counts.hit)).padStart(6)}%    65%`)

// ——— 结算区间 ———
const scores = results.map((r) => r.score)
const releases = results.map((r) => r.releasePercent)
const levels = [...new Set(results.map((r) => r.level))].sort((a, b) => a - b)
const destroyedRate = (results.filter((r) => r.destroyed).length / GAMES) * 100

console.log('\n结算')
console.log(`  击碎率      ${destroyedRate.toFixed(1)}%`)
console.log(`  评分区间    ${Math.min(...scores)} ~ ${Math.max(...scores)}`)
console.log(`  释放度区间  ${Math.min(...releases)} ~ ${Math.max(...releases)}%`)
console.log(`  出现过的等级 ${levels.join(', ')}`)

const tally = new Map()
for (const r of results) tally.set(r.level, (tally.get(r.level) ?? 0) + 1)
console.log('  等级分布')
for (const lv of levels) {
  const n = tally.get(lv)
  console.log(
    `    Lv.${lv}  ${String(((n / GAMES) * 100).toFixed(1)).padStart(5)}%  ${'█'.repeat(
      Math.max(1, Math.round((n / GAMES) * 60))
    )}`
  )
}

const sorted = [...scores].sort((a, b) => a - b)
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
console.log(
  `  评分分位    p10=${pct(0.1)} p50=${pct(0.5)} p75=${pct(0.75)} p90=${pct(0.9)} p99=${pct(0.99)} p999=${pct(0.999)} max=${sorted[sorted.length - 1]}`
)

for (const r of results) {
  if (r.releasePercent < 0 || r.releasePercent > 100) problems.push('释放度越界')
  if (r.score < 0) problems.push('评分为负')
  if (!r.levelTitle) problems.push('等级称号为空')
  if (!Number.isFinite(r.todayReleased)) problems.push('今日情绪值非数字')
  if (r.hitCount + r.missCount < 1) problems.push('一局里一次判定都没有')
}

console.log('')
if (problems.length) {
  const uniq = [...new Set(problems)]
  console.log(`✗ 发现 ${problems.length} 处问题（去重后 ${uniq.length} 类）：`)
  uniq.slice(0, 20).forEach((p) => console.log('  - ' + p))
} else {
  console.log('✓ 所有断言通过')
}

await server.close()
process.exit(problems.length ? 1 : 0)
