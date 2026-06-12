import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'

import { Dialog } from './Dialog'
import { cn } from '@/lib/cn'

/**
 * TimeDialPopup — a slim popup hosting only the Material 3 dial picker
 * (no timezone selector, no toolbar). Used by sesi form: the user keeps the
 * default plain HH:MM `<input type="time">` fields and only opens the dial
 * by clicking a small clock icon.
 *
 * Live-updates the parent's `start` / `end` values as the user drags the
 * dial, so the underlying inputs preview the picked time instantly. After
 * the user commits the start minute the picker auto-jumps to "end · hour".
 *
 * Slide gestures work on touch from the very first contact: `touch-action:
 * none` is set on the SVG and we call `setPointerCapture` on pointerdown so
 * subsequent pointermove events keep flowing to us instead of triggering
 * page-level scroll/back-swipe.
 */
type Slot = 'start' | 'end'
type Unit = 'hour' | 'min'

export function TimeDialPopup({
  start,
  end,
  onStartChange,
  onEndChange,
  onClose,
  initialSlot = 'start',
}: {
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onClose: () => void
  initialSlot?: Slot
}) {
  const { t } = useTranslation()
  // Working state — defaults if the slot is empty.
  // End defaults to start hour + 1 so it inherits AM/PM (and matches the
  // common pattern of "1-hour sessions").
  const startBits = parseOrDefault(start, 9, 0)
  const endDefH = (startBits.h24 + 1) % 24
  const endBits = parseOrDefault(end, endDefH, startBits.m)
  const [activeSlot, setActiveSlot] = useState<Slot>(initialSlot)
  const [unit, setUnit] = useState<Unit>('hour')

  const active = activeSlot === 'start' ? startBits : endBits

  const setActiveTime = useCallback(
    (next: { h: number; m: number; period: 'AM' | 'PM' }) => {
      const h24 = to24(next.h, next.period)
      const s = `${pad2(h24)}:${pad2(next.m)}`
      if (activeSlot === 'start') onStartChange(s)
      else onEndChange(s)
    },
    [activeSlot, onStartChange, onEndChange],
  )

  // Auto-jump on commit: hour → min within a slot; min(start) → hour(end).
  const handleCommitFromDial = (val: number) => {
    if (unit === 'hour') {
      setActiveTime({ h: val === 0 ? 12 : val, m: active.m, period: active.period })
      setUnit('min')
    } else {
      setActiveTime({ h: active.h, m: val, period: active.period })
      if (activeSlot === 'start') {
        setActiveSlot('end')
        setUnit('hour')
      }
    }
  }

  return (
    <Dialog title={t('timePicker.dial.title')} onClose={onClose} size="sm">
      <div className="flex flex-col items-center gap-3">
        {/* Slot toggle: Mulai / Selesai */}
        <div className="inline-flex w-full overflow-hidden rounded-full border border-slate-300 text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveSlot('start')
              setUnit('hour')
            }}
            className={cn(
              'flex-1 px-3 py-1.5 font-medium transition',
              activeSlot === 'start' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700',
            )}
          >
            {t('timePicker.dial.slotStart', {
              time: `${pad2(startBits.h)}:${pad2(startBits.m)}`,
              period: startBits.period,
            })}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSlot('end')
              setUnit('hour')
            }}
            className={cn(
              'flex-1 px-3 py-1.5 font-medium transition',
              activeSlot === 'end' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700',
            )}
          >
            {t('timePicker.dial.slotEnd', {
              time: `${pad2(endBits.h)}:${pad2(endBits.m)}`,
              period: endBits.period,
            })}
          </button>
        </div>

        {/* Unit toggle: Jam / Menit */}
        <div className="inline-flex overflow-hidden rounded-full border border-slate-300 text-xs">
          <button
            type="button"
            onClick={() => setUnit('hour')}
            className={cn(
              'px-3 py-1 font-medium transition',
              unit === 'hour' ? 'bg-sky-100 text-sky-800' : 'bg-white text-slate-600',
            )}
          >
            {t('timePicker.dial.unitHour')}
          </button>
          <button
            type="button"
            onClick={() => setUnit('min')}
            className={cn(
              'px-3 py-1 font-medium transition',
              unit === 'min' ? 'bg-sky-100 text-sky-800' : 'bg-white text-slate-600',
            )}
          >
            {t('timePicker.dial.unitMinute')}
          </button>
        </div>

        <Dial
          unit={unit}
          value={unit === 'hour' ? active.h : active.m}
          onChange={(val) => {
            if (unit === 'hour') {
              setActiveTime({ h: val === 0 ? 12 : val, m: active.m, period: active.period })
            } else {
              setActiveTime({ h: active.h, m: val, period: active.period })
            }
          }}
          onCommit={handleCommitFromDial}
        />

        {/* AM/PM toggle */}
        <div className="inline-flex overflow-hidden rounded-full border border-slate-300 text-xs">
          {(['AM', 'PM'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() =>
                setActiveTime({ h: active.h, m: active.m, period: p })
              }
              className={cn(
                'px-4 py-1 font-semibold tracking-wider transition',
                active.period === p ? 'bg-sky-600 text-white' : 'bg-white text-slate-700',
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
        >
          <Check size={14} /> {t('timePicker.dial.done')}
        </button>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------

const DIAL_SIZE = 240
const DIAL_RADIUS = 100
const TICK_RADIUS = 82
const KNOB_RADIUS = 18

function Dial({
  unit,
  value,
  onChange,
  onCommit,
}: {
  unit: Unit
  value: number
  onChange: (val: number) => void
  onCommit: (val: number) => void
}) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const lastSnap = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const labels = useMemo(() => {
    if (unit === 'hour') {
      return Array.from({ length: 12 }, (_, i) => ({
        value: i === 0 ? 12 : i,
        angleDeg: i * 30,
        text: String(i === 0 ? 12 : i),
      }))
    }
    return Array.from({ length: 12 }, (_, i) => ({
      value: i * 5,
      angleDeg: i * 30,
      text: pad2(i * 5),
    }))
  }, [unit])

  const currentAngle = useMemo(() => {
    if (unit === 'hour') {
      const h = value === 12 ? 0 : value
      return h * 30
    }
    return value * 6
  }, [unit, value])

  const angleFromPointer = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    if (deg < 0) deg += 360
    return deg
  }, [])

  const snapFromAngle = useCallback(
    (deg: number): number => {
      if (unit === 'hour') {
        const idx = Math.round(deg / 30) % 12
        return idx === 0 ? 12 : idx
      }
      return Math.round(deg / 6) % 60
    },
    [unit],
  )

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(3)
      } catch {
        /* older Safari throws on unknown gesture */
      }
    }
  }

  // pointerdown: start dragging and immediately commit the touch point so
  // even a tap (single contact) registers. setPointerCapture redirects all
  // subsequent move events to the SVG, fixing the mobile case where a swipe
  // starting on the dial would otherwise be eaten by the popup overlay or
  // page scroll.
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    setDragging(true)
    try {
      ;(e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    const deg = angleFromPointer(e.clientX, e.clientY)
    if (deg == null) return
    const v = snapFromAngle(deg)
    lastSnap.current = v
    onChange(v)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return
    e.preventDefault()
    const deg = angleFromPointer(e.clientX, e.clientY)
    if (deg == null) return
    const v = snapFromAngle(deg)
    if (v !== lastSnap.current) {
      lastSnap.current = v
      triggerHaptic()
      onChange(v)
    }
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return
    setDragging(false)
    try {
      ;(e.currentTarget as SVGSVGElement).releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    const v = lastSnap.current ?? value
    triggerHaptic()
    onCommit(v)
    lastSnap.current = null
  }

  const onLabelTap = (v: number) => {
    triggerHaptic()
    onChange(v)
    onCommit(v)
  }

  const knob = useMemo(() => {
    const rad = ((currentAngle - 90) * Math.PI) / 180
    return {
      x: DIAL_SIZE / 2 + TICK_RADIUS * Math.cos(rad),
      y: DIAL_SIZE / 2 + TICK_RADIUS * Math.sin(rad),
    }
  }, [currentAngle])

  return (
    <svg
      ref={svgRef}
      width={DIAL_SIZE}
      height={DIAL_SIZE}
      viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="slider"
      aria-label={unit === 'hour' ? t('timePicker.dial.ariaPickHour') : t('timePicker.dial.ariaPickMinute')}
      aria-valuemin={unit === 'hour' ? 1 : 0}
      aria-valuemax={unit === 'hour' ? 12 : 59}
      aria-valuenow={value}
      tabIndex={0}
      className="touch-none select-none"
      // touch-action: none is critical for mobile — without it the browser
      // intercepts the first finger gesture as a scroll or back-swipe.
      style={{ cursor: dragging ? 'grabbing' : 'pointer', touchAction: 'none' }}
    >
      <circle cx={DIAL_SIZE / 2} cy={DIAL_SIZE / 2} r={DIAL_RADIUS} fill="#f1f5f9" />
      <line
        x1={DIAL_SIZE / 2}
        y1={DIAL_SIZE / 2}
        x2={knob.x}
        y2={knob.y}
        stroke="#0284c7"
        strokeWidth={2}
      />
      <circle cx={DIAL_SIZE / 2} cy={DIAL_SIZE / 2} r={4} fill="#0284c7" />
      <circle
        cx={knob.x}
        cy={knob.y}
        r={KNOB_RADIUS}
        fill="#0284c7"
        opacity={dragging ? 0.85 : 1}
      />
      {labels.map((lbl) => {
        const rad = ((lbl.angleDeg - 90) * Math.PI) / 180
        const x = DIAL_SIZE / 2 + TICK_RADIUS * Math.cos(rad)
        const y = DIAL_SIZE / 2 + TICK_RADIUS * Math.sin(rad)
        const isCurrent = lbl.value === value
        return (
          <g
            key={lbl.angleDeg}
            onPointerDown={(e) => {
              e.stopPropagation()
              onLabelTap(lbl.value)
            }}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={x} cy={y} r={16} fill="transparent" />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={13}
              fontWeight={500}
              fill={isCurrent ? '#ffffff' : '#0f172a'}
              pointerEvents="none"
            >
              {lbl.text}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

function clamp(n: number, lo: number, hi: number) {
  if (isNaN(n)) return lo
  return Math.min(Math.max(n, lo), hi)
}

function to24(h12: number, period: 'AM' | 'PM') {
  if (h12 === 12) return period === 'AM' ? 0 : 12
  return period === 'AM' ? h12 : h12 + 12
}

function from24(h24: number): { h: number; period: 'AM' | 'PM' } {
  const period: 'AM' | 'PM' = h24 < 12 ? 'AM' : 'PM'
  let h = h24 % 12
  if (h === 0) h = 12
  return { h, period }
}

function parseOrDefault(v: string, defH24: number, defM: number) {
  if (v) {
    const m = v.match(/^(\d{1,2}):(\d{1,2})$/)
    if (m) {
      const h24 = clamp(parseInt(m[1], 10), 0, 23)
      const min = clamp(parseInt(m[2], 10), 0, 59)
      const { h, period } = from24(h24)
      return { h, m: min, period, h24 }
    }
  }
  const { h, period } = from24(defH24)
  return { h, m: defM, period, h24: defH24 }
}
