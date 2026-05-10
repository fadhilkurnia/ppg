/**
 * Calculate age in completed years from an ISO date-of-birth string.
 * Returns null if the input is missing or unparseable.
 */
export function ageInYears(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null

  let years = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    years--
  }
  return years < 0 ? null : years
}
