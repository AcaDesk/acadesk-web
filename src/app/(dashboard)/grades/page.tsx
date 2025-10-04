'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { PageWrapper } from "@/components/layout/page-wrapper"
import { PAGE_LAYOUT, GRID_LAYOUTS, TEXT_STYLES, CARD_STYLES } from '@/lib/constants'
import { ArrowRight, List, Users } from 'lucide-react'
import Link from 'next/link'

interface Student {
  id: string
  student_code: string
  users: {
    name: string
  }
}

interface Exam {
  id: string
  name: string
  category_code: string
  exam_date: string
  total_questions: number
}

interface ExamCategory {
  code: string
  label: string
}

export default function GradesPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [categories, setCategories] = useState<ExamCategory[]>([])
  const [selectedStudent, setSelectedStudent] = useState<string>('')
  const [selectedExam, setSelectedExam] = useState<string>('')
  const [correctAnswers, setCorrectAnswers] = useState<string>('')
  const [totalQuestions, setTotalQuestions] = useState<string>('')
  const [feedback, setFeedback] = useState<string>('')
  const [calculatedPercentage, setCalculatedPercentage] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    // Auto-calculate percentage
    const correct = parseInt(correctAnswers)
    const total = parseInt(totalQuestions)

    if (!isNaN(correct) && !isNaN(total) && total > 0) {
      const percentage = Math.round((correct / total) * 100 * 100) / 100
      setCalculatedPercentage(percentage)
    } else {
      setCalculatedPercentage(null)
    }
  }, [correctAnswers, totalQuestions])

  async function loadData() {
    try {
      // Load students
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, student_code, users(name)')
        .is('deleted_at', null)
        .order('student_code')

      if (studentsError) throw studentsError
      setStudents(studentsData as any)

      // Load exams
      const { data: examsData, error: examsError } = await supabase
        .from('exams')
        .select('id, name, category_code, exam_date, total_questions')
        .is('deleted_at', null)
        .order('exam_date', { ascending: false })

      if (examsError) throw examsError
      setExams(examsData)

      // Load exam categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('ref_exam_categories')
        .select('code, label')
        .eq('active', true)
        .order('sort_order')

      if (categoriesError) throw categoriesError
      setCategories(categoriesData)
    } catch (error) {
      console.error('Error loading data:', error)
      toast({
        title: '데이터 로드 오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const correct = parseInt(correctAnswers)
      const total = parseInt(totalQuestions)

      if (!selectedStudent || !selectedExam) {
        throw new Error('학생과 시험을 선택해주세요.')
      }

      if (isNaN(correct) || isNaN(total) || total <= 0) {
        throw new Error('올바른 점수를 입력해주세요.')
      }

      // Get tenant_id from the selected student
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('tenant_id')
        .eq('id', selectedStudent)
        .maybeSingle()

      if (studentError) {
        console.error('Error fetching student data:', studentError)
        throw new Error(`학생 정보를 조회할 수 없습니다: ${studentError.message}`)
      }

      if (!studentData) throw new Error('학생 정보를 찾을 수 없습니다.')

      // Insert exam score
      const { error } = await supabase.from('exam_scores').insert({
        tenant_id: studentData.tenant_id,
        exam_id: selectedExam,
        student_id: selectedStudent,
        correct_answers: correct,
        total_questions: total,
        feedback: feedback || null,
        is_retest: false,
        retest_count: 0,
      })

      if (error) throw error

      toast({
        title: '성적 입력 완료',
        description: `${calculatedPercentage}% - 성적이 성공적으로 입력되었습니다.`,
      })

      // Reset form
      setCorrectAnswers('')
      setTotalQuestions('')
      setFeedback('')
      setCalculatedPercentage(null)
    } catch (error: any) {
      console.error('Error saving score:', error)
      toast({
        title: '저장 오류',
        description: error.message || '성적을 저장하는 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageWrapper>
      <div className={PAGE_LAYOUT.SECTION_SPACING}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className={TEXT_STYLES.PAGE_TITLE}>성적 입력</h1>
          <p className={TEXT_STYLES.PAGE_DESCRIPTION}>시험 성적을 입력하고 관리합니다</p>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={GRID_LAYOUTS.DUAL}
        >
          <Link href="/grades/exams">
            <Card className={CARD_STYLES.INTERACTIVE}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center mb-3">
                    <List className="h-6 w-6 text-blue-600" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle className="text-lg">시험 목록에서 일괄 입력</CardTitle>
                <CardDescription>
                  시험을 선택하고 반 전체 학생의 성적을 한 번에 입력하세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant="default">추천</Badge>
                  <span className="text-sm text-muted-foreground">빠르고 효율적</span>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/grades/list">
            <Card className={CARD_STYLES.INTERACTIVE}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-lg bg-green-50 dark:bg-green-950/20 flex items-center justify-center mb-3">
                    <Users className="h-6 w-6 text-green-600" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle className="text-lg">성적 조회</CardTitle>
                <CardDescription>
                  학생별, 시험별 성적을 조회하고 분석하세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-muted-foreground">상세 통계 제공</span>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>개별 학생 성적 입력</CardTitle>
              <CardDescription>
                특정 학생의 성적을 개별적으로 입력하려면 아래 폼을 사용하세요
              </CardDescription>
            </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Student and Exam Selection */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="student">학생</Label>
                  <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                    <SelectTrigger id="student">
                      <SelectValue placeholder="학생을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.student_code} - {(student.users as any)?.name || 'Unknown'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="exam">시험</Label>
                  <Select value={selectedExam} onValueChange={setSelectedExam}>
                    <SelectTrigger id="exam">
                      <SelectValue placeholder="시험을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {exams.map((exam) => (
                        <SelectItem key={exam.id} value={exam.id}>
                          {exam.name} ({exam.exam_date})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Score Input */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="correct">맞은 문항 수</Label>
                  <Input
                    id="correct"
                    type="number"
                    min="0"
                    value={correctAnswers}
                    onChange={(e) => setCorrectAnswers(e.target.value)}
                    placeholder="30"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total">전체 문항 수</Label>
                  <Input
                    id="total"
                    type="number"
                    min="1"
                    value={totalQuestions}
                    onChange={(e) => setTotalQuestions(e.target.value)}
                    placeholder="32"
                    required
                  />
                </div>
              </div>

              {/* Calculated Percentage Display */}
              {calculatedPercentage !== null && (
                <div className="p-6 bg-primary/5 rounded-lg border-2 border-primary/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">계산된 점수</div>
                      <div className="text-4xl font-bold text-primary">
                        {calculatedPercentage}%
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {correctAnswers}/{totalQuestions} 정답
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Feedback */}
              <div className="space-y-2">
                <Label htmlFor="feedback">강사 코멘트 (선택사항)</Label>
                <Textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="학생에 대한 피드백을 입력하세요..."
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* Submit Button */}
              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? '저장 중...' : '성적 입력'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        </motion.div>

        {/* Quick Guide */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
          <CardHeader>
            <CardTitle className="text-lg">사용 가이드</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-3">
              <div className="text-xl">📝</div>
              <div>
                <div className="font-semibold mb-1">분수 입력</div>
                <div className="text-muted-foreground">맞은 문항 수와 전체 문항 수를 입력하면 자동으로 퍼센트가 계산됩니다.</div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-xl">📊</div>
              <div>
                <div className="font-semibold mb-1">예시</div>
                <div className="text-muted-foreground">30/32 입력 → 93.75% 자동 계산</div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-xl">💬</div>
              <div>
                <div className="font-semibold mb-1">피드백</div>
                <div className="text-muted-foreground">학생에 대한 코멘트를 입력하면 리포트에 포함됩니다.</div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-xl">🔄</div>
              <div>
                <div className="font-semibold mb-1">재시험</div>
                <div className="text-muted-foreground">같은 학생의 같은 시험을 다시 입력하면 재시험으로 기록됩니다.</div>
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      </div>
    </PageWrapper>
  )
}
