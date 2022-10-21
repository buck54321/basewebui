import { Doc } from './doc'
import { Animation } from './animation'

interface Point {
  x: number
  y: number
}

function makePt (x: number, y: number) {
  return { x, y }
}

interface MinMax {
  min: number
  max: number
}

interface Label {
  val: number
  txt: string
}

interface LabelSet {
  widest?: number
  lbls: Label[]
}

interface Translator {
    x: (x: number) => number
    y: (y: number) => number
    unx: (x: number) => number
    uny: (y: number) => number
    w: (w: number) => number
    h: (h: number) => number
    dataCoords: (f: () => void) => void
}

export interface MouseReport {
  rate: number
  depth: number
  dotColor: string
  hoverMarkers: number[]
}

export interface VolumeReport {
  buyBase: number
  buyQuote: number
  sellBase: number
  sellQuote: number
}

export interface DepthReporters {
  mouse: (r: MouseReport | null) => void
  click: (x: number) => void
  volume: (r: VolumeReport) => void
  zoom: (z: number) => void
}

export interface ChartReporters {
  resize: () => void,
  click: (e: MouseEvent) => void,
  zoom: (bigger: boolean) => void
}

interface Theme {
  axisLabel: string
  gridBorder: string
  gridLines: string
  gapLine: string
  value: string
  zoom: string
  zoomHover: string
  sellLine: string
  buyLine: string
  sellFill: string
  buyFill: string
  crosshairs: string
  legendFill: string
  legendText: string
}

const darkTheme: Theme = {
  axisLabel: '#b1b1b1',
  gridBorder: '#3a3a3a',
  gridLines: '#2a2a2a',
  gapLine: '#6b6b6b',
  value: '#9a9a9a',
  zoom: '#5b5b5b',
  zoomHover: '#aaa',
  sellLine: '#ae3333',
  buyLine: '#05a35a',
  sellFill: '#591a1a',
  buyFill: '#02572f',
  crosshairs: '#888',
  legendFill: 'black',
  legendText: '#d5d5d5'
}

// const lightTheme: Theme = {
//   axisLabel: '#1b1b1b',
//   gridBorder: '#3a3a3a',
//   gridLines: '#dadada',
//   gapLine: '#595959',
//   value: '#4d4d4d',
//   zoom: '#777',
//   zoomHover: '#333',
//   sellLine: '#99302b',
//   buyLine: '#207a46',
//   sellFill: '#bd5959',
//   buyFill: '#4cad75',
//   crosshairs: '#595959',
//   legendFill: '#e6e6e6',
//   legendText: '#1b1b1b'
// }

const Purple = '#e432e4'
const Blue = '#4b4bde'

// Chart is the base class for charts.
class Chart {
  parent: HTMLElement
  report: ChartReporters
  theme: Theme
  canvas: HTMLCanvasElement
  visible: boolean
  ctx: CanvasRenderingContext2D
  mousePos: Point | null
  rect: DOMRect
  wheelLimiter: number | null
  boundResizer: () => void
  plotRegion: Region
  xRegion: Region
  yRegion: Region
  dataExtents: Extents
  renderScheduled: boolean
  unattachers: (() => void)[]

  constructor (parent: HTMLElement, reporters: ChartReporters) {
    this.parent = parent
    this.report = reporters
    this.theme = darkTheme
    this.canvas = document.createElement('canvas')
    this.visible = true
    parent.appendChild(this.canvas)
    const ctx = this.canvas.getContext('2d')
    if (!ctx) {
      console.error('error getting canvas context')
      return
    }
    this.ctx = ctx
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    // Mouse handling
    this.mousePos = null
    Doc.bind(this.canvas, 'mousemove', (e: MouseEvent) => {
      // this.rect will be set in resize().
      this.mousePos = {
        x: e.clientX - this.rect.left,
        y: e.clientY - this.rect.y
      }
      this.draw()
    })
    Doc.bind(this.canvas, 'mouseleave', () => {
      this.mousePos = null
      this.draw()
    })

    const resizeObserver = new ResizeObserver(() => this.resize())
    resizeObserver.observe(this.parent)

    // Scrolling by wheel is smoother when the rate is slightly limited.
    this.wheelLimiter = null
    Doc.bind(this.canvas, 'wheel', (e: WheelEvent) => { this.wheel(e) })
    Doc.bind(this.canvas, 'click', (e: MouseEvent) => { this.click(e) })
    const setVis = () => {
      this.visible = document.visibilityState !== 'hidden'
      if (this.visible && this.renderScheduled) {
        this.renderScheduled = false
        this.draw()
      }
    }
    Doc.bind(document, 'visibilitychange', setVis)
    this.unattachers = [() => { Doc.unbind(document, 'visibilitychange', setVis) }]
  }

  unattach () {
    for (const u of this.unattachers) u()
    this.unattachers = []
  }

