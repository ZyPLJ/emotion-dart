<script setup lang="ts">
/**
 * 一支飞镖（方案 §四 玩法1 / §十二 动画实现）。
 *
 * 方案里用的是 🏹 emoji，这里换成 SVG 镖形：emoji 在不同系统上字形差异大，
 * 而且没法让「镖尖朝前」跟着飞行方向转 —— 那正是投掷手感的关键。
 *
 * 位置用 CSS 变量 --dx / --dy 从投掷原点算偏移，--spin 是镖尖指向的角度，
 * 这样整段飞行是一串纯 CSS keyframes，不占主线程。
 */
import { computed, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 相对投掷原点的水平位移（px） */
    dx: number
    /** 相对投掷原点的垂直位移（px，向上为负） */
    dy: number
    /** 镖尖朝向的角度（deg） */
    spin: number
    mode?: 'hit' | 'miss'
    /** 飞行时长（ms） */
    duration?: number
  }>(),
  { mode: 'hit', duration: 340 }
)

const emit = defineEmits<{ done: [] }>()

/** 命中后钉在靶上抖一下，再淡出 */
const stuck = ref(false)
const fading = ref(false)
const timers: number[] = []

const later = (fn: () => void, ms: number): void => {
  timers.push(window.setTimeout(fn, ms))
}

const vars = computed(() => ({
  '--dx': `${props.dx}px`,
  '--dy': `${props.dy}px`,
  '--spin': `${props.spin}deg`,
  '--fly': `${props.duration}ms`
}))

function onEnd(): void {
  if (props.mode === 'miss') {
    later(() => emit('done'), 60)
    return
  }
  stuck.value = true
  later(() => (fading.value = true), 620)
  later(() => emit('done'), 980)
}

onBeforeUnmount(() => timers.forEach((t) => window.clearTimeout(t)))
</script>

<template>
  <div
    class="dart"
    :class="[mode, { stuck, fading }]"
    :style="vars"
    @animationend="onEnd"
  >
    <span class="trail" />
    <svg class="glyph" viewBox="0 0 24 64" aria-hidden="true">
      <defs>
        <linearGradient id="dartTip" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#8e9ab3" />
          <stop offset="0.45" stop-color="#f4f8ff" />
          <stop offset="1" stop-color="#7c879f" />
        </linearGradient>
      </defs>
      <!-- 镖尖 -->
      <path d="M12 0 L16.5 15 L7.5 15 Z" fill="url(#dartTip)" />
      <!-- 镖身 -->
      <rect x="10" y="14" width="4" height="27" rx="1.6" fill="#c8d0e2" />
      <rect x="10.9" y="14" width="1.4" height="27" fill="#ffffff" opacity=".55" />
      <!-- 尾翼 -->
      <path d="M12 40 L21.5 47 L21.5 60 L12 54 Z" fill="var(--accent)" />
      <path d="M12 40 L2.5 47 L2.5 60 L12 54 Z" fill="var(--glow)" />
      <path d="M12 40 L12 54.5" stroke="rgba(0,0,0,.35)" stroke-width="0.9" />
    </svg>
  </div>
</template>

<style scoped>
.dart {
  position: absolute;
  left: 50%;
  top: 100%;
  width: 24px;
  height: 64px;
  margin: -32px 0 0 -12px;
  pointer-events: none;
  z-index: 8;
  will-change: transform, opacity;
  animation: throwFly var(--fly) cubic-bezier(0.36, 0.02, 0.24, 1) forwards;
}

.glyph {
  display: block;
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--glow) 70%, transparent));
}

/* 拖影：跟在镖尾的一条渐隐光带 */
.trail {
  position: absolute;
  left: 50%;
  top: 100%;
  width: 3px;
  height: 92px;
  transform: translateX(-50%);
  border-radius: 3px;
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--glow) 75%, transparent));
  opacity: 0;
  animation: trailFade var(--fly) ease-out forwards;
}

@keyframes throwFly {
  0% {
    opacity: 0;
    transform: translate(-50%, 40px) scale(1.1) rotate(calc(var(--spin) * 0.2));
  }
  10% {
    opacity: 1;
  }
  55% {
    transform: translate(calc(-50% + var(--dx) * 0.52), calc(var(--dy) * 0.44))
      scale(0.84) rotate(calc(var(--spin) * 0.72));
  }
  100% {
    opacity: 1;
    transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(0.62) rotate(var(--spin));
  }
}

@keyframes trailFade {
  0%,
  20% {
    opacity: 0;
  }
  60% {
    opacity: 0.85;
  }
  100% {
    opacity: 0;
  }
}

/* 偏转：掠过靶子之后坠落出画面 */
.dart.miss {
  animation-name: throwMiss;
}

@keyframes throwMiss {
  0% {
    opacity: 0;
    transform: translate(-50%, 40px) scale(1.1) rotate(calc(var(--spin) * 0.2));
  }
  10% {
    opacity: 1;
  }
  68% {
    opacity: 1;
    transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(0.72) rotate(var(--spin));
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--dx) * 1.22), calc(var(--dy) + 300px))
      scale(0.6) rotate(calc(var(--spin) + 110deg));
  }
}

/* 钉在靶上：小幅回弹抖动 */
.dart.stuck {
  animation: dartWobble 0.42s cubic-bezier(0.36, 1.4, 0.5, 1) both;
  transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(0.62) rotate(var(--spin));
  opacity: 1;
  transition: opacity 0.3s ease;
}

@keyframes dartWobble {
  0% {
    transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(0.7) rotate(var(--spin));
  }
  22% {
    transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(0.62)
      rotate(calc(var(--spin) - 8deg));
  }
  55% {
    transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(0.62)
      rotate(calc(var(--spin) + 4.5deg));
  }
  80% {
    transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(0.62)
      rotate(calc(var(--spin) - 1.5deg));
  }
  100% {
    transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(0.62) rotate(var(--spin));
  }
}

.dart.fading {
  opacity: 0;
}
</style>
