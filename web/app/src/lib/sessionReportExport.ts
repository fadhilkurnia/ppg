import html2pdf from 'html2pdf.js'
import type { Student } from '@/api/students'
import type { Attendance } from '@/api/types'
import type { AttendanceStats } from '@/api/stats'
import { PPG_LOGO_BASE64 } from '@/lib/logoData'

export interface SessionReportExportParams {
  student: Student | null
  teacherName?: string
  dateFrom: string
  dateTo: string
  sessions: Attendance[]
  stats?: AttendanceStats | null
}

const MONTHS_INDO = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const MONTHS_SHORT_INDO = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

function formatDateIndo(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return `${d.getDate()} ${MONTHS_INDO[d.getMonth()]} ${d.getFullYear()}`
  } catch {
    return dateStr
  }
}

function formatStackedDate(d: Date): string {
  const day = d.getDate()
  const m = MONTHS_SHORT_INDO[d.getMonth()] || ''
  const y = String(d.getFullYear()).slice(2)
  return `${day} ${m} ${y}`
}

function toISODate(d: Date): string {
  const yr = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${yr}-${mo}-${da}`
}

interface ChartBucket {
  startISO: string
  endISO: string
  startLabel: string
  endLabel: string
  hadir: number
  byVn: number
  izin: number
  sessions: number
  hours: number
}

/**
 * Builds weekly buckets (if range <= 45 days) or monthly buckets (if range > 45 days),
 * with stacked date range labels:
 * 17 Sep 26
 *    -
 * 24 Sep 26
 */
function renderSvgReportChart(
  dateFrom: string,
  dateTo: string,
  sessions: Attendance[],
): { svg: string; title: string; subtitle: string } {
  let dFrom = new Date(dateFrom)
  let dTo = new Date(dateTo)
  if (isNaN(dFrom.getTime())) dFrom = new Date()
  if (isNaN(dTo.getTime())) dTo = new Date(dFrom)
  if (dFrom > dTo) {
    const temp = dFrom
    dFrom = dTo
    dTo = temp
  }

  const diffTime = Math.abs(dTo.getTime() - dFrom.getTime())
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1
  const isWeekly = diffDays <= 45

  const buckets: ChartBucket[] = []

  if (isWeekly) {
    let cur = new Date(dFrom.getFullYear(), dFrom.getMonth(), dFrom.getDate())
    const targetEnd = new Date(dTo.getFullYear(), dTo.getMonth(), dTo.getDate())

    while (cur <= targetEnd) {
      const wEnd = new Date(cur)
      wEnd.setDate(wEnd.getDate() + 6)
      if (wEnd > targetEnd) {
        wEnd.setTime(targetEnd.getTime())
      }
      buckets.push({
        startISO: toISODate(cur),
        endISO: toISODate(wEnd),
        startLabel: formatStackedDate(cur),
        endLabel: formatStackedDate(wEnd),
        hadir: 0,
        byVn: 0,
        izin: 0,
        sessions: 0,
        hours: 0,
      })
      cur = new Date(wEnd)
      cur.setDate(cur.getDate() + 1)
    }
  } else {
    // Monthly buckets for semester (6-month) or yearly ranges
    let curY = dFrom.getFullYear()
    let curM = dFrom.getMonth()
    const endY = dTo.getFullYear()
    const endM = dTo.getMonth()

    while (curY < endY || (curY === endY && curM <= endM)) {
      const mStart = new Date(curY, curM, 1)
      const mEnd = new Date(curY, curM + 1, 0)
      const actStart = mStart < dFrom ? dFrom : mStart
      const actEnd = mEnd > dTo ? dTo : mEnd

      buckets.push({
        startISO: toISODate(actStart),
        endISO: toISODate(actEnd),
        startLabel: formatStackedDate(actStart),
        endLabel: formatStackedDate(actEnd),
        hadir: 0,
        byVn: 0,
        izin: 0,
        sessions: 0,
        hours: 0,
      })

      curM++
      if (curM > 11) {
        curM = 0
        curY++
      }
    }
  }

  // Aggregate session counts into the appropriate buckets
  for (const s of sessions) {
    if (!s.date) continue
    const sDate = s.date.replace(/T00:00:00.*$/, '').replace(/ 00:00:00.*$/, '').slice(0, 10)
    for (const b of buckets) {
      if (sDate >= b.startISO && sDate <= b.endISO) {
        if (s.status === 'hadir') {
          b.hadir += 1
        } else if (s.status === 'by_vn') {
          b.byVn += 1
        } else if (s.status === 'izin_murid' || s.status === 'izin_guru') {
          b.izin += 1
        } else {
          b.hadir += 1
        }
        b.sessions += 1
        b.hours += (s.durationMin || 0) / 60
        break
      }
    }
  }

  const title = isWeekly ? 'Grafik Tren Aktivitas Sesi Mingguan' : 'Grafik Tren Aktivitas Sesi Bulanan'
  const subtitle = isWeekly ? 'Per Minggu (7 Hari)' : 'Per Bulan'

  if (buckets.length === 0) {
    return {
      title,
      subtitle,
      svg: `
        <div style="height: 120px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; font-size: 11px; color: #64748b;">
          Belum ada data sesi pada rentang periode yang dipilih
        </div>
      `,
    }
  }

  const svgWidth = 708
  const svgHeight = 180
  const padLeft = 32
  const padRight = 16
  const padTop = 24
  const padBottom = 48

  const plotWidth = svgWidth - padLeft - padRight
  const plotHeight = svgHeight - padTop - padBottom

  const maxVal = Math.max(...buckets.map((b) => b.sessions), 0)
  let upper = maxVal === 0 ? 4 : Math.ceil(maxVal * 1.25)
  if (upper < 4) upper = 4
  const step = Math.ceil(upper / 4)
  const finalMax = step * 4
  const ticks = [0, step, step * 2, step * 3, finalMax]

  const n = buckets.length
  const colStep = plotWidth / Math.max(n, 1)

  // Y-axis grid lines and labels
  let gridLinesHtml = ''
  for (const tick of ticks) {
    const y = padTop + plotHeight - (tick / finalMax) * plotHeight
    gridLinesHtml += `
      <line x1="${padLeft}" y1="${y}" x2="${svgWidth - padRight}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
      <text x="${padLeft - 6}" y="${y + 3}" fill="#64748b" font-size="8.5" font-family="sans-serif" text-anchor="end">${tick}</text>
    `
  }

  // Stacked Bars (Hadir green, VN blue, Izin amber)
  let barsHtml = ''
  let xLabelsHtml = ''

  const labelFontSize = buckets.length > 14 ? 6 : (buckets.length > 8 ? 6.8 : 7.5)
  const dyStep = Math.round(labelFontSize * 1.15 * 10) / 10

  buckets.forEach((b, i) => {
    const xCenter = padLeft + i * colStep + colStep / 2
    const barW = Math.min(Math.max(colStep * 0.46, 14), 38)
    const barX = xCenter - barW / 2

    const hadirH = finalMax === 0 ? 0 : (b.hadir / finalMax) * plotHeight
    const vnH = finalMax === 0 ? 0 : (b.byVn / finalMax) * plotHeight
    const izinH = finalMax === 0 ? 0 : (b.izin / finalMax) * plotHeight
    const totalH = hadirH + vnH + izinH

    const hadirY = padTop + plotHeight - hadirH
    const vnY = hadirY - vnH
    const izinY = vnY - izinH

    // Bottom segment: Hadir (green)
    if (hadirH > 0) {
      const isTop = vnH === 0 && izinH === 0
      if (isTop) {
        const r = Math.min(2.5, barW / 2, hadirH)
        barsHtml += `
          <path d="M ${barX},${hadirY + hadirH} L ${barX},${hadirY + r} Q ${barX},${hadirY} ${barX + r},${hadirY} L ${barX + barW - r},${hadirY} Q ${barX + barW},${hadirY} ${barX + barW},${hadirY + r} L ${barX + barW},${hadirY + hadirH} Z" fill="#22c55e" />
        `
      } else {
        barsHtml += `
          <rect x="${barX}" y="${hadirY}" width="${barW}" height="${hadirH}" fill="#22c55e" />
        `
      }
    }
    // Middle segment: By VN (blue)
    if (vnH > 0) {
      const isTop = izinH === 0
      if (isTop) {
        const r = Math.min(2.5, barW / 2, vnH)
        barsHtml += `
          <path d="M ${barX},${vnY + vnH} L ${barX},${vnY + r} Q ${barX},${vnY} ${barX + r},${vnY} L ${barX + barW - r},${vnY} Q ${barX + barW},${vnY} ${barX + barW},${vnY + r} L ${barX + barW},${vnY + vnH} Z" fill="#0284c7" />
        `
      } else {
        barsHtml += `
          <rect x="${barX}" y="${vnY}" width="${barW}" height="${vnH}" fill="#0284c7" />
        `
      }
    }
    // Top segment: Izin (amber)
    if (izinH > 0) {
      const r = Math.min(2.5, barW / 2, izinH)
      barsHtml += `
        <path d="M ${barX},${izinY + izinH} L ${barX},${izinY + r} Q ${barX},${izinY} ${barX + r},${izinY} L ${barX + barW - r},${izinY} Q ${barX + barW},${izinY} ${barX + barW},${izinY + r} L ${barX + barW},${izinY + izinH} Z" fill="#f59e0b" />
      `
    }

    // Number label above the bar
    if (b.sessions > 0) {
      barsHtml += `
        <text x="${xCenter}" y="${padTop + plotHeight - totalH - 4}" fill="#1e293b" font-size="8" font-weight="bold" font-family="sans-serif" text-anchor="middle">${b.sessions}</text>
      `
    }

    // Stacked X-axis label with start date, hyphen, end date
    xLabelsHtml += `
      <text x="${xCenter}" y="${padTop + plotHeight + 13}" fill="#475569" font-size="${labelFontSize}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" text-anchor="middle">
        <tspan x="${xCenter}" dy="0">${b.startLabel}</tspan>
        <tspan x="${xCenter}" dy="${dyStep}">-</tspan>
        <tspan x="${xCenter}" dy="${dyStep}">${b.endLabel}</tspan>
      </text>
    `
  })

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="display: block; width: 100%; height: auto;">
      ${gridLinesHtml}
      ${barsHtml}
      ${xLabelsHtml}
      <line x1="${padLeft}" y1="${padTop + plotHeight}" x2="${svgWidth - padRight}" y2="${padTop + plotHeight}" stroke="#cbd5e1" stroke-width="1" />
    </svg>
  `

  return { svg, title, subtitle }
}