  wheeled () {
    this.wheelLimiter = window.setTimeout(() => { this.wheelLimiter = null }, 100)
  }

  /* clear the canvas. */
  clear () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /* draw calls the child class's render method. */
  draw () {
    this.render()
  }

  /* click is the handler for a click event on the canvas. */
  click (e: MouseEvent) {
    this.report.click(e)
  }

  /* wheel is a mousewheel event handler. */
  wheel (e: WheelEvent) {
    this.zoom(e.deltaY < 0)
    e.preventDefault()
  }

  /*
   * resize updates the chart size. The parentHeight is an argument to support
   * updating the height programatically after the caller sets a style.height
   * but before the clientHeight has been updated.
   */
  resize () {
    this.canvas.width = this.parent.clientWidth
    this.canvas.height = this.parent.clientHeight
    const xLblHeight = 30
    const yGuess = 40 // y label width guess. Will be adjusted when drawn.
    const plotExtents = new Extents(yGuess, this.canvas.width, 10, this.canvas.height - xLblHeight)
    const xLblExtents = new Extents(yGuess, this.canvas.width, this.canvas.height - xLblHeight, this.canvas.height)
    const yLblExtents = new Extents(0, yGuess, 10, this.canvas.height - xLblHeight)
    this.plotRegion = new Region(this.ctx, plotExtents)
    this.xRegion = new Region(this.ctx, xLblExtents)
    this.yRegion = new Region(this.ctx, yLblExtents)
    // After changing the visibility, this.canvas.getBoundingClientRect will
    // return nonsense until a render.
    window.requestAnimationFrame(() => {
      this.rect = this.canvas.getBoundingClientRect()
      this.report.resize()
    })
  }

  /* zoom is called when the user scrolls the mouse wheel on the canvas. */
  zoom (bigger: boolean) {
    if (this.wheelLimiter) return
    this.report.zoom(bigger)
  }

  /* hide hides the canvas */
  hide () {
    this.visible = false
    Doc.hide(this.canvas)
  }

  /* show shows the canvas */
  show () {
    this.visible = true
    Doc.show(this.canvas)
    this.resize()
  }

  /* render must be implemented by the child class. */
  render () {
    console.error('child class must override render method')
  }

  /* applyLabelStyle applies the style used for axis tick labels. */
  applyLabelStyle (fontSize?: number) {
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.font = `${fontSize ?? 12}px 'sans', sans-serif`
    this.ctx.fillStyle = this.theme.axisLabel
  }

  /* plotXLabels applies the provided labels to the x axis and draws the grid. */
  plotXLabels (labels: Label[], minX: number, maxX: number, unitLines: string[]) {
    const extents = new Extents(minX, maxX, 0, 1)
    this.xRegion.plot(extents, (ctx: CanvasRenderingContext2D, tools: Translator) => {
      this.applyLabelStyle()
      const centerX = (maxX + minX) / 2
      let lastX = minX
      let unitCenter = centerX
      labels.forEach(lbl => {
        ctx.fillText(lbl.txt, tools.x(lbl.val), tools.y(0.5))
        if (centerX >= lastX && centerX < lbl.val) {
          unitCenter = (lastX + lbl.val) / 2
        }
        lastX = lbl.val
      })
      ctx.font = '11px \'sans\', sans-serif'
      if (unitLines.length === 2) {
        ctx.fillText(unitLines[0], tools.x(unitCenter), tools.y(0.63))
        ctx.fillText(unitLines[1], tools.x(unitCenter), tools.y(0.23))
      } else if (unitLines.length === 1) {
        ctx.fillText(unitLines[0], tools.x(unitCenter), tools.y(0.5))
      }
    }, true)
    this.plotRegion.plot(extents, (ctx: CanvasRenderingContext2D, tools: Translator) => {
      ctx.lineWidth = 1
      ctx.strokeStyle = this.theme.gridLines
      labels.forEach(lbl => {
        line(ctx, tools.x(lbl.val), tools.y(0), tools.x(lbl.val), tools.y(1))
      })
    }, true)
  }

  /*
   * plotYLabels applies the y labels based on the provided plot region, and
   * draws the grid.
   */
  plotYLabels (plotRegion: Region, labels: LabelSet, minY: number, maxY: number, unit: string, yRegion?: Region, skipLines?: boolean) {
    yRegion = yRegion ?? this.yRegion
    const extents = new Extents(0, 1, minY, maxY)
    yRegion.plot(extents, (ctx: CanvasRenderingContext2D, tools: Translator) => {
      this.applyLabelStyle()
      const centerY = maxY / 2
      let lastY = 0
      let unitCenter = centerY
      labels.lbls.forEach(lbl => {
        ctx.fillText(lbl.txt, tools.x(0.5), tools.y(lbl.val))
        if (centerY >= lastY && centerY < lbl.val) {
          unitCenter = (lastY + lbl.val) / 2
        }
        lastY = lbl.val
      })
      ctx.fillText(unit, tools.x(0.5), tools.y(unitCenter))
    }, true)
    if (!skipLines) {
      plotRegion.plot(extents, (ctx: CanvasRenderingContext2D, tools: Translator) => {
        ctx.lineWidth = 1
        ctx.strokeStyle = this.theme.gridLines
        labels.lbls.forEach(lbl => {
          line(ctx, tools.x(0), tools.y(lbl.val), tools.x(1), tools.y(lbl.val))
        })
      }, true)
    }
  }

