import type { EmotionMeta, EmotionType } from '@/types'

/**
 * 五种情绪模式（方案 §六）。
 * 每种情绪改变：主色、粒子形态、以及命中时飘出的文案语气。
 * 颜色刻意避开纯黑底上的低对比色，保证血条与飘字在暗色背景下都够亮。
 */
export const EMOTIONS: Record<EmotionType, EmotionMeta> = {
  angry: {
    type: 'angry',
    label: '愤怒',
    emoji: '😡',
    color: '#ff4b2b',
    glow: '#ff9a3c',
    deep: '#2a0d08',
    particle: 'ember',
    slogan: '烧掉它',
    hitLines: ['怒气释放！', '再来！', '正中靶心', '火气出去了一点'],
    critLines: ['致命一击！', '怒火爆发！', '这一下够狠'],
    missLines: ['飞镖偏了', '看来你已经没那么生气了'],
    finishLines: ['怒气已清空', '火灭了，人还在', '舒服了吗？']
  },

  wronged: {
    type: 'wronged',
    label: '委屈',
    emoji: '😤',
    color: '#3d9bff',
    glow: '#7fd4ff',
    deep: '#08182e',
    particle: 'drop',
    slogan: '把委屈放下',
    hitLines: ['把委屈放下', '这不是你的错', '说出来了', '轻了一点点'],
    critLines: ['全都倒出来！', '憋太久了', '这次不咽下去了'],
    missLines: ['飞镖偏了', '也许你已经不想再解释了'],
    finishLines: ['委屈落地了', '你可以不用那么懂事', '眼泪也是有重量的']
  },

  sad: {
    type: 'sad',
    label: '难过',
    emoji: '😞',
    color: '#7b7fe0',
    glow: '#b3b6ff',
    deep: '#101026',
    particle: 'rain',
    slogan: '让它过去',
    hitLines: ['让它过去', '慢慢来', '难过也是真的', '松了一点'],
    critLines: ['哭出来也没关系', '全都砸碎', '这一刻只属于你'],
    missLines: ['飞镖偏了', '好像没那么沉了'],
    finishLines: ['雨停了', '今天先到这里', '会好起来的']
  },

  stress: {
    type: 'stress',
    label: '压力',
    emoji: '😰',
    color: '#12cfc0',
    glow: '#7bfff1',
    deep: '#04211f',
    particle: 'bubble',
    slogan: '一个个戳破',
    hitLines: ['戳破一个', '卸掉一点', '呼——', '没那么紧了'],
    critLines: ['压力爆了！', '整块掀翻', '这一下值一个周末'],
    missLines: ['飞镖偏了', '手上好像松了些'],
    finishLines: ['今天的份，清完了', '先喘口气', '你扛得够久了']
  },

  breakdown: {
    type: 'breakdown',
    label: '崩溃',
    emoji: '🤯',
    color: '#b44cff',
    glow: '#ff6fe0',
    deep: '#1b0630',
    particle: 'shard',
    slogan: '炸开算了',
    hitLines: ['裂了', '炸开一点', '碎就碎吧', '砰！'],
    critLines: ['彻底炸裂！', '全碎了', '这一下最爽'],
    missLines: ['飞镖偏了', '咦，好像还能撑住'],
    finishLines: ['碎完了，重新拼', '允许自己崩一次', '明天再说']
  }
}

/** 首页情绪选择器的展示顺序 */
export const EMOTION_ORDER: EmotionType[] = ['angry', 'wronged', 'sad', 'stress', 'breakdown']

export const emotionOf = (type: EmotionType): EmotionMeta => EMOTIONS[type]

/** 首页示例词（方案 §二） */
export const EXAMPLE_TARGETS = ['张三', '老板', '加班', '堵车', '周一', '甲方'] as const
