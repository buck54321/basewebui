import { PageElement } from './registry'

/* sleep can be used by async functions to pause for a specified period. */
export function sleep (ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getContentSize (el: PageElement) {
  const sty = window.getComputedStyle(el)
  return {
    width: el.clientWidth - parseFloat(sty.paddingLeft) - parseFloat(sty.paddingRight),
    height: el.clientHeight - parseFloat(sty.paddingTop) - parseFloat(sty.paddingBottom)
  }
}