  /*
   * doYLabels generates and applies the y-axis labels, based upon the
   * provided plot region.
   */
  doYLabels (region: Region, step: number, unit: string, valFmt?: (v: number) => string) {
    const yLabels = makeLabels(this.ctx, region.height(), this.dataExtents.y.min,
      this.dataExtents.y.max, 50, step, unit, valFmt)

    // Reassign the width of the y-label column to accommodate the widest text.
    const yAxisWidth = (yLabels.widest || 0) * 1.5
    this.yRegion.extents.x.max = yAxisWidth
    this.yRegion.extents.y.max = region.extents.y.max

    this.plotRegion.extents.x.min = yAxisWidth
    this.xRegion.extents.x.min = yAxisWidth
    // Print the y labels.
    this.plotYLabels(region, yLabels, this.dataExtents.y.min, this.dataExtents.y.max, unit)
    return yLabels
  }

  // drawFrame draws an outline around the plotRegion.
  drawFrame () {
    this.plotRegion.plot(new Extents(0, 1, 0, 1), (ctx: CanvasRenderingContext2D, tools: Translator) => {
      ctx.lineWidth = 1
      ctx.strokeStyle = this.theme.gridBorder
      ctx.beginPath()
      tools.dataCoords(() => {
        ctx.moveTo(0, 0)
        ctx.lineTo(0, 1)
        ctx.lineTo(1, 1)
        ctx.lineTo(1, 0)
        ctx.lineTo(0, 0)
      })
      ctx.stroke()
    })
  }
}

/*
 * Extents holds a min and max in both the x and y directions, and provides
 * getters for related data.
 */
class Extents {
  x: MinMax
  y: MinMax

  constructor (xMin: number, xMax: number, yMin: number, yMax: number) {
    this.setExtents(xMin, xMax, yMin, yMax)
  }

  setExtents (xMin: number, xMax: number, yMin: number, yMax: number) {
    this.x = {
      min: xMin,
      max: xMax
    }
    this.y = {
      min: yMin,
      max: yMax
    }
  }

  get xRange (): number {
    return this.x.max - this.x.min
  }

  get midX (): number {
    return (this.x.max + this.x.min) / 2
  }

  get yRange (): number {
    return this.y.max - this.y.min
  }

  get midY (): number {
    return (this.y.max + this.y.min) / 2
  }
}

/*
 * Region applies an Extents to the canvas, providing utilities for coordinate
 * transformations and restricting drawing to a specified region of the canvas.
 */
class Region {
  context: CanvasRenderingContext2D
  extents: Extents

  constructor (context: CanvasRenderingContext2D, extents: Extents) {
    this.context = context
    this.extents = extents
  }

  setExtents (xMin: number, xMax: number, yMin: number, yMax: number) {
    this.extents.setExtents(xMin, xMax, yMin, yMax)
  }

  width (): number {
    return this.extents.xRange
  }

  height (): number {
    return this.extents.yRange
  }

  contains (x: number, y: number): boolean {
    const ext = this.extents
    return (x < ext.x.max && x > ext.x.min &&
      y < ext.y.max && y > ext.y.min)
  }

  /*
   * A translator provides 4 function for coordinate transformations. x and y
   * translate data coordinates to canvas coordinates for the specified data
   * Extents. unx and uny translate canvas coordinates to data coordinates.
   */
  translator (dataExtents: Extents): Translator {
    const region = this.extents
    const xMin = dataExtents.x.min
    // const xMax = dataExtents.x.max
    const yMin = dataExtents.y.min
    // const yMax = dataExtents.y.max
    const yRange = dataExtents.yRange
    const xRange = dataExtents.xRange
    const screenMinX = region.x.min
    const screenW = region.x.max - screenMinX
    const screenMaxY = region.y.max
    const screenH = screenMaxY - region.y.min
    const xFactor = screenW / xRange
    const yFactor = screenH / yRange
    return {
      x: (x: number) => (x - xMin) * xFactor + screenMinX,
      y: (y: number) => screenMaxY - (y - yMin) * yFactor,
      unx: (x: number) => (x - screenMinX) / xFactor + xMin,
      uny: (y: number) => yMin - (y - screenMaxY) / yFactor,
      w: (w: number) => w / xRange * screenW,
      h: (h: number) => -h / yRange * screenH,
      dataCoords: () => { /* Added when using plot() */ }
    }
  }

