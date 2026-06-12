import { apiFetch } from './client'

export type QuranSurah = {
  id: number
  nama: string
  namaArab: string
  namaTerjemahan?: { name?: string; language_name?: string } | null
  jumlahAyat: number
  revelationPlace?: string
  /** Mushaf page range: [startPage, endPage]. */
  paginasi?: [number, number]
}

export type QuranWord = {
  arab: string
  terjemahan?: string
  transliterasi?: string
}

export type QuranTranslationText = {
  id: number
  teks: string
}

export type QuranAyah = {
  id?: number
  kunciAyat: string
  halaman?: number
  juz?: number
  arab: string
  terjemahan: string | QuranTranslationText[]
  perKata: QuranWord[]
}

export type QuranPageResponse = {
  halaman: number
  ayat: QuranAyah[]
}

export type QuranVerse = {
  id: number
  verseKey: string
  verseNumber: number
  textUthmani: string
  translation: string
}

export type QuranSurahDetail = {
  chapter: {
    id: number
    name_simple: string
    name_arabic: string
    translated_name?: { name?: string }
    verses_count: number
    revelation_place?: string
  }
  verses: QuranVerse[]
}

export type QuranTranslation = {
  id: number
  code: string
  label: string
  lang: string
}

export type ManqulNote = {
  id: string
  userId: string
  kunciAyat: string
  wordIdx: number
  teks: string
  createdAt: string
  updatedAt: string
}

export function listQuranSurahs() {
  return apiFetch<QuranSurah[]>('/api/quran/surahs')
}

export function getQuranSurah(id: number | string, translation?: string) {
  const qs = translation ? `?translation=${encodeURIComponent(translation)}` : ''
  return apiFetch<QuranSurahDetail>(`/api/quran/surahs/${id}${qs}`)
}

export function listQuranTranslations() {
  return apiFetch<QuranTranslation[]>('/api/quran/translations')
}

export function getQuranPage(
  n: number,
  opts: { translations?: string; words?: boolean; wordTrans?: string } = {},
) {
  const sp = new URLSearchParams()
  if (opts.translations) sp.set('translations', opts.translations)
  if (opts.words) sp.set('words', 'true')
  if (opts.wordTrans) sp.set('wordTrans', opts.wordTrans)
  const qs = sp.toString()
  return apiFetch<QuranPageResponse>(`/api/quran/pages/${n}${qs ? `?${qs}` : ''}`)
}

export function listManqulNotes(surah?: string) {
  const qs = surah ? `?surah=${encodeURIComponent(surah)}` : ''
  return apiFetch<ManqulNote[]>(`/api/quran/manqul-notes${qs}`)
}

export function upsertManqulNote(input: { kunciAyat: string; wordIdx: number; teks: string }) {
  return apiFetch<ManqulNote | { deleted: true }>('/api/quran/manqul-notes', {
    method: 'POST',
    body: input,
  })
}

// --- Manqul sharing -------------------------------------------------------

/** A user another person's manqul ayah is shared with. */
export type ShareRecipient = {
  id: string
  name: string
}

/** Minimal user shape returned by the recipient search picker. */
export type ManqulRecipientCandidate = {
  id: string
  name: string
  nickname?: string
  role: string
}

/** An owner who has shared >=1 ayah of the current surah with the viewer. */
export type ManqulSource = {
  ownerUserId: string
  ownerName: string
  ayatCount: number
}

/** Owners who shared manqul in `surah` with the current user (dropdown sources). */
export function listAvailableManqulSources(surah: string) {
  return apiFetch<ManqulSource[]>(`/api/quran/manqul-shares/available?surah=${encodeURIComponent(surah)}`)
}

/** A sharer's manqul notes (per-ayah + per-word) for the given ayat, shared with me. */
export function getSharedManqul(owner: string, ayat: string[]) {
  const sp = new URLSearchParams({ owner, ayat: ayat.join(',') })
  return apiFetch<ManqulNote[]>(`/api/quran/manqul-shares/shared?${sp.toString()}`)
}

/** Recipients I've shared one ayah's manqul with (prefills the share dialog). */
export function listMyShareRecipients(kunciAyat: string) {
  return apiFetch<ShareRecipient[]>(`/api/quran/manqul-shares/mine?ayat=${encodeURIComponent(kunciAyat)}`)
}

/** Replace the recipient set for one ayah; empty list unshares. Returns the new set. */
export function setManqulShare(input: { kunciAyat: string; recipientUserIds: string[] }) {
  return apiFetch<ShareRecipient[]>('/api/quran/manqul-shares', {
    method: 'POST',
    body: input,
  })
}

/** Search users to share with (>=2 chars; excludes me). */
export function searchManqulRecipients(q: string) {
  return apiFetch<ManqulRecipientCandidate[]>(`/api/quran/manqul-recipients?q=${encodeURIComponent(q)}`)
}
