import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getWilayah } from '@/api/wilayah'
import { Field } from '@/components/Field'

export type WilayahValue = { daerah: string; desa: string; kelompok: string }

const selectCls =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:bg-slate-100 disabled:text-slate-400'

/**
 * WilayahPicker — three cascading dropdowns (Daerah -> Desa -> Kelompok)
 * sourced from the master Wilayah tree. Values are the chosen NAMES (matching
 * the free-text users.daerah/desa/kelompok columns). Changing a level resets
 * its descendants. A current value that no longer exists in the master (legacy
 * free-text data) is still shown as a selectable option so it is never lost.
 */
export function WilayahPicker({ value, onChange }: { value: WilayahValue; onChange: (v: WilayahValue) => void }) {
  const { t } = useTranslation()
  const { data } = useQuery({ queryKey: ['wilayah'], queryFn: getWilayah })

  const daerahList = data?.daerah ?? []
  const desaList = useMemo(
    () => daerahList.find((d) => d.name === value.daerah)?.desa ?? [],
    [daerahList, value.daerah],
  )
  const kelompokList = useMemo(
    () => desaList.find((v) => v.name === value.desa)?.kelompok ?? [],
    [desaList, value.desa],
  )

  const orphan = (current: string, names: string[]) => current !== '' && !names.includes(current)

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={t('wilayah.daerah')} htmlFor="wp_daerah">
        <select
          id="wp_daerah"
          className={selectCls}
          value={value.daerah}
          onChange={(e) => onChange({ daerah: e.target.value, desa: '', kelompok: '' })}
        >
          <option value="">—</option>
          {orphan(value.daerah, daerahList.map((d) => d.name)) ? <option value={value.daerah}>{value.daerah}</option> : null}
          {daerahList.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('wilayah.desa')} htmlFor="wp_desa">
        <select
          id="wp_desa"
          className={selectCls}
          value={value.desa}
          disabled={!value.daerah}
          onChange={(e) => onChange({ daerah: value.daerah, desa: e.target.value, kelompok: '' })}
        >
          <option value="">—</option>
          {orphan(value.desa, desaList.map((v) => v.name)) ? <option value={value.desa}>{value.desa}</option> : null}
          {desaList.map((v) => (
            <option key={v.id} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('wilayah.kelompok')} htmlFor="wp_kelompok">
        <select
          id="wp_kelompok"
          className={selectCls}
          value={value.kelompok}
          disabled={!value.desa}
          onChange={(e) => onChange({ daerah: value.daerah, desa: value.desa, kelompok: e.target.value })}
        >
          <option value="">—</option>
          {orphan(value.kelompok, kelompokList.map((k) => k.name)) ? (
            <option value={value.kelompok}>{value.kelompok}</option>
          ) : null}
          {kelompokList.map((k) => (
            <option key={k.id} value={k.name}>
              {k.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}