  /* clear clears the region. */
  clear () {
    const ext = this.extents
    this.context.clearRect(ext.x.min, ext.y.min, ext.xRange, ext.yRange)
  }

  /* plot prepares tools for drawing using data coordinates. */
  plot (dataExtents: Extents, drawFunc: (ctx: CanvasRenderingContext2D, tools: Translator) => void, skipMask?: boolean) {
    const ctx = this.context
    const region = this.extents
    ctx.save() // Save the original state
    if (!skipMask) {
      ctx.beginPath()
      ctx.rect(region.x.min, region.y.min, region.xRange, region.yRange)
      ctx.clip()
    }

    // The drawFunc will be passed a set of tool that can be used to assist
    // drawing. The tools start with the transformation functions.
    const tools = this.translator(dataExtents)

    // Create a transformation that allows drawing in data coordinates. It's
    // not advisable to stroke or add text with this transform in place, as the
    // result will be distorted. You can however use ctx.moveTo and ctx.lineTo
    // with this transform in place using data coordinates, and remove the
    // transform before stroking. The dataCoords method of the supplied tool
    // provides this functionality.
    const yRange = dataExtents.yRange
    const xFactor = region.xRange / dataExtents.xRange
    const yFactor = region.yRange / yRange
    const xMin = dataExtents.x.min
    const yMin = dataExtents.y.min
    // These translation factors are complicated because the (0, 0) of the
    // region is not necessarily the (0, 0) of the canvas.
    const tx = (region.x.min + xMin) - xMin * xFactor
    const ty = -region.y.min - (yRange - yMin) * yFactor
    const setTransform = () => {
      // Data coordinates are flipped about y. Flip the coordinates and
      // translate top left corner to canvas (0, 0).
      ctx.transform(1, 0, 0, -1, -xMin, yMin)
      // Scale to data coordinates and shift into place for the region's offset
      // on the canvas.
      ctx.transform(xFactor, 0, 0, yFactor, tx, ty)
    }
    // dataCoords allows some drawing to be performed directly in data
    // coordinates. Most actual drawing functions like ctx.stroke and
    // ctx.fillRect should not be called from inside dataCoords, but
    // ctx.moveTo and ctx.LineTo are fine.
    tools.dataCoords = f => {
      ctx.save()
      setTransform()
      f()
      ctx.restore()
    }

    drawFunc(this.context, tools)
    ctx.restore()
  }
}

interface WaveOpts {
  message?: string
  backgroundColor?: string | boolean // true for <body> background color
}

/* Wave is a loading animation that displays a colorful line that oscillates */
export class Wave extends Chart {
  ani: Animation
  size: [number, number]
  region: Region
  colorShift: number
  opts: WaveOpts
  msgRegion: Region
  fontSize: number

  constructor (parent: HTMLElement, opts?: WaveOpts) {
    super(parent, {
      resize: () => this.resized(),
      click: (/* e: MouseEvent */) => { /* pass */ },
      zoom: (/* bigger: boolean */) => { /* pass */ }
    })
    this.canvas.classList.add('fill-abs')
    this.canvas.style.zIndex = '5'

    this.opts = opts ?? {}

    const period = 1500 // ms
    const start = Math.random() * period
    this.colorShift = Math.random() * 360

    // y = A*cos(k*x + theta*t + c)
    // combine three waves with different periods and speeds and phases.
    const amplitudes = [1, 0.65, 0.75]
    const ks = [3, 3, 2]
    const speeds = [Math.PI, Math.PI * 10 / 9, Math.PI / 2.5]
    const phases = [0, 0, Math.PI * 1.5]
    const n = 75
    const single = (n: number, angularX: number, angularTime: number): number => {
      return amplitudes[n] * Math.cos(ks[n] * angularX + speeds[n] * angularTime + phases[n])
    }
    const value = (x: number, angularTime: number): number => {
      const angularX = x * Math.PI * 2
      return (single(0, angularX, angularTime) + single(1, angularX, angularTime) + single(2, angularX, angularTime)) / 3
    }
    this.resize()
    this.ani = new Animation(Animation.Forever, () => {
      const angularTime = (new Date().getTime() - start) / period * Math.PI * 2
      const values = []
      for (let i = 0; i < n; i++) {
        values.push(value(i / (n - 1), angularTime))
      }
      this.drawValues(values)
    })
  }

  resized () {
    const opts = this.opts
    const [maxW, maxH] = [150, 100]
    const [cw, ch] = [this.canvas.width, this.canvas.height]
    let [w, h] = [cw * 0.8, ch * 0.8]
    if (w > maxW) w = maxW
    if (h > maxH) h = maxH
    let [l, t] = [(cw - w) / 2, (ch - h) / 2]
    if (opts.message) {
      this.fontSize = clamp(h * 0.15, 10, 14)
      this.applyLabelStyle(this.fontSize)
      const ypad = this.fontSize * 0.5
      const halfH = (this.fontSize / 2) + ypad
      t -= halfH
      this.msgRegion = new Region(this.ctx, new Extents(0, cw, t + h, t + h + 2 * halfH))
    }
    this.region = new Region(this.ctx, new Extents(l, l + w, t, t + h))
  }

