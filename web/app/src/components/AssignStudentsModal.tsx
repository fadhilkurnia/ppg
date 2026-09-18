import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Search, UserCheck } from 'lucide-react'

import { getStudentsForTeacher, setStudentsForTeacher } from '@/api/studentTeachers'
import { listStudents } from '@/api/students'
import type { Student, Teacher } from '@/api/types'
import { useTranslation } from '@/lib/i18n'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'

export function AssignStudentsModal({
  teacher,
  open,
  onClose,
}: {
  teacher: Teacher
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Fetch all active students for selection
  const { data: studentsData, isPending: allStudentsLoading } = useQuery({
    queryKey: ['students', 'active-all'],
    queryFn: () => listStudents({ limit: 300, status: 'active' }),
    enabled: open,
  })

  // Fetch currently assigned students for this teacher
  const { data: currentStudents, isPending: currentLoading } = useQuery({
    queryKey: ['teacher-students', teacher.id],
    queryFn: () => getStudentsForTeacher(teacher.id),
    enabled: open && !!teacher.id,
  })

  useEffect(() => {
    if (currentStudents) {
      setSelectedIds(currentStudents.map((s) => s.id))
    }
  }, [currentStudents])

  const allStudents: Student[] = studentsData?.items ?? []

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allStudents
    return allStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.nickname && s.nickname.toLowerCase().includes(q)) ||
        s.kelompok.toLowerCase().includes(q) ||
        s.level.toLowerCase().includes(q),
    )
  }, [allStudents, search])

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) => setStudentsForTeacher(teacher.id, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-students', teacher.id] })
      qc.invalidateQueries({ queryKey: ['student-teachers'] })
      qc.invalidateQueries({ queryKey: ['teachers'] })
      onClose()
    },
  })

  const handleSave = () => {
    saveMutation.mutate(selectedIds)
  }

  const isLoading = allStudentsLoading || currentLoading

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      zIndex="z-[110]"
      title={t('teachers.assignStudentsTitle', { name: teacher.name })}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {teacher.name} {teacher.nickname ? `(${teacher.nickname})` : ''} • {teacher.kelompok}
          </span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {selectedIds.length} generus dipilih
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
            placeholder="Cari nama, panggilan, atau jenjang..."
            className="pl-8 text-sm h-9"
          />
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-400">{t('common.loading')}</div>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {filteredStudents.length > 0 ? (
              filteredStudents.map((s) => {
                const isSelected = selectedIds.includes(s.id)
                return (
                  <label
                    key={s.id}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                      isSelected ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleStudent(s.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {s.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {s.nickname ? `${s.nickname} • ` : ''}
                          {s.level} • {s.kelompok}
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
                Tidak ada generus yang sesuai pencarian.
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