function renderSessionTableRow(s: Attendance, idx: number): string {
  let statusCls = 'status-hadir'
  let statusLabel = 'Hadir'
  if (s.status === 'by_vn') {
    statusCls = 'status-vn'
    statusLabel = 'By VN'
  } else if (s.status === 'izin_murid') {
    statusCls = 'status-izin'
    statusLabel = 'Izin (Murid)'
  } else if (s.status === 'izin_guru') {
    statusCls = 'status-izin'
    statusLabel = 'Izin (Guru)'
  }

  const dateFormatted = s.date
    ? s.date.replace(/T00:00:00.*$/, '').replace(/ 00:00:00.*$/, '').slice(0, 10)
    : '-'

  return `
    <tr>
      <td style="width: 26px; color: #94a3b8; font-weight: 600; text-align: center;">${idx + 1}</td>
      <td style="width: 78px; font-weight: 600; color: #0f172a; white-space: nowrap;">${dateFormatted}</td>
      <td style="width: 135px; font-weight: 600; color: #1e293b;">${s.studentName || '-'}</td>
      <td style="width: 55px; color: #64748b; white-space: nowrap;">${s.durationMin ? `${s.durationMin} mnt` : '-'}</td>
      <td style="width: 76px;">
        <span class="status-pill ${statusCls}">${statusLabel}</span>
      </td>
      <td style="color: #475569; font-size: 9px; line-height: 1.35;" class="cell-materi">${s.materi || '<span style="color:#cbd5e1; font-style:italic;">Tidak ada catatan materi</span>'}</td>
    </tr>
  `
}