  drawValues (values: number[]) {
    if (!this.region) return
    this.clear()
    const hsl = (h: number) => `hsl(${h}, 35%, 50%)`

    const { region, msgRegion, canvas: { width: w, height: h }, opts: { backgroundColor: bg, message: msg }, colorShift, ctx } = this

    if (bg) {
      if (bg === true) ctx.fillStyle = window.getComputedStyle(document.body, null).getPropertyValue('background-color')
      else ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
    }

    region.plot(new Extents(0, 1, -1, 1), (ctx: CanvasRenderingContext2D, t: Translator) => {
      ctx.lineWidth = 4
      ctx.lineCap = 'round'

      const shift = colorShift + (new Date().getTime() % 2000) / 2000 * 360 // colors move with frequency 1 / 2s
      const grad = ctx.createLinearGradient(t.x(0), 0, t.x(1), 0)
      grad.addColorStop(0, hsl(shift))
      ctx.strokeStyle = grad

      ctx.beginPath()
      ctx.moveTo(t.x(0), t.y(values[0]))
      for (let i = 1; i < values.length; i++) {
        const prog = i / (values.length - 1)
        grad.addColorStop(prog, hsl(prog * 300 + shift))
        ctx.lineTo(t.x(prog), t.y(values[i]))
      }
      ctx.stroke()
    })
    if (!msg) return
    msgRegion.plot(new Extents(0, 1, 0, 1), (ctx: CanvasRenderingContext2D, t: Translator) => {
      ctx.fillText(msg, t.x(0.5), t.y(0.5), this.msgRegion.width())
    })
  }

  render () { /* pass */ }

  stop () {
    this.ani.stop()
    this.canvas.remove()
  }
}

/*
 * makeLabels attempts to create the appropriate labels for the specified
 * screen size, context, and label spacing.
 */
function makeLabels (
  ctx: CanvasRenderingContext2D,
  screenW: number,
  min: number,
  max: number,
  spacingGuess: number,
  step: number,
  unit: string,
  valFmt?: (v: number) => string
): LabelSet {
  valFmt = valFmt || formatLabelValue
  const n = screenW / spacingGuess
  const diff = max - min
  if (n < 1 || diff <= 0) return { lbls: [] }
  const tickGuess = diff / n
  // make the tick spacing a multiple of the step
  const tick = tickGuess + step - (tickGuess % step)
  let x = min + tick - (min % tick)
  const absMax = Math.max(Math.abs(max), Math.abs(min))
  // The Math.round part is the minimum precision required to see the change in the numbers.
  // The 2 accounts for the precision of the tick.
  const sigFigs = Math.round(Math.log10(absMax / tick)) + 2
  const pts: Label[] = []
  let widest = 0
  while (x < max) {
    x = Number(x.toPrecision(sigFigs))
    const lbl = valFmt(x)
    widest = Math.max(widest, ctx.measureText(lbl).width)
    pts.push({
      val: x,
      txt: lbl
    })
    x += tick
  }
  const unitW = ctx.measureText(unit).width
  if (unitW > widest) widest = unitW
  return {
    widest: widest,
    lbls: pts
  }
}

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/* makeDateLabels prepares labels for date data. */
function makeDateLabels (start: number, end: number, minTick: number, screenW: number, spacingGuess: number): Label[] {
  const diff = end - start
  const n = Math.max(2, screenW / spacingGuess)
  const tick = stepRound(diff / n, minTick)
  if (tick === 0) {
    console.error('zero tick', minTick, diff, n) // probably won't happen, but it'd suck if it did
    return []
  }
  let x = start
  const zoneOffset = new Date().getTimezoneOffset()
  const dayStamp = (x: number) => {
    x = x - zoneOffset * 60000
    return x - (x % 86400000)
  }
  let lastDay = dayStamp(start)
  let lastYear = 0 // new Date(start).getFullYear()
  if (dayStamp(start) === dayStamp(end)) lastDay = 0 // Force at least one day stamp.
  const pts = []
  let label
  if (minTick < 86400000) {
    label = (d: Date, x: number) => {
      const day = dayStamp(x)
      if (day !== lastDay) return `${months[d.getMonth()]}${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
      else return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    }
  } else {
    label = (d: Date) => {
      const year = d.getFullYear()
      if (year !== lastYear) return `${months[d.getMonth()]}${d.getDate()} '${String(year).slice(2, 4)}`
      else return `${months[d.getMonth()]}${d.getDate()}`
    }
  }
  while (x <= end) {
    const d = new Date(x)
    pts.push({
      val: x,
      txt: label(d, x)
    })
    lastDay = dayStamp(x)
    lastYear = d.getFullYear()
    x += tick
  }
  return pts
}

