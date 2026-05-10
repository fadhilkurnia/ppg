import { useNavigate } from '@tanstack/react-router'
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet'

import type { Bucket } from '@/api/stats'
import { type StudentKelompok } from '@/api/types'

const KELOMPOK_COORDS: Record<StudentKelompok, LatLngTuple> = {
  California: [34.0522, -118.2437],     // Los Angeles
  Chicago: [41.8781, -87.6298],         // Chicago
  'New Hampshire': [43.2081, -71.5376], // Concord
  Canada: [43.6532, -79.3832],          // Toronto
}

// Initial frame that comfortably contains all four markers.
const INITIAL_BOUNDS: LatLngBoundsExpression = [
  [33, -120],
  [45, -70],
]

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export function StudentLocationMap({ buckets }: { buckets: Bucket[] }) {
  const navigate = useNavigate()
  const placed = buckets
    .filter(
      (b): b is Bucket & { label: StudentKelompok } =>
        b.count > 0 && (b.label as StudentKelompok) in KELOMPOK_COORDS,
    )

  const max = placed.reduce((acc, b) => Math.max(acc, b.count), 1)

  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <MapContainer
        bounds={INITIAL_BOUNDS}
        boundsOptions={{ padding: [40, 40] }}
        scrollWheelZoom={false}
        style={{ height: 320, width: '100%' }}
      >
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
        {placed.map((b) => {
          const center = KELOMPOK_COORDS[b.label]
          // 8px floor, scale up to ~28px for the largest bucket
          const radius = 8 + (b.count / max) * 20
          return (
            <CircleMarker
              key={b.label}
              center={center}
              radius={radius}
              pathOptions={{
                color: '#0f172a',
                weight: 1.5,
                fillColor: '#0f172a',
                fillOpacity: 0.6,
              }}
              eventHandlers={{
                click: () =>
                  void navigate({
                    to: '/students',
                    search: { kelompok: b.label, page: 1 },
                  }),
              }}
            >
              <Tooltip direction="top" offset={[0, -radius]} opacity={1} permanent>
                <span className="text-xs">
                  <strong>{b.label}</strong> · {b.count}
                </span>
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>
      <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Klik tanda lingkaran untuk membuka daftar Generus pada kelompok tersebut.
      </p>
    </div>
  )
}