export function renderSessionReportParts(params: SessionReportExportParams): { css: string; bodyHtml: string } {
  const { student, teacherName, dateFrom, dateTo, sessions, stats } = params

  const totalSessions = stats?.total.sessions ?? sessions.length
  const totalHours = stats?.total.hours
    ? stats.total.hours.toFixed(1)
    : (sessions.reduce((acc, s) => acc + (s.durationMin || 0), 0) / 60).toFixed(1)

  const uniqueStudents = stats?.byStudent?.length ?? new Set(sessions.map((s) => s.studentId)).size

  const hadirCount =
    stats?.byStatus.find((b) => b.label === 'hadir')?.count ??
    sessions.filter((s) => s.status === 'hadir').length
  const byVnCount =
    stats?.byStatus.find((b) => b.label === 'by_vn')?.count ??
    sessions.filter((s) => s.status === 'by_vn').length
  const izinMuridCount =
    stats?.byStatus.find((b) => b.label === 'izin_murid')?.count ??
    sessions.filter((s) => s.status === 'izin_murid').length
  const izinGuruCount =
    stats?.byStatus.find((b) => b.label === 'izin_guru')?.count ??
    sessions.filter((s) => s.status === 'izin_guru').length

  const attendanceRate = totalSessions > 0 ? Math.round((hadirCount / totalSessions) * 100) : 0

  // Prepare monthly data for chart
  const { svg: chartSvg, title: chartTitle } = renderSvgReportChart(dateFrom, dateTo, sessions)
  const todayIndo = formatDateIndo(new Date().toISOString().slice(0, 10))

  // Pagination & Continuation configuration
  // Page 1 contains Header + Meta + Stats + Chart + Table (starts immediately below chart)
  // We allocate 11 rows for Page 1, and 22 rows for each subsequent page.
  const PAGE1_LIMIT = 11
  const SUBSEQUENT_PAGE_LIMIT = 22

  let totalPages = 1
  if (sessions.length > 13) {
    const remaining = sessions.length - PAGE1_LIMIT
    totalPages = 1 + Math.ceil(remaining / SUBSEQUENT_PAGE_LIMIT)
  }

  const css = `
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body, html {
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
    }
    .report-wrapper {
      width: 748px;
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #0f172a !important;
    }
    .pdf-page {
      width: 748px;
      padding: 16px 20px 12px 20px;
      margin: 0;
      background: #ffffff !important;
      box-sizing: border-box;
      position: relative;
    }
    .report-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 12px;
      margin-bottom: 12px;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-logo {
      width: 48px;
      height: 48px;
      object-fit: contain;
    }
    .header-titles h1 {
      margin: 0;
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.2px;
      text-transform: uppercase;
    }
    .header-titles p {
      margin: 2px 0 0;
      font-size: 10px;
      color: #64748b;
      font-weight: 500;
    }
    .header-badge {
      text-align: right;
      flex-shrink: 0;
    }
    .tag, .header-badge .tag {
      display: inline-block;
      padding: 2.5px 14px 4px 14px;
      line-height: 13px;
      height: 19px;
      box-sizing: border-box;
      background: #e0e7ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
      border-radius: 9999px;
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      white-space: nowrap;
      text-align: center;
      vertical-align: middle;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 7px 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 9px;
      padding: 8px 14px 10px 14px;
      margin-bottom: 12px;
    }
    .meta-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 9.5px;
      line-height: 1.25;
    }
    .meta-label {
      color: #64748b;
      width: 95px;
      flex-shrink: 0;
      font-weight: 500;
    }
    .meta-val {
      color: #0f172a;
      font-weight: 600;
      flex: 1;
    }
    .stats-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .stat-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 7px 10px 9px 10px;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.02);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 56px;
      box-sizing: border-box;
    }
    .stat-label {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #64748b;
      line-height: 1;
    }
    .stat-val {
      font-size: 15px;
      font-weight: 900;
      color: #0f172a;
      line-height: 1;
      margin: 1px 0;
    }
    .stat-sub {
      font-size: 8px;
      color: #94a3b8;
      font-weight: normal;
      line-height: 1;
    }
    .section-box {
      border: 1px solid #e2e8f0;
      border-radius: 9px;
      padding: 10px 12px;
      margin-bottom: 12px;
      background: #ffffff;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .status-breakdown {
      display: block;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #f1f5f9;
    }
    .status-pill {
      display: inline-block;
      padding: 1.5px 10px 3.5px 10px;
      line-height: 13px;
      height: 18px;
      box-sizing: border-box;
      border-radius: 5px;
      font-size: 8.5px;
      font-weight: 600;
      white-space: nowrap;
      margin-right: 6px;
      margin-bottom: 2px;
      text-align: center;
      vertical-align: middle;
    }
    .status-hadir { background: #dcfce7; color: #166534; }
    .status-vn { background: #e0f2fe; color: #075985; }
    .status-izin { background: #fef3c7; color: #92400e; }
    .status-sakit { background: #fee2e2; color: #991b1b; }
    table.session-table .status-pill {
      padding: 1px 7px 2.5px 7px;
      font-size: 8px;
      line-height: 11px;
      height: 15px;
      margin: 0;
    }
    
    .table-section {
      border: 1px solid #e2e8f0;
      border-radius: 9px;
      overflow: hidden;
      margin-bottom: 8px;
      background: #ffffff;
    }
    .table-section-header {
      padding: 8px 12px;
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
    }
    table.session-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
      text-align: left;
    }
    table.session-table thead {
      background: #f8fafc;
      border-bottom: 1px solid #cbd5e1;
    }
    table.session-table th {
      padding: 6px 8px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      font-size: 8px;
      letter-spacing: 0.3px;
    }
    table.session-table td {
      padding: 5.5px 8px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
      vertical-align: middle;
    }
    table.session-table tr:nth-child(even) {
      background: #fafafa;
    }
    .cell-materi {
      max-height: 48px;
      overflow: hidden;
    }
    .continuation-bar {
      padding: 7px 12px;
      background: #f8fafc;
      border-top: 1px dashed #cbd5e1;
      text-align: center;
      font-size: 9px;
      font-weight: 600;
      color: #4f46e5;
    }
    .continuation-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .continuation-title {
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
    }
    .continuation-sub {
      font-size: 9px;
      font-weight: 600;
      color: #4f46e5;
      background: #e0e7ff;
      padding: 2.5px 9px;
      border-radius: 9999px;
      margin-left: 8px;
      white-space: nowrap;
    }
    .report-footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 8.5px;
      color: #64748b;
    }
    .report-footer .page-number {
      font-weight: 700;
      color: #1e293b;
    }
    .html2pdf__page-break {
      page-break-before: always;
      break-before: page;
      height: 0;
    }
  `

  // Slice sessions for Page 1
  const page1Sessions = totalPages === 1 ? sessions : sessions.slice(0, PAGE1_LIMIT)
  const page1RowsHtml = page1Sessions.length === 0
    ? `<tr><td colspan="6" style="text-align:center; padding: 18px; color: #94a3b8;">Tidak ada data sesi pada rentang tanggal ini.</td></tr>`
    : page1Sessions.map((s, idx) => renderSessionTableRow(s, idx)).join('')

  // Build Page 1
  let bodyHtml = `
    <div class="report-wrapper">
      <div class="pdf-page page-1">
        <div class="report-header">
          <div class="header-brand">
            <img src="${PPG_LOGO_BASE64}" alt="PPG US Logo" class="header-logo" />
            <div class="header-titles">
              <h1>Laporan Sesi Kegiatan & Kehadiran</h1>
              <p>Portal Pengajar Generus · PPG United States</p>
            </div>
          </div>
          <div class="header-badge">
            <span class="tag">Dokumen Resmi</span>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">Murid / Generus:</span>
            <span class="meta-val">${student ? `${student.name} ${student.kelompok ? `(${student.kelompok})` : ''}` : 'Semua Generus'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Periode Tanggal:</span>
            <span class="meta-val">${formatDateIndo(dateFrom)} – ${formatDateIndo(dateTo)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Pengajar / Guru:</span>
            <span class="meta-val">${teacherName || 'Semua Pengajar'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Tanggal Dicetak:</span>
            <span class="meta-val">${todayIndo}</span>
          </div>
        </div>

        <div class="stats-cards">
          <div class="stat-card">
            <div class="stat-label">Total Sesi</div>
            <div class="stat-val">${totalSessions}</div>
            <div class="stat-sub">Sesi Pembelajaran</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Jam Belajar</div>
            <div class="stat-val">${totalHours} <span style="font-size:10px; font-weight:normal;">Jam</span></div>
            <div class="stat-sub">Akumulasi durasi</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Generus Terlibat</div>
            <div class="stat-val">${uniqueStudents} <span style="font-size:10px; font-weight:normal;">Orang</span></div>
            <div class="stat-sub">Murid yang diajar</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Tingkat Kehadiran</div>
            <div class="stat-val" style="color: #059669;">${attendanceRate}%</div>
            <div class="stat-sub">Hadir tepat waktu</div>
          </div>
        </div>

        <!-- Trend Grafik Sesi (Weekly if <= 45 days, Monthly if > 45 days) -->
        <div class="section-box">
          <div class="section-title">
            <span>${chartTitle}</span>
            <span style="font-size: 9.5px; color: #4f46e5; font-weight: 600;">${totalSessions} Total Sesi</span>
          </div>
          ${chartSvg}
          <div class="status-breakdown">
            <span class="status-pill status-hadir">● Hadir : ${hadirCount} sesi</span>
            <span class="status-pill status-vn">● By VN : ${byVnCount} sesi</span>
            ${izinMuridCount > 0 ? `<span class="status-pill status-izin">● Izin Murid : ${izinMuridCount} sesi</span>` : ''}
            ${izinGuruCount > 0 ? `<span class="status-pill status-izin">● Izin Guru : ${izinGuruCount} sesi</span>` : ''}
          </div>
        </div>

        <!-- Rincian Riwayat Sesi (Starts immediately on Page 1) -->
        <div class="table-section">
          <div class="table-section-header">
            <span class="section-title" style="margin: 0;">Rincian Riwayat Sesi Pembelajaran (${sessions.length})</span>
          </div>
          <table class="session-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Tanggal</th>
                <th>Generus</th>
                <th>Durasi</th>
                <th>Status</th>
                <th>Materi / Catatan Sesi</th>
              </tr>
            </thead>
            <tbody>
              ${page1RowsHtml}
            </tbody>
          </table>
          ${totalPages > 1 ? `<div class="continuation-bar">(Tabel berlanjut ke Halaman 2...)</div>` : ''}
        </div>

        <div class="report-footer">
          <span>Sistem Monitoring Generus PPG United States</span>
          <span>Dicetak pada ${todayIndo}</span>
          <span class="page-number">Halaman 1 dari ${totalPages}</span>
        </div>
      </div>
  `

  // Build Subsequent Pages if multi-page
  if (totalPages > 1) {
    const remainingSessions = sessions.slice(PAGE1_LIMIT)
    for (let p = 2; p <= totalPages; p++) {
      const startIdx = (p - 2) * SUBSEQUENT_PAGE_LIMIT
      const pageSessions = remainingSessions.slice(startIdx, startIdx + SUBSEQUENT_PAGE_LIMIT)
      const baseIdx = PAGE1_LIMIT + startIdx
      const pageRowsHtml = pageSessions.map((s, idx) => renderSessionTableRow(s, baseIdx + idx)).join('')
      const hasNextPage = p < totalPages

      bodyHtml += `
        <div class="html2pdf__page-break"></div>
        <div class="pdf-page page-${p}">
          <div class="continuation-banner">
            <div>
              <span class="continuation-title">Rincian Riwayat Sesi Pembelajaran</span>
              <span class="continuation-sub">Lanjutan tabel dari Halaman ${p - 1}</span>
            </div>
            <span class="tag">Dokumen Resmi</span>
          </div>

          <div class="table-section" style="margin-top: 4px;">
            <table class="session-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Generus</th>
                  <th>Durasi</th>
                  <th>Status</th>
                  <th>Materi / Catatan Sesi</th>
                </tr>
              </thead>
              <tbody>
                ${pageRowsHtml}
              </tbody>
            </table>
            ${hasNextPage ? `<div class="continuation-bar">(Tabel berlanjut ke Halaman ${p + 1}...)</div>` : ''}
          </div>

          <div class="report-footer">
            <span>Sistem Monitoring Generus PPG United States</span>
            <span>Dicetak pada ${todayIndo}</span>
            <span class="page-number">Halaman ${p} dari ${totalPages}</span>
          </div>
        </div>
      `
    }
  }

  bodyHtml += `</div>`

  return { css, bodyHtml }
}

