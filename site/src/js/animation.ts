import { sleep } from './utils'

const FPS = 30

/* Easing algorithms for animations. */
export const Easing: Record<string, (t: number) => number> = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => t * (2 - t),
  easeInHard: t => t * t * t,
  easeOutHard: t => (--t) * t * t + 1,
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export class Animation {
  done?: () => void
  thread: Promise<void>
  endAnimation: boolean
  static Forever: -1

  constructor (duration: number, f: (prog: number) => void, easingAlgo?: string, done?: () => void) {
    this.done = done
    this.thread = this.run(duration, f, easingAlgo)
  }

  async run (duration: number, f: (prog: number) => void, easingAlgo?: string) {
    duration = duration >= 0 ? duration : 1000 * 86400 * 365 * 10 // 10 years, in ms
    const easer = easingAlgo ? Easing[easingAlgo] : Easing.linear
    const start = new Date().getTime()
    const end = start + duration
    const range = end - start
    const frameDuration = 1000 / FPS
    let now = start
    this.endAnimation = false
    while (now < end) {
      if (this.endAnimation) return this.runCompletionFunction()
      f(easer((now - start) / range))
      await sleep(frameDuration)
      now = new Date().getTime()
    }
    f(1)
    this.runCompletionFunction()
  }

  async wait () {
    await this.thread
  }

  stop () {
    this.endAnimation = true
  }

  async stopAndWait () {
    this.stop()
    await this.wait()
  }

  runCompletionFunction () {
    if (this.done) this.done()
  }
}
Animation.Forever = -1

interface TrackedAnimation {
  start: number
  end: number
  run: (ctx: CanvasRenderingContext2D, subProg: number) => void
}

export class SubAnimator {
  anis: TrackedAnimation[]
  prepFunc: (ctx: CanvasRenderingContext2D) => void

  constructor () {
    this.anis = []
  }

  prep (prepFunc: (ctx: CanvasRenderingContext2D) => void) {
    this.prepFunc = prepFunc
  }

  addFrame (start: number, end: number, run: (ctx: CanvasRenderingContext2D, subProg: number) => void) {
    this.anis.push({ start, end, run })
    // Sort them by end so that during iteration later we can break once we
    // encounter subProg === 0.
    this.anis.sort((a1, a2) => a1.end - a2.end)
  }

  draw (ctx: CanvasRenderingContext2D, prog: number) {
    if (this.prepFunc) this.prepFunc(ctx)
    for (const ani of this.anis) {
      const subProg = subProgress(ani.start, ani.end, prog)
      if (subProg === 0) break
      ani.run(ctx, subProg)
    }
  }
}

function subProgress (start: number, end: number, prog: number): number {
  if (prog <= start) return 0
  if (prog >= end) return 1
  return (prog - start) / (end - start)
}
