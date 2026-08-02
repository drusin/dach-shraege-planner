import type { RoomPointKey } from '../types'

/** Raw translation map – loaded from JSON */
let messages: Record<string, string> = {}

/** Currently active locale code */
let currentLocale: 'de' | 'en' = 'en'

/**
 * Load translations from a JSON blob.
 * Optionally pass the locale code; otherwise auto-detected.
 */
export function loadLocale(
  data: Record<string, string>,
  locale?: 'de' | 'en',
): void {
  messages = { ...data }
  currentLocale = locale ?? detectLocale()
}

/** Get the currently active locale code */
export function getLocale(): 'de' | 'en' {
  return currentLocale
}

/**
 * Detect the best locale from the browser's Accept-Language preferences.
 * URL param `?lang=de` or `?lang=en` takes precedence.
 * - de / de-* → returns 'de'
 * - en / en-* → returns 'en'
 * - anything else → returns 'en' (fallback)
 */
export function detectLocale(): 'de' | 'en' {
  if (typeof window !== 'undefined') {
    const urlLang = new URLSearchParams(window.location.search).get('lang')
    if (urlLang === 'de') return 'de'
    if (urlLang === 'en') return 'en'
    if (typeof navigator !== 'undefined') {
      const lang = navigator.language?.toLowerCase() ?? ''
      if (lang.startsWith('de')) return 'de'
    }
  }
  return 'en'
}

/**
 * Translate a key with optional params.
 * Params use `{name}` syntax in the template.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let msg = messages[key]
  if (msg === undefined) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] missing translation key: "${key}"`)
    }
    return `[${key}]`
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return msg
}

/** Shortcut: t() with a simple count param */
export function tn(key: string, count: number): string {
  return t(key, { count })
}

/**
 * Get the translated label for a room point key.
 * Used where ROOM_POINT_LABELS was previously referenced.
 */
export function roomPointLabel(key: RoomPointKey): string {
  return t(`room.point_${key}`)
}