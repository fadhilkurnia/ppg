import html2pdf from 'html2pdf.js'
import type { Student } from '@/api/students'
import type { MateriAjar } from '@/api/kurikulum'
import type { Pencapaian } from '@/api/pencapaian'
import { ageInYears } from '@/lib/age'
import { formatKelompokTag } from '@/lib/i18n'
import { groupByTemaSub, SEMESTER_MONTHS, formatSubTemaTitle } from '@/lib/tingkat'
import { PPG_LOGO_BASE64 } from '@/lib/logoData'

export const GRADE_RUBRICS_ID = [
  {
    score: 100,
    title: 'Sangat Mahir',
    desc: 'Menunjukkan penguasaan yang luar biasa dan mampu menerapkan konsep melampaui ekspektasi.',
  },
  {
    score: 90,
    title: 'Mahir',
    desc: 'Sangat memahami materi, bekerja dengan teliti, dan konsisten menunjukkan hasil yang optimal.',
  },
  {
    score: 80,
    title: 'Sudah Menguasai',
    desc: 'Sudah memahami materi dengan baik dan mampu menyelesaikan tugas secara mandiri.',
  },
  {
    score: 70,
    title: 'Sedang Berlatih',
    desc: 'Sudah menunjukkan usaha yang baik dan sedang terus berlatih untuk menguatkan pemahaman.',
  },
  {
    score: 60,
    title: 'Mulai Mengenal',
    desc: 'Sedang dalam tahap awal memahami materi dan membutuhkan pendampingan lebih lanjut.',
  },
]

export const GRADE_RUBRICS_EN = [
  {
    score: 100,
    title: 'Mastered Exceptionally',
    desc: 'Demonstrates exceptional mastery and applies concepts beyond expectations.',
  },
  {
    score: 90,
    title: 'Proficient',
    desc: 'Deeply understands the material, works meticulously, and consistently delivers optimal results.',
  },
  {
    score: 80,
    title: 'Competent',
    desc: 'Understands the material well and can complete tasks independently.',
  },
  {
    score: 70,
    title: 'Practicing',
    desc: 'Shows good effort and continues practicing to strengthen comprehension.',
  },
  {
    score: 60,
    title: 'Introductory',
    desc: 'In early stages of understanding the material and requires further guidance.',
  },
]

export const GRADE_RUBRICS = GRADE_RUBRICS_ID

export function getGradeLabel(score: number | null | undefined, lang: 'id' | 'en' = 'id'): string {
  if (score == null) return '-'
  const rubrics = lang === 'en' ? GRADE_RUBRICS_EN : GRADE_RUBRICS_ID
  const rub = rubrics.find((r) => r.score === score)
  return rub ? `${score} - ${rub.title}` : String(score)
}

