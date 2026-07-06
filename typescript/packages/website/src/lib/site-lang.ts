// The site-wide language choice: which port's code the examples show. One
// value for the whole site, chosen in the header dropdown, persisted in
// localStorage and mirrored to `data-lang` on <html> (attribute-less means
// the TypeScript default, matching the other header selects). Everything
// that shows code — the interactive editors, Starlight's synced code tabs —
// follows it via the change event.

export type SiteLang = 'ts' | 'java' | 'kotlin' | 'python'

export const SITE_LANGS: ReadonlyArray<SiteLang> = ['ts', 'java', 'kotlin', 'python']

// Starlight <TabItem> labels ↔ SiteLang. The labels double as the values
// Starlight persists for `syncKey="lang"` tab groups, so they must match the
// TabItem labels used in docs pages exactly.
export const LANG_LABELS: Readonly<Record<SiteLang, string>> = {
  ts: 'TypeScript',
  java: 'Java',
  kotlin: 'Kotlin',
  python: 'Python',
}

export const LANG_CHANGE_EVENT = 'var-lang-change'

const storageKey = 'var-lang'

export const parseLang = (value: unknown): SiteLang =>
  value === 'java' || value === 'kotlin' || value === 'python' ? value : 'ts'

export const langOfLabel = (label: string): SiteLang | undefined =>
  SITE_LANGS.find((lang) => LANG_LABELS[lang] === label)

// Maps a code file extension to its language; undefined for language-neutral
// files (the .md spec) that are shown regardless of the site language.
export function langOfPath(path: string): SiteLang | undefined {
  if (path.endsWith('.ts')) return 'ts'
  if (path.endsWith('.java')) return 'java'
  if (path.endsWith('.kt')) return 'kotlin'
  if (path.endsWith('.py')) return 'python'
  return undefined
}

export const currentLang = (): SiteLang => parseLang(document.documentElement.dataset.lang)

/** Apply + persist a language choice and notify listeners (editors, tab sync). */
export function setLang(lang: SiteLang): void {
  if (currentLang() === lang) return
  document.documentElement.dataset.lang = lang
  try {
    localStorage.setItem(storageKey, lang)
  } catch {
    // private mode — the choice just won't persist
  }
  document.dispatchEvent(new CustomEvent<SiteLang>(LANG_CHANGE_EVENT, { detail: lang }))
}

export function onLangChange(listener: (lang: SiteLang) => void): void {
  document.addEventListener(LANG_CHANGE_EVENT, (e) => {
    listener(parseLang((e as CustomEvent<SiteLang>).detail))
  })
}
