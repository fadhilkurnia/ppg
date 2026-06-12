import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { listDoa } from '@/api/doa'
import { listKitab } from '@/api/hadits'
import { listQuranSurahs } from '@/api/quran'
import type { LibraryAspect, LibraryKind } from '@/api/sesi'

/**
 * formatQuranRef — turns the canonical Quran library_ref into a human label.
 * Accepts "<surah>" | "<surah>:<ayat>" | "<surah>:<from>-<to>". Returns
 * "<Nama Surat> (<n>) : <ayat>" or just "<Nama Surat> (<n>)" for whole surah.
 */
export function formatQuranRef(
  ref: string,
  surahNameById: Record<number, string>,
  surahFallback: string,
): string {
  const parts = ref.split(':')
  const surahNum = Number(parts[0])
  if (!surahNum || surahNum < 1 || surahNum > 114) return ref
  const nama = surahNameById[surahNum] || `${surahFallback} ${surahNum}`
  const base = `${nama} (${surahNum})`
  if (parts.length < 2 || !parts[1]) return base
  return `${base} : ${parts[1]}`
}

/** formatHaditsRef — "<slug>" or "<slug>#<n>" / "<slug>#<a>-<b>". */
function formatHaditsRef(
  ref: string,
  kitabNameBySlug: Record<string, string>,
  noLabel: string,
): string {
  const i = ref.indexOf('#')
  const slug = i >= 0 ? ref.slice(0, i) : ref
  const nomor = i >= 0 ? ref.slice(i + 1) : ''
  const nama = kitabNameBySlug[slug] || slug
  return nomor ? `${nama} · ${noLabel} ${nomor}` : nama
}

/** formatTilawatiRef — "<jilid>" or "<jilid>:<page>" / "<jilid>:<a>-<b>". */
function formatTilawatiRef(
  ref: string,
  jilidLabel: string,
  pageLabel: string,
): string {
  const parts = ref.split(':')
  const jilid = parts[0]
  const page = parts[1]
  if (!page) return `${jilidLabel} ${jilid}`
  return `${jilidLabel} ${jilid} · ${pageLabel} ${page}`
}

/** Resolve doa ref (compact_ajar.id) → doa.nama. Falls back to raw id. */
function formatDoaRef(ref: string, doaNameById: Record<string, string>): string {
  return doaNameById[ref] || ref
}

/**
 * LibraryRefLabel — small read-only display that converts a raw
 * (libraryKind, libraryRef, libraryAspect) tuple into a human-friendly
 * label. Caches the lookup tables behind react-query so callers don't
 * trigger N fetches when many items are rendered.
 */
export function LibraryRefLabel({
  libraryKind,
  libraryRef,
  libraryAspect,
  className,
  showKind = true,
}: {
  libraryKind: LibraryKind
  libraryRef?: string | null
  libraryAspect?: LibraryAspect | null
  className?: string
  showKind?: boolean
}) {
  const { t } = useTranslation()
  const KIND_LABEL: Record<LibraryKind, string> = {
    kurikulum: t('sesiDialog.summary.kindKurikulum'),
    quran: t('achievement.kindQuran'),
    hadits: t('achievement.kindHadits'),
    tilawati: t('achievement.kindTilawati'),
    doa: t('achievement.kindDoa'),
  }
  const ASPECT_LABEL: Record<LibraryAspect, string> = {
    reciting: t('achievement.aspectReciting'),
    memorizing: t('achievement.aspectMemorizing'),
    review: t('achievement.aspectReview'),
    manqul: t('achievement.aspectManqul'),
  }
  const ref = libraryRef ?? ''

  const needsSurahs = libraryKind === 'quran'
  const needsKitabs = libraryKind === 'hadits'
  const needsDoa = libraryKind === 'doa'

  const { data: surahs } = useQuery({
    queryKey: ['quran-surahs'],
    queryFn: listQuranSurahs,
    staleTime: 60 * 60_000,
    enabled: needsSurahs,
  })

  const { data: kitabs } = useQuery({
    queryKey: ['hadits-kitab', 'hadits'],
    queryFn: () => listKitab('hadits'),
    staleTime: 60 * 60_000,
    enabled: needsKitabs,
  })

  const { data: doas } = useQuery({
    queryKey: ['doa-list'],
    queryFn: () => listDoa({}),
    staleTime: 60 * 60_000,
    enabled: needsDoa,
  })

  let label = ref
  if (!ref) {
    label = '—'
  } else if (libraryKind === 'quran') {
    const map: Record<number, string> = {}
    for (const s of surahs ?? []) map[s.id] = s.nama
    label = formatQuranRef(ref, map, t('pustaka.refLabel.surahFallback'))
  } else if (libraryKind === 'hadits') {
    const map: Record<string, string> = {}
    for (const k of kitabs ?? []) map[k.slug] = k.nama
    label = formatHaditsRef(ref, map, t('pustaka.refLabel.noShort'))
  } else if (libraryKind === 'tilawati') {
    label = formatTilawatiRef(ref, t('pustaka.refLabel.jilid'), t('pustaka.refLabel.page'))
  } else if (libraryKind === 'doa') {
    const map: Record<string, string> = {}
    for (const d of doas ?? []) map[d.id] = d.nama
    label = formatDoaRef(ref, map)
  }

  return (
    <span className={className}>
      {showKind ? (
        <span className="text-xs uppercase tracking-wide text-sky-700">
          {KIND_LABEL[libraryKind]}
          {libraryAspect ? ` · ${ASPECT_LABEL[libraryAspect]}` : ''}
        </span>
      ) : null}
      <span className="block text-sm">{label}</span>
    </span>
  )
}