export function formatTodayLocalLong(lang: 'id' | 'en' = 'id'): string {
  const d = new Date()
  if (lang === 'en') {
    const monthsEn = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
    return `${monthsEn[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  }
  const monthsId = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ]
  return `${d.getDate()} ${monthsId[d.getMonth()]} ${d.getFullYear()}`
}

export type RaportParams = {
  student: Student
  tingkat?: { id: string; nama: string }
  semester: number
  tab: 'penilaian' | 'laporan'
  materiList: MateriAjar[]
  byMateri: Map<string, Pencapaian>
  lang?: 'id' | 'en'
}

export type RaportParts = {
  title: string
  css: string
  bodyHtml: string
}

export function renderRaportParts(params: RaportParams): RaportParts {
  const { student, tingkat, semester, tab, materiList, byMateri, lang = 'id' } = params
  const isEn = lang === 'en'
  const age = ageInYears(student.dateOfBirth)
  const isLandscape = tab === 'penilaian'
  const months = SEMESTER_MONTHS[semester] || [7, 8, 9, 10, 11, 12]
  const monthsShort = isEn
    ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const groups = groupByTemaSub(materiList)

  // Calculate completion per tema and subTema
  const completionByTema = new Map<string, { total: number; done: number }>()
  const completionBySub = new Map<string, { total: number; done: number }>()
  for (const m of materiList) {
    const done = byMateri.get(m.id)?.status === 'tuntas' ? 1 : 0
    const tema = m.tema ?? ''
    const tStat = completionByTema.get(tema) ?? { total: 0, done: 0 }
    completionByTema.set(tema, { total: tStat.total + 1, done: tStat.done + done })

    const subKey = `${tema}/${m.subTema}`
    const sStat = completionBySub.get(subKey) ?? { total: 0, done: 0 }
    completionBySub.set(subKey, { total: sStat.total + 1, done: sStat.done + done })
  }

  // CSS Styles
  const css = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body, .raport-root {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      font-size: 11px;
      line-height: 1.4;
      padding: ${isLandscape ? '12px 16px' : '16px 20px'};
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .header {
      position: relative;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .header-inner {
      display: flex;
      align-items: center;
      position: relative;
      min-height: 52px;
    }
    .header-logo {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      height: 50px;
      width: auto;
      object-fit: contain;
    }
    .header-text {
      width: 100%;
      text-align: center;
      padding: 0 55px;
    }
    .header-text .org {
      font-size: 12.5px;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: #047857;
      text-transform: uppercase;
    }
    .header-text .title {
      font-size: 15.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #0f172a;
      margin-top: 1px;
    }
    .header-text .sub {
      font-size: 10.5px;
      color: #475569;
      font-weight: 600;
      margin-top: 1px;
    }
    .meta-box {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 12px;
      background-color: #f8fafc !important;
      box-shadow: inset 0 0 0 1000px #f8fafc !important;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 24px;
    }
    .meta-item {
      display: flex;
      font-size: 10.5px;
    }
    .meta-label {
      width: 115px;
      font-weight: 600;
      color: #475569;
    }
    .meta-val {
      flex: 1;
      font-weight: 700;
      color: #0f172a;
    }
    .completion-section {
      margin-bottom: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .section-title {
      font-size: 10.5px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .completion-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .completion-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background-color: #f8fafc !important;
      box-shadow: inset 0 0 0 1000px #f8fafc !important;
      padding: 8px 10px;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .completion-tema-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .tema-badge {
      font-size: 9.5px;
      font-weight: 800;
      color: #047857;
      text-transform: uppercase;
    }
    .tema-stat {
      font-size: 9.5px;
      font-weight: 700;
      color: #475569;
    }
    .progress-track {
      width: 100%;
      height: 7px;
      background-color: #e2e8f0 !important;
      box-shadow: inset 0 0 0 1000px #e2e8f0 !important;
      border-radius: 3.5px;
      overflow: hidden;
      margin-bottom: 6px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .progress-fill {
      height: 100%;
      background-color: #059669 !important;
      box-shadow: inset 0 0 0 1000px #059669 !important;
      border-radius: 3.5px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .completion-sub-list {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .completion-sub-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 9px;
    }
    .sub-name {
      width: 125px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #475569;
      font-weight: 600;
    }
    .mini-progress-track {
      flex: 1;
      height: 5px;
      background-color: #e2e8f0 !important;
      box-shadow: inset 0 0 0 1000px #e2e8f0 !important;
      border-radius: 2.5px;
      overflow: hidden;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .mini-progress-fill {
      height: 100%;
      background-color: #10b981 !important;
      box-shadow: inset 0 0 0 1000px #10b981 !important;
      border-radius: 2.5px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .sub-stat {
      width: 32px;
      text-align: right;
      color: #64748b;
      font-weight: 700;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 10.5px;
    }
    table.data-table th, table.data-table td {
      border: 1px solid #cbd5e1;
      padding: 5px 6px;
      vertical-align: middle;
    }
    table.data-table th {
      background-color: #f1f5f9 !important;
      box-shadow: inset 0 0 0 1000px #f1f5f9 !important;
      font-weight: 700;
      color: #1e293b;
      text-align: center;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    table.data-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .tema-row {
      background-color: #f8fafc !important;
      box-shadow: inset 0 0 0 1000px #f8fafc !important;
      font-weight: 800;
      color: #047857;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.3px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .badge {
      display: inline-block;
      padding: 1.5px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
      text-align: center;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .badge-tuntas {
      background-color: #dcfce7 !important;
      color: #166534 !important;
      box-shadow: inset 0 0 0 1000px #dcfce7 !important;
    }
    .badge-proses {
      background-color: #fef3c7 !important;
      color: #92400e !important;
      box-shadow: inset 0 0 0 1000px #fef3c7 !important;
    }
    .badge-belum {
      background-color: #f1f5f9 !important;
      color: #64748b !important;
      box-shadow: inset 0 0 0 1000px #f1f5f9 !important;
    }
    .rubric-box {
      margin-top: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      background-color: #f8fafc !important;
      box-shadow: inset 0 0 0 1000px #f8fafc !important;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .rubric-title {
      font-weight: 800;
      font-size: 10.5px;
      color: #0f172a;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table.rubric-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }
    table.rubric-table th, table.rubric-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      vertical-align: top;
    }
    table.rubric-table th {
      background-color: #e2e8f0 !important;
      box-shadow: inset 0 0 0 1000px #e2e8f0 !important;
      font-weight: 700;
      color: #1e293b;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .signatures {
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      page-break-inside: avoid;
      break-inside: avoid;
      padding: 0 30px;
    }
    .sig-block {
      text-align: center;
      width: 200px;
      font-size: 10px;
    }
    .sig-line {
      height: 44px;
    }
    @media print {
      body {
        padding: 0;
        background: #fff;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page {
        size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'};
        margin: 8mm;
      }
    }
  `

  // Build Completion Section HTML (fixed 2 columns, 2 rows)
  let completionHtml = ''
  if (groups.length > 0) {
    completionHtml = `
      <div class="completion-section">
        <div class="section-title">${isEn ? 'Curriculum Achievement Summary (Completion Progress)' : 'Ringkasan Capaian Kurikulum (Completion Progres)'}</div>
        <div class="completion-grid">
          ${groups.map((g) => {
            const tStat = completionByTema.get(g.tema) ?? { total: 0, done: 0 }
            const tPct = tStat.total > 0 ? Math.round((tStat.done / tStat.total) * 100) : 0
            return `
              <div class="completion-card">
                <div class="completion-tema-header">
                  <span class="tema-badge">${g.tema}</span>
                  <span class="tema-stat">${tStat.done}/${tStat.total} (${tPct}%)</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" style="width: ${tPct}%;"></div>
                </div>
                <div class="completion-sub-list">
                  ${g.subTemas.map((sub) => {
                    const subKey = `${g.tema}/${sub.subTema}`
                    const sStat = completionBySub.get(subKey) ?? { total: 0, done: 0 }
                    const sPct = sStat.total > 0 ? Math.round((sStat.done / sStat.total) * 100) : 0
                    const formattedSub = formatSubTemaTitle(sub.subTema)
                    return `
                      <div class="completion-sub-row">
                        <span class="sub-name" title="${formattedSub}">${formattedSub}</span>
                        <div class="mini-progress-track">
                          <div class="mini-progress-fill" style="width: ${sPct}%;"></div>
                        </div>
                        <span class="sub-stat">${sStat.done}/${sStat.total}</span>
                      </div>
                    `
                  }).join('')}
                </div>
              </div>
            `
          }).join('')}
        </div>
      </div>
    `
  }

  // Build Table Content
  let tableHtml = ''

  if (tab === 'laporan') {
    // Mode Laporan: Penilaian Akhir + Catatan Pengajar
    tableHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 36px;">No</th>
            <th style="width: 130px; text-align: left;">${isEn ? 'Theme & Sub Theme' : 'Tema & Sub Tema'}</th>
            <th style="text-align: left;">${isEn ? 'Learning Material' : 'Materi Pembelajaran'}</th>
            <th style="width: 145px;">${isEn ? 'Final Assessment' : 'Penilaian Akhir'}</th>
            <th style="width: 210px; text-align: left;">${isEn ? "Teacher's Notes / Evaluation" : 'Catatan / Evaluasi Pengajar'}</th>
          </tr>
        </thead>
        <tbody>
    `

    let count = 1
    for (const g of groups) {
      tableHtml += `
        <tr class="tema-row">
          <td colspan="5" style="padding-left: 8px;">
            ${g.tema}
          </td>
        </tr>
      `
      for (const sub of g.subTemas) {
        const formattedSub = formatSubTemaTitle(sub.subTema)
        for (const m of sub.materi) {
          const p = byMateri.get(m.id)
          const statusText = p?.status === 'tuntas'
            ? (isEn ? 'COMPLETED' : 'TUNTAS')
            : p?.status === 'proses'
              ? (isEn ? 'PRACTICING' : 'SEDANG BERLATIH')
              : (isEn ? 'NOT YET' : 'BELUM')
          const badgeClass = p?.status === 'tuntas' ? 'badge-tuntas' : p?.status === 'proses' ? 'badge-proses' : 'badge-belum'
          const scoreFormatted = p?.nilaiAngka != null ? getGradeLabel(p.nilaiAngka, lang) : statusText
          const noteText = p?.catatan ? p.catatan.replace(/\n/g, '<br/>') : '-'

          tableHtml += `
            <tr>
              <td style="text-align: center; font-weight: 600;">${m.nomor || count}</td>
              <td><strong>${formattedSub}</strong></td>
              <td>
                <div style="font-weight: 600; color: #0f172a;">${m.materi}</div>
                ${m.rincian ? `<div style="font-size: 9.5px; color: #64748b; margin-top: 1px;">${m.rincian}</div>` : ''}
              </td>
              <td style="text-align: center;">
                <span class="badge ${badgeClass}">${scoreFormatted}</span>
              </td>
              <td style="font-size: 10px; color: #334155;">${noteText}</td>
            </tr>
          `
          count++
        }
      }
    }

    tableHtml += `</tbody></table>`
  } else {
    // Mode Penilaian: Nilai per bulan
    tableHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 32px;">No</th>
            <th style="width: 110px; text-align: left;">${isEn ? 'Sub Theme' : 'Sub Tema'}</th>
            <th style="text-align: left;">${isEn ? 'Learning Material' : 'Materi Pembelajaran'}</th>
            ${months.map((mo) => `<th style="width: 44px;">${monthsShort[mo - 1]}</th>`).join('')}
            <th style="width: 75px;">${isEn ? 'Status' : 'Status'}</th>
            <th style="width: 50px;">${isEn ? 'Grade' : 'Nilai'}</th>
            <th style="width: 140px; text-align: left;">${isEn ? 'Notes' : 'Catatan'}</th>
          </tr>
        </thead>
        <tbody>
    `

    let count = 1
    for (const g of groups) {
      tableHtml += `
        <tr class="tema-row">
          <td colspan="${6 + months.length}" style="padding-left: 8px;">
            ${g.tema}
          </td>
        </tr>
      `
      for (const sub of g.subTemas) {
        const formattedSub = formatSubTemaTitle(sub.subTema)
        for (const m of sub.materi) {
          const p = byMateri.get(m.id)
          const pMonth = p?.tanggal ? new Date(p.tanggal).getMonth() + 1 : null

          const statusBadge = p?.status === 'tuntas'
            ? `<span class="badge badge-tuntas">${isEn ? 'COMPLETED' : 'TUNTAS'}</span>`
            : p?.status === 'proses'
              ? `<span class="badge badge-proses">${isEn ? 'IN PROGRESS' : 'PROSES'}</span>`
              : '<span class="badge badge-belum">-</span>'

          const noteText = p?.catatan ? p.catatan.replace(/\n/g, '<br/>') : '-'

          tableHtml += `
            <tr>
              <td style="text-align: center; font-weight: 600;">${m.nomor || count}</td>
              <td><strong>${formattedSub}</strong></td>
              <td>
                <div style="font-weight: 600; color: #0f172a;">${m.materi}</div>
                ${m.rincian ? `<div style="font-size: 9px; color: #64748b;">${m.rincian}</div>` : ''}
              </td>
              ${months
                .map((mo) => {
                  const val = pMonth === mo ? (p?.nilaiAngka ?? (p?.status === 'tuntas' ? 'T' : 'P')) : '-'
                  const isVal = val !== '-'
                  return `<td style="text-align: center; font-weight: ${isVal ? '700' : '400'}; color: ${isVal ? '#047857' : '#94a3b8'};">${val}</td>`
                })
                .join('')}
              <td style="text-align: center;">${statusBadge}</td>
              <td style="text-align: center; font-weight: 700;">${p?.nilaiAngka ?? '-'}</td>
              <td style="font-size: 9.5px; color: #334155;">${noteText}</td>
            </tr>
          `
          count++
        }
      }
    }

    tableHtml += `</tbody></table>`
  }

  // Rubrik Penilaian (prominent for Laporan)
  const rubrics = isEn ? GRADE_RUBRICS_EN : GRADE_RUBRICS_ID
  const rubricHtml = tab === 'laporan' ? `
    <div class="rubric-box">
      <div class="rubric-title">${isEn ? 'Competency Achievement Score Scale Explanation' : 'Keterangan Skala Nilai Capaian Kompetensi'}</div>
      <table class="rubric-table">
        <thead>
          <tr>
            <th style="width: 60px; text-align: center;">${isEn ? 'Score' : 'Nilai'}</th>
            <th style="width: 140px; text-align: left;">${isEn ? 'Criteria' : 'Kriteria'}</th>
            <th style="text-align: left;">${isEn ? 'Achievement Description' : 'Deskripsi Capaian'}</th>
          </tr>
        </thead>
        <tbody>
          ${rubrics.map((r) => `
            <tr>
              <td style="text-align: center; font-weight: 800; color: #047857;">${r.score}</td>
              <td><strong>${r.title}</strong></td>
              <td style="color: #334155;">${r.desc}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : ''

  // Signatures
  const signaturesHtml = `
    <div class="signatures">
      <div class="sig-block">
        <div>${isEn ? 'Acknowledged by,' : 'Mengetahui,'}</div>
        <div>${isEn ? 'Parent / Guardian' : 'Orang Tua / Wali Murid'}</div>
        <div class="sig-line"></div>
        <div style="font-weight: 600;">( .................................................. )</div>
      </div>
      <div class="sig-block">
        <div>${formatTodayLocalLong(lang)}</div>
        <div>${isEn ? 'Teacher / Advisor' : 'Pengajar / Guru Pembina'}</div>
        <div class="sig-line"></div>
        <div style="font-weight: 600;">( .................................................. )</div>
      </div>
    </div>
  `

  const bodyHtml = `
    <div class="header">
      <div class="header-inner">
        <img class="header-logo" src="${PPG_LOGO_BASE64}" alt="PPG US Logo" />
        <div class="header-text">
          <div class="org">PPG (Penggerak Pembina Generus)</div>
          <div class="title">${isEn ? 'STUDENT CURRICULUM ACHIEVEMENT REPORT CARD' : 'RAPORT CAPAIAN KURIKULUM GENERUS'}</div>
          <div class="sub">Semester ${semester} &bull; ${tingkat?.nama ? `${isEn ? 'Curriculum' : 'Kurikulum'}: ${tingkat.nama}` : (isEn ? 'Student Level' : 'Tingkat Generus')}</div>
        </div>
      </div>
    </div>

    <div class="meta-box">
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">${isEn ? 'Student Name' : 'Nama Murid'}</span>
          <span class="meta-val">: ${student.name}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">${isEn ? 'Group' : 'Kelompok'}</span>
          <span class="meta-val">: ${formatKelompokTag(student.kelompok) || '-'}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">${isEn ? 'Nickname' : 'Nama Panggilan'}</span>
          <span class="meta-val">: ${student.nickname || '-'}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">${isEn ? 'Level / Age' : 'Jenjang / Usia'}</span>
          <span class="meta-val">: ${student.level || '-'} ${age != null ? `(${age} ${isEn ? 'years old' : 'tahun'})` : ''}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Semester</span>
          <span class="meta-val">: Semester ${semester}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">${isEn ? 'Report Date' : 'Tanggal Laporan'}</span>
          <span class="meta-val">: ${formatTodayLocalLong(lang)}</span>
        </div>
      </div>
    </div>

    ${completionHtml}
    ${tableHtml}
    ${rubricHtml}
    ${signaturesHtml}
  `

  return {
    title: `Raport - ${student.name}`,
    css,
    bodyHtml,
  }
}

export function buildRaportHtml(params: RaportParams): string {
  const { title, css, bodyHtml } = renderRaportParts(params)
  const docLang = params.lang === 'en' ? 'en' : 'id'
  return `<!DOCTYPE html>
<html lang="${docLang}">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>${css}</style>
</head>
<body class="raport-root">
  ${bodyHtml}
</body>
</html>`
}

/** Prints the raport using an isolated iframe with layout dimensions (never captures modals or page chrome) */
export function printRaport(params: RaportParams): void {
  const html = buildRaportHtml(params)
  const isLandscape = params.tab === 'penilaian'
  const iframe = document.createElement('iframe')
  // CRITICAL: Give the iframe real viewport width & height so CSS width percentages
  // (such as progress bars) are computed accurately by the layout engine before print.
  iframe.style.position = 'fixed'
  iframe.style.top = '0'
  iframe.style.left = '0'
  iframe.style.width = isLandscape ? '1120px' : '794px'
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

/** Generates and downloads a clean PDF file using html2pdf.js */
export async function downloadRaportPdf(params: RaportParams): Promise<void> {
  const { css, bodyHtml } = renderRaportParts(params)
  const isLandscape = params.tab === 'penilaian'
  const studentSafe = (params.student.name || 'murid').replace(/[^a-zA-Z0-9]/g, '_')
  const filename = `Raport_${studentSafe}_Smt${params.semester}.pdf`

  // Create an in-flow container element for html2pdf.
  // html2pdf automatically wraps this in an offscreen overlay (opacity: 0) during capture,
  // avoiding height: 0 collapse caused by position: fixed and clipping caused by negative z-index.
  const container = document.createElement('div')
  container.id = 'raport-pdf-render-target'
  container.style.width = isLandscape ? '1120px' : '794px'
  container.style.backgroundColor = '#ffffff'
  container.style.color = '#0f172a'
  container.innerHTML = `<style>${css}</style><div class="raport-root">${bodyHtml}</div>`

  // Give the DOM time to compute layout and styles before capturing
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
      windowWidth: isLandscape ? 1120 : 800,
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: isLandscape ? 'landscape' : 'portrait' },
    pagebreak: { mode: 'legacy' },
  }

  // @ts-expect-error html2pdf typings compatibility
  await html2pdf().set(opt).from(container).save()
}
