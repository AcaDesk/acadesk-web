'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Bell, Send, Clock, CheckCircle, XCircle, Search, AlertCircle, FileText } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { PageWrapper } from "@/components/layout/page-wrapper"

interface NotificationLog {
  id: string
  student_id: string
  notification_type: string
  status: string
  message: string
  sent_at: string
  error_message: string | null
  students: {
    student_code: string
    users: {
      name: string
      phone: string | null
    } | null
  } | null
}

interface AutoNotificationStats {
  type: string
  label: string
  description: string
  schedule: string
  lastRun: string | null
  nextRun: string
  enabled: boolean
}

export default function NotificationsPage() {
  const [logs, setLogs] = useState<NotificationLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<NotificationLog[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'sms' | 'email'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'sent' | 'failed'>('all')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [reportAutoSendStatus, setReportAutoSendStatus] = useState<any>(null)
  const [sendingReports, setSendingReports] = useState(false)

  const { toast } = useToast()
  const supabase = createClient()

  // Auto-notification configurations
  const autoNotifications: AutoNotificationStats[] = [
    {
      type: 'absent_students',
      label: '미등원 알림',
      description: '수업 시작 30분 후 결석 학생 보호자에게 자동 알림',
      schedule: '매 수업 30분 후',
      lastRun: null,
      nextRun: '다음 수업 시작 30분 후',
      enabled: true,
    },
    {
      type: 'todo_reminders',
      label: '과제 마감 알림',
      description: '과제 마감 하루 전 학생에게 자동 알림',
      schedule: '매일 오후 8시',
      lastRun: null,
      nextRun: '오늘 오후 8시',
      enabled: true,
    },
    {
      type: 'book_return_reminders',
      label: '도서 반납 알림',
      description: '이번 주 반납 예정 도서에 대한 알림',
      schedule: '매주 월요일 오전 9시',
      lastRun: null,
      nextRun: '다음 월요일 오전 9시',
      enabled: true,
    },
  ]

  useEffect(() => {
    loadNotificationLogs()
    loadReportAutoSendStatus()
  }, [])

  useEffect(() => {
    filterLogs()
  }, [searchTerm, filterType, filterStatus, logs])

  async function loadNotificationLogs() {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('notification_logs')
        .select(`
          id,
          student_id,
          notification_type,
          status,
          message,
          sent_at,
          error_message,
          students (
            student_code,
            users (name, phone)
          )
        `)
        .order('sent_at', { ascending: false })
        .limit(200)

      if (error) throw error
      setLogs(data as any)
    } catch (error) {
      console.error('Error loading logs:', error)
      toast({
        title: '데이터 로드 오류',
        description: '알림 로그를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  async function loadReportAutoSendStatus() {
    try {
      const response = await fetch('/api/reports/auto-send')
      if (!response.ok) throw new Error('Failed to load status')
      const data = await response.json()
      setReportAutoSendStatus(data)
    } catch (error) {
      console.error('Error loading report auto-send status:', error)
    }
  }

  async function handleSendReports() {
    if (!confirm('이번 달 리포트를 보호자에게 일괄 발송하시겠습니까?')) {
      return
    }

    setSendingReports(true)

    try {
      const response = await fetch('/api/reports/auto-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const result = await response.json()

      if (!response.ok) throw new Error(result.error)

      toast({
        title: '리포트 발송 완료',
        description: `${result.sent}건 발송, ${result.failed}건 실패`,
      })

      loadReportAutoSendStatus()
      loadNotificationLogs()
    } catch (error: any) {
      console.error('Error sending reports:', error)
      toast({
        title: '발송 오류',
        description: error.message || '리포트 발송 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    } finally {
      setSendingReports(false)
    }
  }

  function filterLogs() {
    let filtered = logs

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter((log) => log.notification_type === filterType)
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter((log) => log.status === filterStatus)
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter((log) => {
        const studentName = log.students?.users?.name?.toLowerCase() || ''
        const studentCode = log.students?.student_code?.toLowerCase() || ''
        const message = log.message?.toLowerCase() || ''
        const phone = log.students?.users?.phone?.toLowerCase() || ''
        const search = searchTerm.toLowerCase()

        return (
          studentName.includes(search) ||
          studentCode.includes(search) ||
          message.includes(search) ||
          phone.includes(search)
        )
      })
    }

    setFilteredLogs(filtered)
  }

  async function handleManualTrigger(type: string) {
    setSending(type)

    try {
      const response = await fetch('/api/notifications/auto-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })

      const result = await response.json()

      if (!response.ok) throw new Error(result.error)

      toast({
        title: '알림 전송 완료',
        description: `${result.count}건의 알림이 전송되었습니다.`,
      })

      loadNotificationLogs()
    } catch (error: any) {
      console.error('Error triggering notification:', error)
      toast({
        title: '전송 오류',
        description: error.message || '알림 전송 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    } finally {
      setSending(null)
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'sent':
        return (
          <Badge variant="outline" className="bg-green-50">
            <CheckCircle className="h-3 w-3 mr-1" />
            전송 완료
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            전송 실패
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  function getTypeBadge(type: string) {
    switch (type) {
      case 'sms':
        return <Badge variant="default">SMS</Badge>
      case 'email':
        return <Badge variant="outline">이메일</Badge>
      default:
        return <Badge variant="secondary">{type}</Badge>
    }
  }

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </PageWrapper>
    )
  }

  const stats = {
    total: logs.length,
    sent: logs.filter((l) => l.status === 'sent').length,
    failed: logs.filter((l) => l.status === 'failed').length,
    sms: logs.filter((l) => l.notification_type === 'sms').length,
    email: logs.filter((l) => l.notification_type === 'email').length,
  }

  return (
    <PageWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">알림 관리</h1>
          <p className="text-muted-foreground">자동 알림 스케줄과 전송 기록을 관리하세요</p>
        </div>

        {/* Auto-notification Schedules */}
        <div className="grid gap-4 md:grid-cols-3">
          {autoNotifications.map((notification) => (
            <Card key={notification.type}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-base">{notification.label}</CardTitle>
                  </div>
                  <Badge variant={notification.enabled ? 'default' : 'secondary'}>
                    {notification.enabled ? '활성' : '비활성'}
                  </Badge>
                </div>
                <CardDescription className="text-xs mt-2">
                  {notification.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>스케줄</span>
                    <span className="font-medium text-foreground">{notification.schedule}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground mt-1">
                    <span>다음 실행</span>
                    <span className="font-medium text-foreground">{notification.nextRun}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleManualTrigger(notification.type)}
                  disabled={sending === notification.type}
                >
                  <Send className="h-3 w-3 mr-2" />
                  {sending === notification.type ? '전송 중...' : '수동 실행'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Report Auto-Send */}
        {reportAutoSendStatus && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <CardTitle>월간 리포트 자동 발송</CardTitle>
                </div>
                <Badge variant="default">활성</Badge>
              </div>
              <CardDescription>
                매월 1일 오전 9시에 전월 리포트를 보호자에게 자동 발송합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">전체 리포트</div>
                  <div className="text-2xl font-bold">{reportAutoSendStatus.total}건</div>
                </div>
                <div>
                  <div className="text-muted-foreground">발송 완료</div>
                  <div className="text-2xl font-bold text-green-600">{reportAutoSendStatus.sent}건</div>
                </div>
                <div>
                  <div className="text-muted-foreground">발송 대기</div>
                  <div className="text-2xl font-bold text-orange-600">{reportAutoSendStatus.pending}건</div>
                </div>
                <div>
                  <div className="text-muted-foreground">이메일 등록</div>
                  <div className="text-2xl font-bold text-blue-600">{reportAutoSendStatus.readyToSend}건</div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-sm text-muted-foreground">
                  다음 자동 발송: {reportAutoSendStatus.nextRun}
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSendReports}
                  disabled={sendingReports || reportAutoSendStatus.pending === 0}
                >
                  <Send className="h-3 w-3 mr-2" />
                  {sendingReports ? '발송 중...' : '즉시 발송'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>전체 알림</CardDescription>
              <CardTitle className="text-3xl">{stats.total}건</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>전송 완료</CardDescription>
              <CardTitle className="text-3xl text-green-600">{stats.sent}건</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>전송 실패</CardDescription>
              <CardTitle className="text-3xl text-red-600">{stats.failed}건</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>SMS</CardDescription>
              <CardTitle className="text-3xl">{stats.sms}건</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>이메일</CardDescription>
              <CardTitle className="text-3xl">{stats.email}건</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="학생명, 학생번호, 메시지, 전화번호로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filterType === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('all')}
            >
              전체
            </Button>
            <Button
              variant={filterType === 'sms' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('sms')}
            >
              SMS
            </Button>
            <Button
              variant={filterType === 'email' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('email')}
            >
              이메일
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant={filterStatus === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('all')}
            >
              전체
            </Button>
            <Button
              variant={filterStatus === 'sent' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('sent')}
            >
              성공
            </Button>
            <Button
              variant={filterStatus === 'failed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('failed')}
            >
              실패
            </Button>
          </div>
        </div>

        {/* Notification Logs */}
        <Card>
          <CardHeader>
            <CardTitle>알림 전송 기록</CardTitle>
            <CardDescription>최근 200건의 알림 전송 기록입니다</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>표시할 알림 기록이 없습니다.</p>
                {searchTerm && <p className="text-sm mt-2">검색 결과가 없습니다.</p>}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>학생</TableHead>
                      <TableHead>유형</TableHead>
                      <TableHead>메시지</TableHead>
                      <TableHead>전송 일시</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {log.students?.users?.name || '이름 없음'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {log.students?.student_code}
                            </div>
                            {log.students?.users?.phone && (
                              <div className="text-xs text-muted-foreground">
                                {log.students.users.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getTypeBadge(log.notification_type)}</TableCell>
                        <TableCell>
                          <div className="max-w-md">
                            <p className="text-sm">{log.message}</p>
                            {log.error_message && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
                                <AlertCircle className="h-3 w-3" />
                                {log.error_message}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(log.sent_at).toLocaleString('ko-KR')}
                        </TableCell>
                        <TableCell>{getStatusBadge(log.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  )
}