// function truncate (v: number, w: number): number {
//   return v - (v % w)
// }

function stepRound (v: number, w: number): number {
  return Math.round(v / w) * w
}

/* labelSpecs is specifications for axis tick labels. */
const labelSpecs = {
  minimumSignificantDigits: 4,
  maximumSignificantDigits: 5
}

/* formatLabelValue formats the provided value using the labelSpecs format. */
function formatLabelValue (x: number) {
  return x.toLocaleString('en-us', labelSpecs)
}

/* line draws a line with the provided context. */
function line (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, skipStroke?: boolean) {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  if (!skipStroke) ctx.stroke()
}

// /* dot draws a circle with the provided context. */
// function dot (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, radius: number) {
//   ctx.fillStyle = color
//   ctx.beginPath()
//   ctx.arc(x, y, radius, 0, 2 * Math.PI)
//   ctx.fill()
// }

/* clamp returns v if min <= v <= max, else min or max. */
function clamp (v: number, min: number, max: number): number {
  if (v < min) return min
  if (v > max) return max
  return v
}

interface DoubleAxisOpts {
  xDate?: boolean
}

export class DoubleAxisChart extends Chart {
  opts: DoubleAxisOpts
  x: number[]
  y1: number[]
  y2: number[]
  yRegion2: Region

  constructor (parent: HTMLElement, opts: DoubleAxisOpts) {
    super(parent, {
      resize: () => this.resized(),
      click: (/* e: MouseEvent */) => { /* pass */ },
      zoom: (/* bigger: boolean */) => { /* pass */ }
    })
    this.opts = opts
  }

  resized () {
    /* do stuff */
    this.render()
  }

  setSecondYRegion () {
    const r = this.plotRegion.extents
    this.yRegion2 = new Region(this.ctx, new Extents(r.x.max /* set before rendering */, this.canvas.width, r.y.min, r.y.max))
  }

  update (x: number[], y1: number[], y2: number[]) {
    this.x = x
    this.y1 = y1
    this.y2 = y2
    this.render()
  }

  render () {
    if (!this.x || !this.visible || this.canvas.width === 0) {
      this.renderScheduled = true
      return
    }
    this.clear()
    this.setSecondYRegion()

    const { x, y1, y2 } = this

    const [startX, endX] = [x[0], x[x.length - 1]]

    // Prepare left axis, but don't draw until we readjust the plot region
    const yMax1 = Math.max(...y1)
    const yMin1 = Math.min(...y1)
    const extents1 = this.dataExtents = new Extents(startX, endX, yMin1, yMax1)
    this.applyLabelStyle()

    // The right axis
    const yMax2 = Math.max(...y2)
    const yMin2 = Math.min(...y2)
    const ethLabels = makeLabels(this.ctx, this.yRegion2.height(), yMin2, yMax2, 50, 10, 'ETH')
    // Reassign the width of the y-label column to accommodate the widest text.
    const yAxisWidth = (ethLabels.widest || 0) * 1.5
    const r = this.canvas.width - yAxisWidth
    this.yRegion2.extents.x.min = r
    this.plotRegion.extents.x.max = r
    this.xRegion.extents.x.max = r
    const extents2 = new Extents(startX, endX, yMin2, yMax2)

    this.ctx.strokeStyle = Purple
    this.doYLabels(this.plotRegion, 1000, 'USD')

    // x axis labels
    this.ctx.strokeStyle = this.theme.gridLines
    if (!this.opts.xDate) throw Error('only date supported')
    const xLabels = makeDateLabels(x[0], x[x.length - 1], 86400 * 1000, this.plotRegion.width(), 100)
    this.plotXLabels(xLabels, startX, endX, ['Date'])

    const plot = (extents: Extents, y: number[]) => {
      this.plotRegion.plot(extents, (ctx: CanvasRenderingContext2D, tools: Translator) => {
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(tools.x(startX), tools.y(y[0]))
        for (let i = 1; i < x.length; i++) ctx.lineTo(tools.x(x[i]), tools.y(y[i]))
        ctx.stroke()
      })
    }

    // Print the y labels.
    this.ctx.strokeStyle = Blue
    this.dataExtents = extents2
    this.plotYLabels(this.plotRegion, ethLabels, this.dataExtents.y.min, this.dataExtents.y.max, 'ETH', this.yRegion2, true)
    plot(extents2, y2)

    this.ctx.strokeStyle = Purple
    plot(extents1, y1)
  }
}

export class ScoreChart extends Chart {
  xs: number[][]
  ys: number[][]
  colors: string[]
  lineWidths: number[]

