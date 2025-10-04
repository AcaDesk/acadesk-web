'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { PageWrapper } from "@/components/layout/page-wrapper"
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { GUARDIAN_RELATIONSHIPS } from '@/lib/constants'

const guardianSchema = z.object({
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다'),
  email: z.string().email('올바른 이메일 형식이 아닙니다').optional().or(z.literal('')),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  relationship: z.string().min(1, '관계를 선택해주세요'),
})

type GuardianFormValues = z.infer<typeof guardianSchema>

interface GuardianData {
  id: string
  relationship: string | null
  users: {
    id: string
    name: string
    email: string | null
    phone: string | null
  } | null
  student_guardians: Array<{
    students: {
      id: string
    } | null
  }>
}

interface Student {
  id: string
  student_code: string
  users: {
    name: string
  } | null
}

export default function EditGuardianPage() {
  const params = useParams()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [guardian, setGuardian] = useState<GuardianData | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<GuardianFormValues>({
    resolver: zodResolver(guardianSchema),
  })

  const selectedRelationship = watch('relationship')

  useEffect(() => {
    if (params.id) {
      loadGuardianData(params.id as string)
      loadStudents()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function loadGuardianData(guardianId: string) {
    try {
      setInitialLoading(true)
      const { data, error } = await supabase
        .from('guardians')
        .select(`
          id,
          relationship,
          users (
            id,
            name,
            email,
            phone
          ),
          student_guardians (
            students (
              id
            )
          )
        `)
        .eq('id', guardianId)
        .maybeSingle()

      if (error) {
        console.error('Error fetching guardian:', error)
        throw error
      }

      if (!data) {
        throw new Error('보호자 정보를 찾을 수 없습니다.')
      }

      setGuardian(data as GuardianData)

      // Populate form fields
      if (data.users) {
        setValue('name', data.users.name)
        setValue('email', data.users.email || '')
        setValue('phone', data.users.phone || '')
      }
      setValue('relationship', data.relationship || '')

      // Set selected students
      const connectedStudentIds =
        data.student_guardians
          ?.map((sg: any) => sg.students?.id)
          .filter(Boolean) || []
      setSelectedStudents(connectedStudentIds)
    } catch (error: any) {
      console.error('보호자 조회 오류:', error)
      toast({
        title: '보호자 조회 실패',
        description: error.message || '보호자 정보를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
      router.push('/guardians')
    } finally {
      setInitialLoading(false)
    }
  }

  async function loadStudents() {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          student_code,
          users (
            name
          )
        `)
        .is('deleted_at', null)
        .order('student_code')

      if (error) throw error
      setStudents(data as Student[])
    } catch (error) {
      console.error('학생 목록 조회 오류:', error)
    }
  }

  const onSubmit = async (data: GuardianFormValues) => {
    if (!guardian) return

    setLoading(true)
    try {
      // 1. Update users table
      if (guardian.users) {
        const { error: userError } = await supabase
          .from('users')
          .update({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
          })
          .eq('id', guardian.users.id)

        if (userError) {
          console.error('사용자 업데이트 오류:', userError)
          throw new Error(`사용자 정보를 업데이트할 수 없습니다: ${userError.message}`)
        }
      }

      // 2. Update guardians table
      const { error: guardianError } = await supabase
        .from('guardians')
        .update({
          relationship: data.relationship,
        })
        .eq('id', guardian.id)

      if (guardianError) {
        console.error('보호자 업데이트 오류:', guardianError)
        throw guardianError
      }

      // 3. Update student connections
      // Delete all existing connections
      const { error: deleteError } = await supabase
        .from('student_guardians')
        .delete()
        .eq('guardian_id', guardian.id)

      if (deleteError && deleteError.code !== 'PGRST116') {
        console.error('기존 연결 삭제 오류:', deleteError)
        throw deleteError
      }

      // Insert new connections
      if (selectedStudents.length > 0) {
        // Get tenant_id from first student
        const { data: firstStudent } = await supabase
          .from('students')
          .select('tenant_id')
          .eq('id', selectedStudents[0])
          .maybeSingle()

        if (firstStudent) {
          const studentGuardianRecords = selectedStudents.map((studentId) => ({
            tenant_id: firstStudent.tenant_id,
            student_id: studentId,
            guardian_id: guardian.id,
            is_primary: false,
          }))

          const { error: linkError } = await supabase
            .from('student_guardians')
            .insert(studentGuardianRecords)

          if (linkError) {
            console.warn('학생 연결 오류:', linkError)
          }
        }
      }

      toast({
        title: '보호자 정보 수정 완료',
        description: `${data.name} 보호자의 정보가 수정되었습니다.`,
      })

      router.push(`/guardians/${guardian.id}`)
      router.refresh()
    } catch (error: any) {
      console.error('보호자 수정 오류:', error)
      toast({
        title: '보호자 수정 실패',
        description: error.message || '보호자 정보를 수정하는 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    )
  }

  if (initialLoading) {
    return (
      <PageWrapper>
        <div className="text-center py-12">로딩 중...</div>
      </PageWrapper>
    )
  }

  if (!guardian) {
    return (
      <PageWrapper>
        <div className="text-center py-12">
          <p className="text-muted-foreground">보호자를 찾을 수 없습니다.</p>
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/guardians/${guardian.id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">보호자 정보 수정</h1>
            <p className="text-muted-foreground">{guardian.users?.name || '이름 없음'}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>보호자 정보</CardTitle>
            <CardDescription>
              보호자의 기본 정보를 수정해주세요. 필수 항목은 * 표시되어 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* 기본 정보 */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">이름 *</Label>
                  <Input id="name" placeholder="홍길동" {...register('name')} />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="relationship">관계 *</Label>
                  <Select
                    onValueChange={(value) => setValue('relationship', value)}
                    value={selectedRelationship}
                  >
                    <SelectTrigger id="relationship">
                      <SelectValue placeholder="관계 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {GUARDIAN_RELATIONSHIPS.map((rel) => (
                        <SelectItem key={rel.value} value={rel.value}>
                          {rel.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.relationship && (
                    <p className="text-sm text-destructive">{errors.relationship.message}</p>
                  )}
                </div>
              </div>

              {/* 연락 정보 */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">연락처 *</Label>
                  <Input id="phone" placeholder="010-0000-0000" {...register('phone')} />
                  {errors.phone && (
                    <p className="text-sm text-destructive">{errors.phone.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">이메일</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="guardian@example.com"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>
              </div>

              {/* 학생 연결 */}
              <div className="space-y-2">
                <Label>연결할 학생 선택</Label>
                <div className="border rounded-lg p-4 max-h-[300px] overflow-y-auto">
                  {students.length > 0 ? (
                    <div className="space-y-3">
                      {students.map((student) => (
                        <div key={student.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`student-${student.id}`}
                            checked={selectedStudents.includes(student.id)}
                            onCheckedChange={() => handleStudentToggle(student.id)}
                          />
                          <label
                            htmlFor={`student-${student.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {student.users?.name || '이름 없음'} ({student.student_code})
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">등록된 학생이 없습니다.</p>
                  )}
                </div>
                {selectedStudents.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedStudents.length}명의 학생이 선택되었습니다.
                  </p>
                )}
              </div>

              {/* 버튼 */}
              <div className="flex gap-3 justify-end">
                <Link href={`/guardians/${guardian.id}`}>
                  <Button type="button" variant="outline">
                    취소
                  </Button>
                </Link>
                <Button type="submit" disabled={loading}>
                  {loading ? '저장 중...' : '저장'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  )
}
