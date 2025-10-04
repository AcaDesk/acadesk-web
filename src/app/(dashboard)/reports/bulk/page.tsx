'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ReportGenerator } from '@/services/report-generator'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { FileText, Send, ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import { PageWrapper } from "@/components/layout/page-wrapper"

interface Student {
  id: string
  student_code: string
  users: {
    name: string
    email: string | null
  } | null
}

interface Class {
  id: string
  name: string
}

interface GenerationResult {
  studentId: string
  studentName: string
  success: boolean
  error?: string
}

export default function BulkReportsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [reportType, setReportType] = useState<'monthly' | 'weekly'>('monthly')
  const [autoSend, setAutoSend] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<GenerationResult[]>([])

  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()
  const reportGenerator = new ReportGenerator()

  const years = [2024, 2025, 2026]
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    filterStudents()
  }, [selectedClass, classes])

  async function loadData() {
    try {
      // Load classes
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('active', true)
        .is('deleted_at', null)
        .order('name')

      if (classesError) throw classesError
      setClasses(classesData)

      // Load all students
      await loadAllStudents()
    } catch (error) {
      console.error('Error loading data:', error)
      toast({
        title: '데이터 로드 오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    }
  }

  async function loadAllStudents() {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, student_code, users(name, email)')
        .is('deleted_at', null)
        .order('student_code')

      if (error) throw error
      setStudents(data as any)
    } catch (error) {
      console.error('Error loading students:', error)
    }
  }

  async function filterStudents() {
    if (selectedClass === 'all') {
      await loadAllStudents()
      return
    }

    try {
      // Get students enrolled in selected class
      const { data: enrollments, error } = await supabase
        .from('class_enrollments')
        .select('student_id')
        .eq('class_id', selectedClass)
        .eq('status', 'active')

      if (error) throw error

      const studentIds = enrollments.map((e) => e.student_id)

      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, student_code, users(name, email)')
        .in('id', studentIds)
        .is('deleted_at', null)
        .order('student_code')

      if (studentsError) throw studentsError
      setStudents(studentsData as any)
    } catch (error) {
      console.error('Error filtering students:', error)
    }
  }

  function toggleStudent(studentId: string) {
    const newSelected = new Set(selectedStudents)
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId)
    } else {
      newSelected.add(studentId)
    }
    setSelectedStudents(newSelected)
  }

  function toggleAll() {
    if (selectedStudents.size === students.length) {
      setSelectedStudents(new Set())
    } else {
      setSelectedStudents(new Set(students.map((s) => s.id)))
    }
  }

  async function generateBulkReports() {
    if (selectedStudents.size === 0) {
      toast({
        title: '학생 선택 필요',
        description: '리포트를 생성할 학생을 선택해주세요.',
        variant: 'destructive',
      })
      return
    }

    if (!confirm(`${selectedStudents.size}명의 학생 리포트를 생성하시겠습니까?`)) {
      return
    }

    setGenerating(true)
    setProgress(0)
    setResults([])

    const selectedStudentsList = students.filter((s) => selectedStudents.has(s.id))
    const generationResults: GenerationResult[] = []

    try {
      for (let i = 0; i < selectedStudentsList.length; i++) {
        const student = selectedStudentsList[i]

        try {
          // Generate report
          const data = await reportGenerator.generateMonthlyReport(
            student.id,
            selectedYear,
            selectedMonth
          )

          // Save report
          await reportGenerator.saveReport(data, reportType)

          // Auto-send if enabled
          if (autoSend && student.users?.email) {
            await supabase
              .from('reports')
              .update({ sent_at: new Date().toISOString() })
              .eq('student_id', student.id)
              .eq('period_start', `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`)
          }

          generationResults.push({
            studentId: student.id,
            studentName: student.users?.name || '이름 없음',
            success: true,
          })
        } catch (error: any) {
          console.error(`Error generating report for ${student.id}:`, error)
          generationResults.push({
            studentId: student.id,
            studentName: student.users?.name || '이름 없음',
            success: false,
            error: error.message || '알 수 없는 오류',
          })
        }

        setProgress(Math.round(((i + 1) / selectedStudentsList.length) * 100))
        setResults([...generationResults])
      }

      const successCount = generationResults.filter((r) => r.success).length
      const failCount = generationResults.filter((r) => !r.success).length

      toast({
        title: '일괄 생성 완료',
        description: `성공: ${successCount}건, 실패: ${failCount}건`,
      })
    } catch (error: any) {
      console.error('Error in bulk generation:', error)
      toast({
        title: '일괄 생성 오류',
        description: error.message || '리포트를 생성하는 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/reports')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">리포트 일괄 생성</h1>
            <p className="text-muted-foreground">반 또는 전체 학생의 리포트를 한 번에 생성하세요</p>
          </div>
        </div>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle>생성 설정</CardTitle>
            <CardDescription>리포트 유형과 기간을 선택하세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>리포트 유형</Label>
                <Select value={reportType} onValueChange={(v: any) => setReportType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">월간 리포트</SelectItem>
                    <SelectItem value="weekly">주간 리포트</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>연도</Label>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}년
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>월</Label>
                <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month} value={month.toString()}>
                        {month}월
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="autoSend"
                checked={autoSend}
                onCheckedChange={(checked) => setAutoSend(checked as boolean)}
              />
              <Label htmlFor="autoSend" className="cursor-pointer">
                생성 후 자동으로 보호자에게 전송 (이메일이 등록된 학생만)
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Student Selection */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>학생 선택</CardTitle>
                <CardDescription>리포트를 생성할 학생을 선택하세요</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 학생</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={toggleAll}>
                  {selectedStudents.size === students.length ? '전체 해제' : '전체 선택'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
              <div className="grid gap-3 md:grid-cols-2">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted cursor-pointer"
                    onClick={() => toggleStudent(student.id)}
                  >
                    <Checkbox
                      checked={selectedStudents.has(student.id)}
                      onCheckedChange={() => toggleStudent(student.id)}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{student.users?.name || '이름 없음'}</div>
                      <div className="text-sm text-muted-foreground">{student.student_code}</div>
                    </div>
                    {student.users?.email && (
                      <Badge variant="outline" className="text-xs">
                        <Send className="h-3 w-3 mr-1" />
                        이메일
                      </Badge>
                    )}
                  </div>
                ))}
              </div>

              {students.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>학생이 없습니다.</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <Badge variant="secondary" className="text-sm">
                {selectedStudents.size}명 선택됨
              </Badge>
              <Button
                size="lg"
                onClick={generateBulkReports}
                disabled={generating || selectedStudents.size === 0}
              >
                <FileText className="h-5 w-5 mr-2" />
                {generating ? '생성 중...' : `리포트 생성 (${selectedStudents.size}명)`}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        {generating && (
          <Card>
            <CardHeader>
              <CardTitle>생성 진행 중</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground text-center">
                {progress}% 완료
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>생성 결과</CardTitle>
              <CardDescription>
                성공: {results.filter((r) => r.success).length}건 /
                실패: {results.filter((r) => !r.success).length}건
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {results.map((result) => (
                  <div
                    key={result.studentId}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {result.success ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <span className="font-medium">{result.studentName}</span>
                    </div>
                    <div>
                      {result.success ? (
                        <Badge variant="default">성공</Badge>
                      ) : (
                        <Badge variant="destructive" title={result.error}>
                          실패
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageWrapper>
  )
}