/** Generates and downloads the session report as a clean PDF file */
export async function downloadSessionReportPdf(params: SessionReportExportParams): Promise<void> {
  const { css, bodyHtml } = renderSessionReportParts(params)

  const studentSlug = params.student
    ? (params.student.name || 'murid').replace(/[^a-zA-Z0-9]/g, '_')
    : 'Semua_Murid'
  const filename = `Laporan_Sesi_${studentSlug}_${params.dateFrom}_sd_${params.dateTo}.pdf`

  // Create an in-flow container element for html2pdf.
  // html2pdf automatically wraps this in an offscreen overlay (opacity: 0) during capture,
  // avoiding height: 0 collapse caused by position: fixed and clipping caused by negative z-index.
  const container = document.createElement('div')
  container.id = 'session-report-pdf-render-target'
  container.style.width = '748px'
  container.style.backgroundColor = '#ffffff'
  container.style.color = '#0f172a'
  container.innerHTML = `<style>${css}</style>${bodyHtml}`

  // Give the DOM time to compute layout and fonts before capturing
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready
    } catch {
      // ignore
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 150))

  const opt = {
    margin: [6, 6, 6, 6],
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 748,
      onclone: (clonedDoc: Document) => {
        const h2pContainer = clonedDoc.querySelector('.html2pdf__container') as HTMLElement | null
        if (h2pContainer) {
          h2pContainer.style.margin = '0'
          h2pContainer.style.left = '0'
          h2pContainer.style.right = 'auto'
          h2pContainer.style.width = '748px'
        }
      },
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: 'legacy' },
  }

  // @ts-expect-error html2pdf typings compatibility
  await html2pdf().set(opt).from(container).save()
}

