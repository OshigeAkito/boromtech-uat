import en from './en'
import th from './th'
import vi from './vi'
import zh from './zh'

export const locales = ['th', 'en', 'vi', 'zh'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'th'

const strings = { th, en, vi, zh }

// tag goes in <html lang> and hreflang; zh is Simplified Chinese.
export const languages: Record<Locale, { tag: string; og: string; name: string; short: string }> = {
  th: { tag: 'th', og: 'th_TH', name: 'ไทย', short: 'TH' },
  en: { tag: 'en', og: 'en_US', name: 'English', short: 'EN' },
  vi: { tag: 'vi', og: 'vi_VN', name: 'Tiếng Việt', short: 'VI' },
  zh: { tag: 'zh-Hans', og: 'zh_CN', name: '简体中文', short: '中文' },
}

export function useLocale(current: string | undefined) {
  const locale = locales.find((l) => l === current) ?? defaultLocale
  return { locale, t: strings[locale], lang: languages[locale] }
}

export const localePath = (locale: Locale) => (locale === defaultLocale ? '/' : `/${locale}/`)
