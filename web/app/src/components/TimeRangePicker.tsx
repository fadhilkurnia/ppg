import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'

import { cn } from '@/lib/cn'
import { DEFAULT_TIMEZONE, timezoneGroups, timezoneLabel } from '@/lib/timezones'

/**
 * Material 3 dial time picker for a range (Start → End).
 *
 * Layout:
 *  - Timezone selector on top (defaults to user profile timezone).
 *  - Two segmented time chips ("Start", "End"). Tap one to make it active —
 *    the dial below edits the active chip.
 *  - Hour/Minute toggle under the chips. AM/PM toggle on the side.
 *  - Single circular dial: drag the knob (or tap a number) to change the
 *    current value. After picking an hour, auto-advances to minutes; after
 *    minutes, auto-advances Start → End.
 *  - navigator.vibrate(3) fires whenever the snapped value changes, giving
 *    a soft haptic tick on touch devices.
 *
 * Time values are kept as 24h "HH:MM" strings (empty = unset).
 */
type Time = string // "HH:MM" or ""

type Slot = 'start' | 'end'
type Unit = 'hour' | 'min'

export function TimeRangePicker({
  start,
  end,
  timezone,
  onStartChange,
  onEndChange,
  onTimezoneChange,
  disabled,
}: {
  start: Time
  end: Time
  timezone: string
  onStartChange: (v: Time) => void
  onEndChange: (v: Time) => void
  onTimezoneChange: (v: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const tzId = useId()
  // Derive a working state — defaults if the slot is empty.
  const startBits = parseOrDefault(start, 9, 0)
  const endBits = parseOrDefault(end, 10, 0)
  const [activeSlot, setActiveSlot] = useState<Slot>('start')
  const [unit, setUnit] = useState<Unit>('hour')

  const active = activeSlot === 'start' ? startBits : endBits
  const setActive = (next: { h: number; m: number; period: 'AM' | 'PM' }) => {
    const h24 = to24(next.h, next.period)
    const s = `${pad2(h24)}:${pad2(next.m)}`
    if (activeSlot === 'start') onStartChange(s)
    else onEndChange(s)
  }

  // When the user finishes minutes for Start, auto-jump to End hours.
  const handleCommitFromDial = (val: number) => {
    if (unit === 'hour') {
      const period = active.period
      setActive({ h: val === 0 ? 12 : val, m: active.m, period })
      setUnit('min')
    } else {
      setActive({ h: active.h, m: val, period: active.period })
      // Auto-advance: start min → end hour
      if (activeSlot === 'start') {
        setActiveSlot('end')
        setUnit('hour')
      }
    }
  }

  const handlePeriodToggle = (p: 'AM' | 'PM') => {
    setActive({ h: active.h, m: active.m, period: p })
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      {/* Timezone */}
      <div className="mb-3 flex flex-col gap-1">
        <label htmlFor={tzId} className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {t('timePicker.range.timezone')}
        </label>
        <select
          id={tzId}
          value={timezone || DEFAULT_TIMEZONE}
          onChange={(e) => onTimezoneChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed"
        >
          {timezoneGroups().map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                  {tz.hint ? ` · ${tz.hint}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-[11px] text-slate-500">{timezoneLabel(timezone || DEFAULT_TIMEZONE)}</p>
      </div>

      {/* Start / End chips */}
      <div className="mb-3 flex items-end justify-center gap-3">
        <TimeChip
          label={t('timePicker.range.start')}
          h={startBits.h}
          m={startBits.m}
          period={startBits.period}
          active={activeSlot === 'start'}
          activeUnit={activeSlot === 'start' ? unit : null}
          onSelectUnit={(u) => {
            setActiveSlot('start')
            setUnit(u)
          }}
        />
        <ArrowRight size={20} className="mb-7 flex-shrink-0 text-slate-400" aria-hidden="true" />
        <TimeChip
          label={t('timePicker.range.end')}
          h={endBits.h}
          m={endBits.m}
          period={endBits.period}
          active={activeSlot === 'end'}
          activeUnit={activeSlot === 'end' ? unit : null}
          onSelectUnit={(u) => {
            setActiveSlot('end')
            setUnit(u)
          }}
        />
      </div>

      {/* Dial */}
      <div className="flex flex-col items-center">
        <Dial
          unit={unit}
          value={unit === 'hour' ? active.h : active.m}
          period={active.period}
          onChange={(val) => {
            // Snap-time update (continuous as user drags). Keep current
            // slot/period, replace the part being edited.
            if (unit === 'hour') {
              const hh = val === 0 ? 12 : val
              setActive({ h: hh, m: active.m, period: active.period })
            } else {
              setActive({ h: active.h, m: val, period: active.period })
            }
          }}
          onCommit={handleCommitFromDial}
        />

        {/* AM/PM toggle */}
        <div className="mt-3 inline-flex overflow-hidden rounded-full border border-slate-300 shadow-sm">
          {(['AM', 'PM'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handlePeriodToggle(p)}
              className={cn(
                'px-4 py-1.5 text-xs font-semibold tracking-wider transition',
                active.period === p
                  ? 'bg-sky-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TimeChip({
  label,
  h,
  m,
  period,
  active,
  activeUnit,
  onSelectUnit,
}: {
  label: string
  h: number
  m: number
  period: 'AM' | 'PM'
  active: boolean
  activeUnit: Unit | null
  onSelectUnit: (u: Unit) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-lg border bg-slate-50 text-4xl font-light tracking-tight transition',
          active ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-300',
        )}
      >
        <button
          type="button"
          onClick={() => onSelectUnit('hour')}
          className={cn(
            'w-16 px-2 py-2 tabular-nums transition sm:w-20',
            activeUnit === 'hour'
              ? 'bg-sky-600 text-white'
              : 'text-slate-900 hover:bg-slate-100',
          )}
          aria-label={t('timePicker.range.ariaHour', { label })}
        >
          {pad2(h)}
        </button>
        <span className="self-center px-1 text-slate-400">:</span>
        <button
          type="button"
          onClick={() => onSelectUnit('min')}
          className={cn(
            'w-16 px-2 py-2 tabular-nums transition sm:w-20',
            activeUnit === 'min'
              ? 'bg-sky-600 text-white'
              : 'text-slate-900 hover:bg-slate-100',
          )}
          aria-label={t('timePicker.range.ariaMinute', { label })}
        >
          {pad2(m)}
        </button>
      </div>
      <span className="text-[10px] text-slate-400">{period}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------

const DIAL_SIZE = 260
const DIAL_RADIUS = 110
const TICK_RADIUS = 90 // distance from center to number label
const KNOB_RADIUS = 18

function Dial({
  unit,
  value,
  period: _period,
  onChange,
  onCommit,
}: {
  unit: Unit
  value: number // 1-12 for hour, 0-59 for minute
  period: 'AM' | 'PM'
  onChange: (val: number) => void
  onCommit: (val: number) => void
}) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const lastSnap = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  // Labels around the dial. Hours: 12 at top, then 1..11 clockwise.
  // Minutes: 00 at top, then 5,10,...,55 clockwise.
  const labels = useMemo(() => {
    if (unit === 'hour') {
      return Array.from({ length: 12 }, (_, i) => ({
        value: i === 0 ? 12 : i,
        angleDeg: i * 30, // 0=top, clockwise
        text: String(i === 0 ? 12 : i),
      }))
    }
    return Array.from({ length: 12 }, (_, i) => ({
      value: i * 5,
      angleDeg: i * 30,
      text: pad2(i * 5),
    }))
  }, [unit])

  // Current knob angle from value.
  const currentAngle = useMemo(() => {
    if (unit === 'hour') {
      const h = value === 12 ? 0 : value // 12 -> 0 at top
      return h * 30
    }
    return value * 6 // 60 min × 6 deg = 360
  }, [unit, value])

  // angleFromPointer: clamp to dial geometry, return degrees clockwise from top.
  const angleFromPointer = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    // atan2 returns counter-clockwise from +x. Convert to clockwise from top.
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
        /* ignore — older Safari throws on unknown gesture */
      }
    }
  }

  // Pointer interaction: pointerdown starts the drag; pointermove updates;
  // pointerup commits + auto-advance.
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    setDragging(true)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const deg = angleFromPointer(e.clientX, e.clientY)
    if (deg == null) return
    const v = snapFromAngle(deg)
    lastSnap.current = v
    onChange(v)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return
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
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    const v = lastSnap.current ?? value
    triggerHaptic()
    onCommit(v)
    lastSnap.current = null
  }

  // Direct tap on a number label.
  const onLabelClick = (v: number) => {
    triggerHaptic()
    onChange(v === 12 ? 12 : v)
    onCommit(v)
  }

  // Knob coordinates from current angle.
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
      style={{ cursor: dragging ? 'grabbing' : 'pointer' }}
    >
      {/* Dial face */}
      <circle cx={DIAL_SIZE / 2} cy={DIAL_SIZE / 2} r={DIAL_RADIUS} fill="#f1f5f9" />

      {/* Spoke from center to knob */}
      <line
        x1={DIAL_SIZE / 2}
        y1={DIAL_SIZE / 2}
        x2={knob.x}
        y2={knob.y}
        stroke="#0284c7"
        strokeWidth={2}
      />

      {/* Center dot */}
      <circle cx={DIAL_SIZE / 2} cy={DIAL_SIZE / 2} r={4} fill="#0284c7" />

      {/* Knob */}
      <circle
        cx={knob.x}
        cy={knob.y}
        r={KNOB_RADIUS}
        fill="#0284c7"
        opacity={dragging ? 0.85 : 1}
      />

      {/* Tick labels */}
      {labels.map((lbl) => {
        const rad = ((lbl.angleDeg - 90) * Math.PI) / 180
        const x = DIAL_SIZE / 2 + TICK_RADIUS * Math.cos(rad)
        const y = DIAL_SIZE / 2 + TICK_RADIUS * Math.sin(rad)
        const isCurrent =
          (unit === 'hour' && lbl.value === value) ||
          (unit === 'min' && lbl.value === value)
        return (
          <g
            key={lbl.angleDeg}
            onPointerDown={(e) => {
              // Stop the drag from also processing — direct tap path.
              e.stopPropagation()
              onLabelClick(lbl.value)
            }}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={x} cy={y} r={16} fill="transparent" />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={14}
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

function parseOrDefault(v: Time, defH24: number, defM: number) {
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