/** Opens browser print preview dialog (allows Save as PDF or printing directly) */
export function printSessionReport(params: SessionReportExportParams): void {
  const { css, bodyHtml } = renderSessionReportParts(params)
  const studentSlug = params.student
    ? (params.student.name || 'murid')
    : 'Semua Murid'
  const title = `Laporan Sesi - ${studentSlug} (${params.dateFrom} s/d ${params.dateTo})`

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    ${css}
    @page {
      size: A4 portrait;
      margin: 6mm 6mm;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`

  const iframe = document.createElement('iframe')
  iframe.id = 'session-report-print-frame'
  iframe.style.position = 'fixed'
  iframe.style.top = '0'
  iframe.style.left = '0'
  iframe.style.width = '794px'
  iframe.style.height = '1000px'
  iframe.style.border = '0'
  iframe.style.opacity = '0.01'
  iframe.style.pointerEvents = 'none'
  iframe.style.zIndex = '-99999'

  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    iframe.remove()
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  let printed = false
  const triggerPrint = () => {
    if (printed) return
    printed = true
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch (err) {
      console.error('Print failed:', err)
    } finally {
      setTimeout(() => {
        iframe.remove()
      }, 2000)
    }
  }

  iframe.onload = () => {
    setTimeout(triggerPrint, 250)
  }
  setTimeout(triggerPrint, 600)
}
