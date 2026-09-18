import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Search, UserCheck } from 'lucide-react'

import { getTeachersForStudent, setTeachersForStudent } from '@/api/studentTeachers'
import { listTeachers } from '@/api/teachers'
import type { Student, Teacher } from '@/api/types'
import { useTranslation } from '@/lib/i18n'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'

export function AssignTeachersModal({
  student,
  open,
  onClose,
}: {
  student: Student
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Fetch all active teachers for selection
  const { data: teachersData, isPending: allTeachersLoading } = useQuery({
    queryKey: ['teachers', 'active-all'],
    queryFn: () => listTeachers({ limit: 300, status: 'active' }),
    enabled: open,
  })

  // Fetch currently assigned teachers for this student
  const { data: currentTeachers, isPending: currentLoading } = useQuery({
    queryKey: ['student-teachers', student.id],
    queryFn: () => getTeachersForStudent(student.id),
    enabled: open && !!student.id,
  })

  useEffect(() => {
    if (currentTeachers) {
      setSelectedIds(currentTeachers.map((tc) => tc.id))
    }
  }, [currentTeachers])

  const allTeachers: Teacher[] = teachersData?.items ?? []

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allTeachers
    return allTeachers.filter(
      (tc) =>
        tc.name.toLowerCase().includes(q) ||
        (tc.nickname && tc.nickname.toLowerCase().includes(q)) ||
        tc.kelompok.toLowerCase().includes(q),
    )
  }, [allTeachers, search])

  const toggleTeacher = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) => setTeachersForStudent(student.id, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-teachers', student.id] })
      qc.invalidateQueries({ queryKey: ['teacher-students'] })
      qc.invalidateQueries({ queryKey: ['student-teachers'] })
      qc.invalidateQueries({ queryKey: ['students'] })
      onClose()
    },
  })

  const handleSave = () => {
    saveMutation.mutate(selectedIds)
  }

  const isLoading = allTeachersLoading || currentLoading

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      zIndex="z-[110]"
      title={t('students.assignTeachersTitle', { name: student.name })}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {student.name} {student.nickname ? `(${student.nickname})` : ''} • {student.kelompok}
          </span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {selectedIds.length} pengajar dipilih
          </span>
        </div>

        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama pengajar..."
            className="pl-8 text-sm h-9"
          />
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-400">{t('common.loading')}</div>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {filteredTeachers.length > 0 ? (
              filteredTeachers.map((tc) => {
                const isSelected = selectedIds.includes(tc.id)
                return (
                  <label
                    key={tc.id}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                      isSelected ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTeacher(tc.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {tc.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {tc.nickname ? `${tc.nickname} • ` : ''}
                          {tc.kelompok}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-medium shrink-0 ml-2">
                        <Check size={14} className="mr-0.5" />
                        Terpilih
                      </span>
                    )}
                  </label>
                )
              })
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                Tidak ada pengajar yang sesuai pencarian.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saveMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
            <UserCheck size={14} className="mr-1" />
            {saveMutation.isPending ? 'Menyimpan...' : t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
