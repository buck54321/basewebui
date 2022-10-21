// import { sleep, getContentSize } from './utils'
import { PageElement } from './registry'

const parser = new window.DOMParser()

// Helpers for working with the DOM.
export class Doc {
  /*
  * idel is the element with the specified id that is the descendent of the
  * specified node.
  */
  static idel (el: PageElement | Document, id: string): PageElement {
    return el.querySelector(`#${id}`) as PageElement
  }

  /* bind binds the function to the event for the element. */
  static bind (el: EventTarget, ev: string, f: (e: Event) => void) {
    el.addEventListener(ev, f)
  }

  /* unbind removes the handler for the event from the element. */
  static unbind (el: EventTarget, ev: string, f: (e: Event) => void) {
    el.removeEventListener(ev, f)
  }

  static isEnter (e: KeyboardEvent): boolean {
    return ['Enter', 'NumpadEnter'].includes(e.key)
  }

  /* noderize creates a Document object from a string of HTML. */
  static noderize (html: string): Document {
    return parser.parseFromString(html, 'text/html')
  }

  /*
  * mouseInElement returns true if the position of mouse event, e, is within
  * the bounds of the specified element.
  */
  static mouseInElement (e: MouseEvent, el: PageElement) {
    const rect = el.getBoundingClientRect()
    return e.pageX >= rect.left && e.pageX <= rect.right &&
      e.pageY >= rect.top && e.pageY <= rect.bottom
  }

  /*
  * layoutMetrics gets information about the elements position on the page.
  */
  static layoutMetrics (el: PageElement) {
    const box = el.getBoundingClientRect()
    const docEl = document.documentElement
    const top = box.top + docEl.scrollTop
    const left = box.left + docEl.scrollLeft
    const w = el.offsetWidth
    const h = el.offsetHeight
    return {
      bodyTop: top,
      bodyLeft: left,
      width: w,
      height: h,
      centerX: left + w / 2,
      centerY: top + h / 2
    }
  }

  /* empty removes all child nodes from the specified element. */
  static empty (...els: PageElement[]) {
    for (const el of els) {
      while (el.firstChild) el.removeChild(el.firstChild)
    }
  }

  /*
  * hide hides the specified elements. This is accomplished by adding the
  * bootstrap d-hide class to the element. Use Doc.show to undo.
  */
  static hide (...els: PageElement[]) {
    for (const el of els) el.classList.add('d-hide')
  }

  /*
  * show shows the specified elements. This is accomplished by removing the
  * bootstrap d-hide class as added with Doc.hide.
  */
  static show (...els: PageElement[]) {
    for (const el of els) el.classList.remove('d-hide')
  }

  /* isHidden returns true if the specified element is hidden */
  static isHidden (el: PageElement) {
    return el.classList.contains('d-hide')
  }

  /* isDisplayed returns true if the specified element is not hidden */
  static isDisplayed (el: PageElement) {
    return !el.classList.contains('d-hide')
  }

  // /*
  //  * loading adds an overlay and a spinner to the element and returns a function
  //  * that can be called to remove the spinner.
  //  */
  // static loading (el: PageElement) {
  //   const blocker = document.createElement('div')
  //   blocker.classList.add('loader')
  //   const spinner = document.createElement('span')
  //   spinner.classList.add('ico-spinner', 'spinner')
  //   blocker.appendChild(spinner)
  //   el.appendChild(blocker)
  //   return () => { blocker.remove() }
  // }

  // /*
  // * animate runs the supplied function, which should be a "progress" function
  // * accepting one argument. The progress function will be called repeatedly
  // * with the argument varying from 0.0 to 1.0. The exact path that animate
  // * takes from 0.0 to 1.0 will vary depending on the choice of easing
  // * algorithm. See the Easing object for the available easing algo choices. The
  // * default easing algorithm is linear.
  // */
  // static animate (duration: number, f: (prog: number) => void, easingAlgo?: string, done?: () => void) {
  //   return new Animation(duration, f, easingAlgo, done)
  // }

  static applySelector (ancestor: HTMLElement, k: string): PageElement[] {
    return Array.from(ancestor.querySelectorAll(k)) as PageElement[]
  }

  static kids (ancestor: HTMLElement): PageElement[] {
    return Array.from(ancestor.children) as PageElement[]
  }

  static safeSelector (ancestor: HTMLElement, k: string): PageElement {
    const el = ancestor.querySelector(k)
    if (el) return el as PageElement
    console.warn(`no element found for selector '${k}' on element ->`, ancestor)
    return document.createElement('div')
  }

  /*
  * idDescendents constructs a page object from the supplied list of id strings.
  * The properties of the returned object have names matching the supplied
  * id strings, with the corresponding value being the Element object. It is
  * not an error if an element does not exist for an id in the list.
  */
  static idDescendents (main: PageElement): Record<string, PageElement> {
    const page: Record<string, PageElement> = {}
    for (const node of main.querySelectorAll('[id]')) page[node.id] = node as PageElement
    return page
  }

