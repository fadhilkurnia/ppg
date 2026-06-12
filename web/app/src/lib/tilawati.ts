// Tilawati structural constants shared by the reader, picker, and
// Achievement aggregator. Every jilid in the printed Tilawati series
// opens with a fixed number of intro pages (cover + table of contents)
// that are NOT counted toward learning achievement — they are part of
// the physical book but contain no curriculum content. Achievement
// totals, pickers, and ref validators must agree on which pages count.

export const TILAWATI_INTRO_PAGES = 2

/** First page that counts as learning content (1-indexed). */
export const TILAWATI_LEARNING_START = TILAWATI_INTRO_PAGES + 1

export type TilawatiJilidInfo = {
  id: number
  /** Total printed pages including the intro spread. Use for the reader
   *  and for the per-jilid max in the picker — the reader still shows
   *  the cover/index pages, they just don't count for achievement. */
  pages: number
  /** Number of pages that actually count toward achievement (== pages -
   *  TILAWATI_INTRO_PAGES). Use for picker dropdown labels and for the
   *  per-jilid total in achievement breakdowns. */
  learningPages: number
}

export const TILAWATI_JILID: TilawatiJilidInfo[] = [
  { id: 1, pages: 46, learningPages: 46 - TILAWATI_INTRO_PAGES },
  { id: 2, pages: 46, learningPages: 46 - TILAWATI_INTRO_PAGES },
  { id: 3, pages: 46, learningPages: 46 - TILAWATI_INTRO_PAGES },
  { id: 4, pages: 46, learningPages: 46 - TILAWATI_INTRO_PAGES },
  { id: 5, pages: 46, learningPages: 46 - TILAWATI_INTRO_PAGES },
  { id: 6, pages: 42, learningPages: 42 - TILAWATI_INTRO_PAGES },
]

/** Map of jilid id (as string, since refs use string keys) → total printed pages. */
export const TILAWATI_PAGES_BY_JILID: Record<string, number> = Object.fromEntries(
  TILAWATI_JILID.map((j) => [String(j.id), j.pages]),
)

/** Map of jilid id (as string) → learning page count (intro pages subtracted). */
export const TILAWATI_LEARNING_PAGES_BY_JILID: Record<string, number> = Object.fromEntries(
  TILAWATI_JILID.map((j) => [String(j.id), j.learningPages]),
)

/** Sum of learning pages across every jilid — the denominator for the
 *  "all-Tilawati" achievement progress bar. */
export const TILAWATI_TOTAL_LEARNING_PAGES = TILAWATI_JILID.reduce(
  (sum, j) => sum + j.learningPages,
  0,
)

/** Returns true if the page number (1-indexed) is a learning page, i.e.
 *  past the intro spread. Pages 1 and 2 of every jilid are always intro. */
export function isTilawatiLearningPage(page: number): boolean {
  return page >= TILAWATI_LEARNING_START
}
