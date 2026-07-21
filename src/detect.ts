//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import { type MeptoStatic } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  function detect(this: MeptoStatic, ua: string, platform: string): void {
    const os = (this.os = {}) as Record<string, any>
    const browser = (this.browser = {}) as Record<string, any>
    const webkit: RegExpMatchArray | null = ua.match(/Web[kK]it[\/]{0,1}([\d.]+)/)
    const android: RegExpMatchArray | null = ua.match(/(Android);?[\s\/]+([\d.]+)?/)
    const osx = !!ua.match(/\(Macintosh\; Intel /)
    const ipad: RegExpMatchArray | null = ua.match(/(iPad).*OS\s([\d_]+)/)
    const ipod: RegExpMatchArray | null = ua.match(/(iPod)(.*OS\s([\d_]+))?/)
    const iphone: any = !ipad && ua.match(/(iPhone\sOS)\s([\d_]+)/)
    const win = /Win\d{2}|Windows/.test(platform)
    const wp: RegExpMatchArray | null = ua.match(/Windows Phone ([\d.]+)/)
    const chrome: RegExpMatchArray | null =
      ua.match(/Chrome\/([\d.]+)/) || ua.match(/CriOS\/([\d.]+)/)
    const firefox: RegExpMatchArray | null = ua.match(/Firefox\/([\d.]+)/)
    const webview: any = !chrome && ua.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/)
    const safari: any =
      webview || ua.match(/Version\/([\d.]+)([^S](Safari)|[^M]*(Mobile)[^S]*(Safari))/)

    if ((browser.webkit = !!webkit)) browser.version = webkit![1]

    if (android) ((os.android = true), (os.version = android![2]))
    if (iphone && !ipod) ((os.ios = os.iphone = true), (os.version = iphone[2].replace(/_/g, '.')))
    if (ipad) ((os.ios = os.ipad = true), (os.version = ipad![2].replace(/_/g, '.')))
    if (ipod)
      ((os.ios = os.ipod = true), (os.version = ipod![3] ? ipod![3].replace(/_/g, '.') : null))
    if (wp) ((os.wp = true), (os.version = wp![1]))
    if (chrome) ((browser.chrome = true), (browser.version = chrome![1]))
    if (firefox) ((browser.firefox = true), (browser.version = firefox![1]))
    if (safari && (osx || os.ios || win)) {
      browser.safari = true
      if (!os.ios) browser.version = safari[1]
    }
    if (webview) browser.webview = true

    os.tablet = !!(ipad || (android && !ua.match(/Mobile/)) || (firefox && ua.match(/Tablet/)))
    os.phone = !!(
      !os.tablet &&
      !os.ipod &&
      (android ||
        iphone ||
        (chrome && ua.match(/Android/)) ||
        (chrome && ua.match(/CriOS\/([\d.]+)/)) ||
        (firefox && ua.match(/Mobile/)))
    )
  }

  detect.call($, navigator.userAgent, navigator.platform)
})(mepto)
