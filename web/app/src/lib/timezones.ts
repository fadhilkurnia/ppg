/**
 * Timezone catalog used by the profile dialog and the Kehadiran calendar.
 * Indonesia gets the three civil zones (WIB/WITA/WIT). USA + Canada include
 * the IANA zones that observe DST plus the major no-DST ones (Phoenix,
 * Saskatchewan). Keep this list short and curated — long IANA dumps are
 * tedious to scroll. Use `Asia/Jakarta` etc. so Intl.DateTimeFormat works.
 */

export type Timezone = {
  /** IANA name, e.g. "Asia/Jakarta". */
  value: string
  /** Short label shown in the picker, e.g. "WIB (Jakarta)". */
  label: string
  /** Optional UTC offset hint, e.g. "UTC+7". */
  hint?: string
  /** Group header used to bucket the dropdown. */
  group: 'Indonesia' | 'United States' | 'Canada'
}

export const DEFAULT_TIMEZONE = 'Asia/Jakarta'

export const TIMEZONES: Timezone[] = [
  // Indonesia
  { value: 'Asia/Jakarta', label: 'WIB (Jakarta)', hint: 'UTC+7', group: 'Indonesia' },
  { value: 'Asia/Makassar', label: 'WITA (Makassar)', hint: 'UTC+8', group: 'Indonesia' },
  { value: 'Asia/Jayapura', label: 'WIT (Jayapura)', hint: 'UTC+9', group: 'Indonesia' },

  // United States
  { value: 'America/New_York', label: 'Eastern (New York)', hint: 'UTC−5/−4', group: 'United States' },
  { value: 'America/Chicago', label: 'Central (Chicago)', hint: 'UTC−6/−5', group: 'United States' },
  { value: 'America/Denver', label: 'Mountain (Denver)', hint: 'UTC−7/−6', group: 'United States' },
  { value: 'America/Phoenix', label: 'Mountain — no DST (Phoenix)', hint: 'UTC−7', group: 'United States' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)', hint: 'UTC−8/−7', group: 'United States' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)', hint: 'UTC−9/−8', group: 'United States' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)', hint: 'UTC−10', group: 'United States' },

  // Canada
  { value: 'America/St_Johns', label: 'Newfoundland (St. John’s)', hint: 'UTC−3:30/−2:30', group: 'Canada' },
  { value: 'America/Halifax', label: 'Atlantic (Halifax)', hint: 'UTC−4/−3', group: 'Canada' },
  { value: 'America/Toronto', label: 'Eastern (Toronto)', hint: 'UTC−5/−4', group: 'Canada' },
  { value: 'America/Winnipeg', label: 'Central (Winnipeg)', hint: 'UTC−6/−5', group: 'Canada' },
  { value: 'America/Regina', label: 'Central — no DST (Regina)', hint: 'UTC−6', group: 'Canada' },
  { value: 'America/Edmonton', label: 'Mountain (Edmonton)', hint: 'UTC−7/−6', group: 'Canada' },
  { value: 'America/Vancouver', label: 'Pacific (Vancouver)', hint: 'UTC−8/−7', group: 'Canada' },
]

const TZ_BY_VALUE = new Map(TIMEZONES.map((tz) => [tz.value, tz]))

export function findTimezone(value: string | null | undefined): Timezone | undefined {
  if (!value) return undefined
  return TZ_BY_VALUE.get(value)
}

export function timezoneLabel(value: string | null | undefined): string {
  const tz = findTimezone(value)
  if (tz) return `${tz.label} · ${tz.hint ?? tz.value}`
  return value || DEFAULT_TIMEZONE
}

/** Group the timezone list for use in <optgroup> or sectioned dropdowns. */
export function timezoneGroups(): { group: Timezone['group']; items: Timezone[] }[] {
  const groups: Timezone['group'][] = ['Indonesia', 'United States', 'Canada']
  return groups.map((g) => ({ group: g, items: TIMEZONES.filter((tz) => tz.group === g) }))
}
