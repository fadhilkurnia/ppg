import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'

import { endSesi, updateSesi, type Sesi } from '@/api/sesi'
import {
  addRencanaItems,
  addRencanaLibraryItem,
  ensureRencana,
  getRencana,
  listRencana,
} from '@/api/rencana'
import { listMateriAjar, type MateriAjar } from '@/api/kurikulum'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import {
  KurikulumMultiPickerDialog,
  MateriSourcePicker,
  emptyMateriSourceValue,
  type MateriSourceValue,
} from '@/components/MateriSourcePicker'
import { useToast } from '@/lib/toast'

/**
 * SesiEndDialog — opens when guru clicks "Stop" on an ongoing sesi.
 * Two-step flow:
 *   1. Confirm actual mulai / selesai times (pre-filled from recorded
 *      timestamps; user can adjust).
 *   2. Pick materi yang diajarkan during the sesi — multi-pick from the
 *      kelas's monthly rencana, plus an option to add an off-plan library
 *      item (which gets auto-added to the rencana as "selesai").
 * On Save: calls endSesi + updateSesi to commit times + materiAjarIDs,
 * then walks through the rencana to mark every picked materi as selesai.
 */
export function SesiEndDialog({
  sesi,
  onClose,
  onSaved,
}: {
  sesi: Sesi
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()

  // Pre-fill mulai/selesai from the sesi (recorded or planned).
  const recordedStart = useMemo(() => extractTime(sesi.startedAt) || sesi.mulai || '', [sesi])
  const recordedEnd = useMemo(
    () => extractTime(sesi.endedAt) || extractTime(new Date().toISOString()) || sesi.selesai || '',
    [sesi],
  )
  const [mulai, setMulai] = useState(recordedStart)
  const [selesai, setSelesai] = useState(recordedEnd)
  // Duration in minutes — kept in sync with mulai/selesai. Treated as the
  // "anchor": editing mulai or selesai recomputes durasi; editing durasi
  // shifts selesai (mulai stays put).
  const [durasi, setDurasi] = useState<string>(() =>
    String(durationMin(recordedStart, recordedEnd) ?? ''),
  )

  // Helpers — bi-directional sync between (mulai, selesai, durasi).
  const onChangeMulai = (v: string) => {
    setMulai(v)
    const d = durationMin(v, selesai)
    if (d != null) setDurasi(String(d))
  }
  const onChangeSelesai = (v: string) => {
    setSelesai(v)
    const d = durationMin(mulai, v)
    if (d != null) setDurasi(String(d))
  }
  const onChangeDurasi = (v: string) => {
    const cleaned = v.replace(/[^0-9]/g, '')
    setDurasi(cleaned)
    const n = Number(cleaned)
    if (Number.isFinite(n) && n >= 0 && mulai) {
      setSelesai(shiftTime(mulai, n))
    }
  }

  const tahun = Number(sesi.tanggal.slice(0, 4))
  const bulan = Number(sesi.tanggal.slice(5, 7))

  // Load the kelas's monthly rencana so we can offer its materi as
  // checkboxes for the "what was taught" step. listRencana only returns
  // the rencana row (no items), so we follow up with getRencana(id) which
  // hydrates `items` (the materi already in the plan).
  const { data: rencanaList = [] } = useQuery({
    queryKey: ['rencana', sesi.kelasId, tahun, bulan],
    queryFn: () =>
      listRencana({ kelasId: sesi.kelasId ?? undefined, tahun, bulan }),
    enabled: Boolean(sesi.kelasId),
  })
  const rencanaStub = rencanaList[0] ?? null
  const { data: rencana = null } = useQuery({
    queryKey: ['rencana-full', rencanaStub?.id],
    queryFn: () => (rencanaStub ? getRencana(rencanaStub.id) : null),
    enabled: Boolean(rencanaStub?.id),
  })

  // Fetch the kurikulum catalog so chips of picked materi can render with
  // human-readable detail.
  const { data: catalog = [] } = useQuery({
    queryKey: ['materi-ajar', { tingkat: sesi.tingkat ?? '' }],
    queryFn: () => listMateriAjar({ tingkat: sesi.tingkat ?? undefined }),
    staleTime: 60_000,
  })
  const byId = useMemo(() => new Map(catalog.map((m) => [m.id, m])), [catalog])

  // Materi already on the sesi (carry over) + manual pick state. Stored as
  // a Set so toggles are O(1).
  const [pickedMateri, setPickedMateri] = useState<Set<string>>(
    () => new Set([...(sesi.materiAjarIds ?? []), sesi.materiAjarId ?? '']
      .filter((x): x is string => Boolean(x))),
  )
  // Off-plan library items the user explicitly added during this dialog.
  // Each is { kind, aspect, ref, label } — only ref matters for save.
  const [extraLibrary, setExtraLibrary] = useState<MateriSourceValue[]>([])
  const [pickingLibrary, setPickingLibrary] = useState(false)
  const [pickingKurikulum, setPickingKurikulum] = useState(false)

  const toggleMateri = (id: string) => {
    setPickedMateri((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Build list of materi to display in the "from rencana ajar" group.
  // Includes everything in this month's rencana (selesai or not) — guru
  // ticks which were actually taught.
  const rencanaMateri = useMemo(() => {
    const items = rencana?.items ?? []
    return items
      .map((it) => (it.materiAjarId ? byId.get(it.materiAjarId) : null))
      .filter((m): m is MateriAjar => Boolean(m))
  }, [rencana, byId])

  // Materi picked but NOT in the current rencana — these will be added to
  // the rencana on save (as "selesai diajarkan").
  const offPlanMateri = useMemo(() => {
    const inPlan = new Set(rencanaMateri.map((m) => m.id))
    return [...pickedMateri].filter((id) => !inPlan.has(id))
  }, [rencanaMateri, pickedMateri])

  const mutSave = useMutation({
    mutationFn: async () => {
      // 1. End the sesi (sets ended_at).
      const ended = await endSesi(sesi.id)
      // 2. Update mulai/selesai/materiAjarIds. Topik stays.
      await updateSesi(sesi.id, {
        tanggal: ended.tanggal,
        mulai: mulai || null,
        selesai: selesai || null,
        topik: ended.topik,
        catatan: ended.catatan,
        tingkat: ended.tingkat,
        materiAjarId: [...pickedMateri][0] ?? null,
        materiAjarIds: [...pickedMateri],
        kelasId: ended.kelasId,
        libraryKind: ended.libraryKind,
        libraryAspect: ended.libraryAspect,
        libraryRef: ended.libraryRef,
      })
      // 3. Ensure rencana exists & add the off-plan picks to it.
      if (sesi.kelasId && offPlanMateri.length > 0) {
        let id = rencana?.id
        if (!id) {
          const r = await ensureRencana({ kelasId: sesi.kelasId, tahun, bulan })
          id = r.id
        }
        await addRencanaItems(id, offPlanMateri)
      }
      // 4. Library extras → push to rencana too.
      if (sesi.kelasId && extraLibrary.length > 0) {
        let id = rencana?.id
        if (!id) {
          const r = await ensureRencana({ kelasId: sesi.kelasId, tahun, bulan })
          id = r.id
        }
        for (const v of extraLibrary) {
          if (v.libraryKind === 'kurikulum' || !v.libraryRef) continue
          await addRencanaLibraryItem(id, {
            libraryKind: v.libraryKind,
            libraryAspect: v.libraryAspect ?? undefined,
            libraryRef: v.libraryRef,
          })
        }
      }
      return ended
    },
    onSuccess: () => {
      toast(t('sesiDialog.end.savedToast'), 'success')
      qc.invalidateQueries({ queryKey: ['sesi'] })
      qc.invalidateQueries({ queryKey: ['kelas-sesi'] })
      qc.invalidateQueries({ queryKey: ['rencana'] })
      qc.invalidateQueries({ queryKey: ['rencana-full'] })
      onSaved()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('sesiDialog.end.saveFailed'), 'error'),
  })

  return (
    <Dialog title={t('sesiDialog.end.title')} onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {t('sesiDialog.end.intro')}
        </p>

        {/* Step 1: time + durasi. Editing mulai/selesai updates durasi;
            editing durasi shifts selesai (mulai stays). */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('sesiDialog.end.waktuAktual')}
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Field label={t('sesiDialog.end.mulaiLabel')} htmlFor="end-mulai">
              <Input
                id="end-mulai"
                type="time"
                value={mulai}
                onChange={(e) => onChangeMulai(e.target.value)}
              />
            </Field>
            <Field label={t('sesiDialog.end.selesaiLabel')} htmlFor="end-selesai">
              <Input
                id="end-selesai"
                type="time"
                value={selesai}
                onChange={(e) => onChangeSelesai(e.target.value)}
              />
            </Field>
            <Field label={t('sesiDialog.end.durasiLabel')} htmlFor="end-durasi">
              <Input
                id="end-durasi"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={durasi}
                onChange={(e) => onChangeDurasi(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
        </div>

        {/* Step 2: materi */}
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('sesiDialog.end.materiHeading')}
              </div>
              <p className="text-xs text-slate-500">
                {t('sesiDialog.end.materiHint')}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="secondary" onClick={() => setPickingLibrary(true)}>
                <Plus size={14} className="mr-1" /> {t('sesiDialog.end.btnLibrary')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setPickingKurikulum(true)}>
                <Plus size={14} className="mr-1" /> {t('sesiDialog.end.btnKurikulum')}
              </Button>
            </div>
          </div>

          {rencanaMateri.length === 0 ? (
            <p className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {t('sesiDialog.end.rencanaEmpty')}
            </p>
          ) : (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {rencanaMateri.map((m) => {
                const checked = pickedMateri.has(m.id)
                return (
                  <li key={m.id}>
                    <label
                      className={
                        'flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm transition ' +
                        (checked ? 'bg-sky-50' : 'hover:bg-slate-50')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMateri(m.id)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-slate-500">
                          {m.tema} · {m.subTema}
                        </div>
                        <div>{m.detailMateri}</div>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          {extraLibrary.length > 0 ? (
            <div className="mt-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('sesiDialog.end.libraryExtraHeading')}</div>
              {extraLibrary.map((v, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase text-sky-700">
                      {v.libraryKind}
                      {v.libraryAspect ? ` · ${v.libraryAspect}` : ''}
                    </div>
                    <div className="break-words text-sm">{v.libraryRef}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExtraLibrary((cur) => cur.filter((_, j) => j !== i))}
                    className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label={t('sesiDialog.end.removeAria')}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose} disabled={mutSave.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => mutSave.mutate()} disabled={mutSave.isPending}>
            {mutSave.isPending ? t('common.saving') : t('sesiDialog.end.saveBtn')}
          </Button>
        </div>
      </div>

      {pickingLibrary ? (
        <LibraryAddDialog
          onSave={(v) => {
            setExtraLibrary((cur) => [...cur, v])
            setPickingLibrary(false)
          }}
          onClose={() => setPickingLibrary(false)}
        />
      ) : null}

      {pickingKurikulum ? (
        <KurikulumMultiPickerDialog
          tingkat={sesi.tingkat ?? ''}
          picked={pickedMateri}
          onCommit={(ids) => {
            setPickedMateri(new Set(ids))
            setPickingKurikulum(false)
          }}
          onClose={() => setPickingKurikulum(false)}
        />
      ) : null}
    </Dialog>
  )
}

// Helper — diff between two HH:MM times in minutes (selesai - mulai).
// Negative if reversed. Null if either is unparseable.
function durationMin(start: string, end: string): number | null {
  const a = parseTime(start)
  const b = parseTime(end)
  if (a == null || b == null) return null
  return b - a
}

function parseTime(v: string): number | null {
  if (!v) return null
  const m = v.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  return h * 60 + min
}

function shiftTime(start: string, deltaMin: number): string {
  const a = parseTime(start)
  if (a == null) return start
  const t = (a + deltaMin) % (24 * 60)
  const norm = t < 0 ? t + 24 * 60 : t
  const h = Math.floor(norm / 60)
  const m = norm % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Helper — pulls "HH:MM" from an ISO timestamp (or returns empty).
function extractTime(iso?: string | null): string {
  if (!iso) return ''
  const m = iso.match(/T(\d{2}):(\d{2})/)
  if (!m) return ''
  // Best-effort: convert UTC → local HH:MM.
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return `${m[1]}:${m[2]}`
    const h = d.getHours()
    const mm = d.getMinutes()
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  } catch {
    return `${m[1]}:${m[2]}`
  }
}

function LibraryAddDialog({
  onSave,
  onClose,
}: {
  onSave: (v: MateriSourceValue) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState<MateriSourceValue>(() => {
    const v = emptyMateriSourceValue()
    v.libraryKind = 'quran'
    v.libraryAspect = 'reciting'
    return v
  })
  const ready = value.libraryKind !== 'kurikulum' && (value.libraryRef ?? '').trim() !== ''
  return (
    <Dialog title={t('sesiDialog.end.libDialogTitle')} onClose={onClose} size="lg">
      <div className="space-y-4">
        <MateriSourcePicker
          value={value}
          onChange={setValue}
          hideKinds={['kurikulum']}
        />
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => onSave(value)} disabled={!ready}>
            {t('sesiDialog.end.libDialogAdd')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