  constructor (parent: HTMLElement) {
    super(parent, {
      resize: () => this.resized(),
      click: (/* e: MouseEvent */) => { /* pass */ },
      zoom: (/* bigger: boolean */) => { /* pass */ }
    })
  }

  resized () {
    /* do stuff */
    this.render()
  }

  update (xs: number[][], ys: number[][], colors: string[], lineWidths: number[]) {
    this.xs = xs
    this.ys = ys
    this.colors = colors
    this.lineWidths = lineWidths
    this.render()
  }

  render () {
    if (!this.xs || !this.visible || this.canvas.width === 0) {
      this.renderScheduled = true
      return
    }
    this.clear()

    const { xs, ys, colors, lineWidths } = this

    if (xs.length === 0) {
      this.plotRegion.plot(new Extents(0, 1, 0, 1), (ctx: CanvasRenderingContext2D, tools: Translator) => {
        this.applyLabelStyle(15)
        ctx.fillText('no pools selected', tools.x(0.5), tools.y(0.5))
      })
      return
    }

    const xMax = Math.max(...xs.map((x: number[]) => Math.max(...x)))
    const xMin = Math.min(...xs.map((x: number[]) => Math.min(...x)))
    const yMax = Math.max(...ys.map((y: number[]) => Math.max(...y)))
    const yMin = Math.min(...ys.map((y: number[]) => Math.min(...y)))

    const extents = this.dataExtents = new Extents(xMin, xMax, yMin, yMax)
    this.applyLabelStyle()
    this.doYLabels(this.plotRegion, 100, 'score')

    const xLabels = makeLabels(this.ctx, this.plotRegion.width(), xMin, xMax, 100, 0.005, 'spread ±')
    this.plotXLabels(xLabels.lbls, xMin, xMax, ['spread ±'])

    for (let i = 0; i < xs.length; i++) {
      const [x, y, c] = [xs[i], ys[i], colors[i]]
      this.ctx.strokeStyle = c
      this.plotRegion.plot(extents, (ctx: CanvasRenderingContext2D, tools: Translator) => {
        ctx.lineWidth = lineWidths[i]
        ctx.beginPath()
        ctx.moveTo(tools.x(x[0]), tools.y(y[0]))
        for (let i = 1; i < x.length; i++) ctx.lineTo(tools.x(x[i]), tools.y(y[i]))
        ctx.stroke()
      })
    }
  }
}

export class Loader extends Chart {
  ani: Animation

  constructor (parent: HTMLElement) {
    super(parent, {
      resize: () => this.resized(),
      click: (/* e: MouseEvent */) => { /* pass */ },
      zoom: (/* bigger: boolean */) => { /* pass */ }
    })
    this.canvas.classList.add('fill-abs')
    this.canvas.style.zIndex = '5'

    this.resize()
    this.ani = new Animation(Animation.Forever, () => {
      this.render()
    })
  }

  resized () {
    /* do stuff */
    let { width: w, height: h } = this.canvas
    let [x, y] = [0, 0]
    const aspectRatio = 1 / 2
    if (w / h > aspectRatio) {
      w = h * aspectRatio
      x = (this.canvas.width - w) / 2
    } else {
      h = w / aspectRatio
      y = (this.canvas.height - h) / 2
    }
    this.plotRegion = new Region(this.ctx, new Extents(x, this.canvas.width - x, y, this.canvas.height - y))
    this.render()
  }

  render () {
    if (!this.visible || this.canvas.width === 0) {
      this.renderScheduled = true
      return
    }
    this.clear()
    this.ctx.fillStyle = window.getComputedStyle(document.body, null).getPropertyValue('background-color')
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    this.ctx.fillStyle = '#777'
    this.ctx.lineWidth = 2
    const period = 3000 // milliseconds
    const theta = new Date().getTime() / period * Math.PI * 2
    const powFactor = 2
    const topBottomPhase = Math.PI / 18
    const topY = 0.35 + Math.pow(Math.cos(theta + topBottomPhase), powFactor) * 0.5 // y: 0.85 -> 0.35, range: 0.5
    const bottomY = 0.15 + Math.pow(Math.cos(theta), powFactor) * 0.5 // y: 0.65 -> 0.15, median: 0.4
    const topOffsetX = 0.2 + Math.pow(Math.sin(theta + topBottomPhase), 2) * 0.2 // 0.2 -> 0.4, range 0.2
    const bottomOffsetX = 0.2 + Math.pow(Math.cos(theta), powFactor) * 0.2

    const plotPoints = (ctx: CanvasRenderingContext2D, pts: Point[]) => {
      const n = pts.length
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 0; i < 4; i++) {
        const ptBefore = pts[(i + n - 1) % n]
        const pt1 = pts[i]
        const pt2 = pts[(i + 1) % n]
        const ptAfter = pts[(i + 2) % n]
        const [handle1, handle2] = controlPoints(ptBefore, pt1, pt2, ptAfter)
        ctx.bezierCurveTo(handle1.x, handle1.y, handle2.x, handle2.y, pt2.x, pt2.y)
      }
      ctx.fill()
    }