  /*
  * tmplElement is a helper function for grabbing sub-elements of the market list
  * template.
  */
  static tmplElement (ancestor: PageElement, s: string) {
    return ancestor.querySelector(`[data-tmpl="${s}"]`)
  }

  /*
  * parseTemplate returns an object of data-tmpl elements, keyed by their
  * data-tmpl values.
  */
  static parseTemplate (ancestor: PageElement): Record<string, PageElement> {
    const d: Record<string, PageElement> = {}
    for (const el of Doc.applySelector(ancestor, '[data-tmpl]')) d[el.dataset.tmpl || ''] = el
    return d
  }

  /*
  * cleanTemplates removes the elements from the DOM and deletes the id
  * attribute.
  */
  static cleanTemplates (...tmpls: PageElement[]) {
    tmpls.forEach(tmpl => {
      tmpl.remove()
      tmpl.removeAttribute('id')
    })
  }

  /*
  * timeSince returns a string representation of the duration since the specified
  * unix timestamp.
  */
  static timeSince (t: number, spacer: string) {
    return Doc.formatDuration(Math.floor(((new Date().getTime()) - t)), spacer)
  }

  static formatDuration (seconds: number, spacer: string) {
    let result = ''
    let count = 0
    spacer = typeof spacer === 'undefined' ? ' ' : spacer
    const add = (n: number, s: string) => {
      if (n > 0 || count > 0) count++
      if (n > 0) result += `${n}${spacer}${s} `
      return count >= 2
    }
    let y, mo, d, h, m, s
    [y, seconds] = timeMod(seconds, aYear)
    if (add(y, 'y')) { return result }
    [mo, seconds] = timeMod(seconds, aMonth)
    if (add(mo, 'mo')) { return result }
    [d, seconds] = timeMod(seconds, aDay)
    if (add(d, 'd')) { return result }
    [h, seconds] = timeMod(seconds, anHour)
    if (add(h, 'h')) { return result }
    [m, seconds] = timeMod(seconds, aMinute)
    if (add(m, 'm')) { return result }
    [s, seconds] = timeMod(seconds, 1000)
    add(s, 's')
    return result || '0 s'
  }

  /*
  * disableMouseWheel can be used to disable the mouse wheel for any
  * input. It is very easy to unknowingly scroll up on a number input
  * and then submit an unexpected value. This function prevents the
  * scroll increment/decrement behavior for a wheel action on a
  * number input.
  */
  static disableMouseWheel (...inputFields: PageElement[]) {
    for (const inputField of inputFields) {
      inputField.addEventListener('wheel', (ev) => {
        ev.preventDefault()
      })
    }
  }

  static copyToClipboard (text: string) {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
  }

//   static async popupMessage (text: string | Text) {
//     const msg = document.createElement('div') as PageElement
//     msg.classList.add('popup-msg')
//     msg.style.bottom = '75px'
//     if (typeof text === 'string') text = document.createTextNode(text) as Text
//     msg.appendChild(text)
//     if (popups.running) return popups.waiting.push(msg)
//     popups.running = true
//     popups.waiting = [msg]
//     while (popups.waiting.length) {
//       const msg = popups.waiting.shift()
//       if (!msg) break
//       _body.appendChild(msg)
//       const rect = msg.getBoundingClientRect()
//       msg.style.right = `-${rect.width}px`
//       await new Animation(200, progress => {
//         msg.style.right = `-${rect.width * (1 - progress)}px`
//       }).wait()
//       await sleep(2500)
//       await new Animation(200, progress => {
//         msg.style.right = `-${rect.width * progress}px`
//       }).wait()
//       msg.remove()
//     }
//     popups.running = false
//   }
}

const aYear = 31536000000
const aMonth = 2592000000
const aDay = 86400000
const anHour = 3600000
const aMinute = 60000

/* timeMod returns the quotient and remainder of t / dur. */
function timeMod (t: number, dur: number) {
  const n = Math.floor(t / dur)
  return [n, t - n * dur]
}

export class RadioGroup {
  ancestor: PageElement
  radios: PageElement[]

  constructor (ancestor: PageElement) {
    this.ancestor = ancestor
    this.radios = Array.from(ancestor.querySelectorAll('.radio'))
    for (const radio of this.radios) {
      Doc.bind(radio, 'click', e => {
        e.stopPropagation()
        this.radioClicked(radio)
      })
    }
    for (const box of Doc.applySelector(ancestor, '.radio-box')) {
      Doc.bind(box, 'click', () => Doc.safeSelector(box, '.radio').click())
    }
  }

  radioClicked (radio: PageElement) {
    for (const r of this.radios) r.classList.remove('checked')
    radio.classList.add('checked')
  }

  selection () {
    const selected = Doc.safeSelector(this.ancestor, '.radio.checked')
    if (!selected) return null
    return selected.dataset.value
  }
}
