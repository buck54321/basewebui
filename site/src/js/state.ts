// State is a set of static methods for working with the user state. It has
// utilities for setting and retrieving cookies and storing user configuration
// to localStorage.
export class State {
  static setCookie (cname: string, cvalue: string) {
    const d = new Date()
    // Set cookie to expire in ten years.
    d.setTime(d.getTime() + (86400 * 365 * 10 * 1000))
    const expires = 'expires=' + d.toUTCString()
    document.cookie = cname + '=' + cvalue + ';' + expires + ';path=/'
  }

  /*
   * getCookie returns the value at the specified cookie name, otherwise null.
   */
  static getCookie (cname: string) {
    for (const cstr of document.cookie.split(';')) {
      const [k, v] = cstr.split('=')
      if (k.trim() === cname) return v
    }
    return null
  }

  /* store puts the key-value pair into Window.localStorage. */
  static store (k: string, v: any) {
    window.localStorage.setItem(k, JSON.stringify(v))
  }

  /* clearAllStore remove all the key-value pair in Window.localStorage. */
  static clearAllStore () {
    window.localStorage.clear()
  }

  /*
  * fetch fetches the value associated with the key in Window.localStorage, or
  * null if the no value exists for the key.
  */
  static fetch (k: string) {
    const v = window.localStorage.getItem(k)
    if (v !== null) {
      return JSON.parse(v)
    }
    return null
  }
}