    this.plotRegion.plot(new Extents(0, 1, 0, 1), (ctx: CanvasRenderingContext2D, tools: Translator) => {
      const pt0 = makePt(tools.x(topOffsetX), tools.y(topY))
      const pt1 = makePt(tools.x(1 - topOffsetX), tools.y(topY))
      const pt2 = makePt(tools.x(1 - bottomOffsetX), tools.y(bottomY))
      const pt3 = makePt(tools.x(bottomOffsetX), tools.y(bottomY))
      plotPoints(ctx, [pt0, pt1, pt2, pt3])
    })
  }

  stop () {
    this.ani.stop()
    this.canvas.remove()
  }
}

const SmoothingFactor = 1

// https://stackoverflow.com/questions/15691499/how-do-i-draw-a-closed-curve-over-a-set-of-points
function controlPoints (ptBefore: Point, pt1: Point, pt2: Point, ptAfter: Point): [Point, Point] {
  const xc1 = (ptBefore.x + pt1.x) / 2
  const yc1 = (ptBefore.y + pt1.y) / 2
  const xc2 = (pt1.x + pt2.x) / 2
  const yc2 = (pt1.y + pt2.y) / 2
  const xc3 = (pt2.x + ptAfter.x) / 2
  const yc3 = (pt2.y + ptAfter.y) / 2

  const len1 = Math.sqrt((pt1.x - ptBefore.x) * (pt1.x - ptBefore.x) + (pt1.y - ptBefore.y) * (pt1.y - ptBefore.y))
  const len2 = Math.sqrt((pt2.x - pt1.x) * (pt2.x - pt1.x) + (pt2.y - pt1.y) * (pt2.y - pt1.y))
  const len3 = Math.sqrt((ptAfter.x - pt2.x) * (ptAfter.x - pt2.x) + (ptAfter.y - pt2.y) * (ptAfter.y - pt2.y))

  const k1 = len1 / (len1 + len2)
  const k2 = len2 / (len2 + len3)

  const xm1 = xc1 + (xc2 - xc1) * k1
  const ym1 = yc1 + (yc2 - yc1) * k1

  const xm2 = xc2 + (xc3 - xc2) * k2
  const ym2 = yc2 + (yc3 - yc2) * k2

  const handle1X = xm1 + (xc2 - xm1) * SmoothingFactor + pt1.x - xm1
  const handle1Y = ym1 + (yc2 - ym1) * SmoothingFactor + pt1.y - ym1

  const handle2X = xm2 + (xc2 - xm2) * SmoothingFactor + pt2.x - xm2
  const handle2Y = ym2 + (yc2 - ym2) * SmoothingFactor + pt2.y - ym2

  return [makePt(handle1X, handle1Y), makePt(handle2X, handle2Y)]
}

export class VolumeChart extends Chart {
  vols: number[]
  color: string

  constructor (parent: HTMLElement) {
    super(parent, {
      resize: () => this.resized(),
      click: (/* e: MouseEvent */) => { /* pass */ },
      zoom: (/* bigger: boolean */) => { /* pass */ }
    })
  }

  resized () {
    this.render()
    this.plotRegion = new Region(this.ctx, new Extents(0, this.canvas.width, 0, this.canvas.height))
  }

  update (vols: number[], color: string) {
    this.vols = vols
    this.color = color
    this.render()
  }

  render () {
    if (!this.vols || !this.visible || this.canvas.width === 0) {
      this.renderScheduled = true
      return
    }
    this.clear()

    const vols = this.vols
    const n = vols.length

    const maxVol = Math.max(...vols)

    this.ctx.fillStyle = '#333'
    this.ctx.strokeStyle = this.color
    this.ctx.lineWidth = 2

    this.plotRegion.plot(new Extents(0, n, 0, 1), (ctx: CanvasRenderingContext2D, tools: Translator) => {
      for (let i = 0; i < n; i++) {
        const vol = vols[i]
        const [xStart, yZero, w, relativeVol] = [tools.x(i + 0.1), tools.y(0), tools.w(0.8), tools.h(vol / maxVol)]
        ctx.fillRect(xStart, yZero, w, relativeVol)
        ctx.strokeRect(xStart, yZero, w, relativeVol)
      }
    })
  }
}

let hues: number[] | undefined
let hueIdx = 1

export function generateHue () {
  if (!hues) {
    hues = []
    let denom = 2
    let num = 0
    while (denom <= 16) {
      while (num < denom) {
        hues.push(num / denom * 360)
        num += 2
      }
      denom *= 2
      num = 1
    }
  }
  const h = hues[hueIdx % hues.length]
  hueIdx++
  return `hsl(${h} 70% 50%)`
}
