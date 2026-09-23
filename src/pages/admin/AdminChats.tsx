import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/locale'
import { ArrowLeft, MessageCircle, X as XIcon, Send, Loader2, Clock, CheckCircle2 } from 'lucide-react'

interface ChatSession {
  id: string
  customer_name: string | null
  customer_phone: string | null
  intent: string | null
  status: 'open' | 'closed'
  created_at: string
  updated_at: string
  last_message?: string
  message_count?: number
}

interface ChatMessage {
  id: string
  session_id: string
  role: 'customer' | 'agent' | 'bot'
  content: string
  created_at: string
}

export default function AdminChats() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (profile?.role === 'admin') fetchSessions()
  }, [profile, filter])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime subscription for new sessions
  useEffect(() => {
    const channel = supabase
      .channel('admin-chat-sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_sessions' },
        () => { fetchSessions() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [filter])

  // Realtime subscription for messages in selected session
  useEffect(() => {
    if (!selectedSession) return

    const channel = supabase
      .channel(`admin-messages-${selectedSession}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${selectedSession}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedSession])

  async function fetchSessions() {
    setLoading(true)
    let query = supabase
      .from('chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data } = await query
    if (data) {
      // Fetch last message for each session
      const sessionsWithMeta = await Promise.all(
        data.map(async (session) => {
          const { data: msgs } = await supabase
            .from('chat_messages')
            .select('content, role')
            .eq('session_id', session.id)
            .order('created_at', { ascending: false })
            .limit(1)

          const { count } = await supabase
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', session.id)

          return {
            ...session,
            last_message: msgs?.[0]?.content || '',
            message_count: count || 0,
          }
        })
      )
      setSessions(sessionsWithMeta)
    }
    setLoading(false)
  }

  async function openSession(id: string) {
    setSelectedSession(id)
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true })

    setMessages(data || [])
  }

  async function sendReply() {
    if (!reply.trim() || !selectedSession || sending) return
    setSending(true)

    await supabase.from('chat_messages').insert({
      session_id: selectedSession,
      role: 'agent',
      content: reply.trim(),
    })

    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', selectedSession)

    setReply('')
    setSending(false)
  }

  async function closeSession(id: string) {
    await supabase
      .from('chat_sessions')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (selectedSession === id) {
      setSelectedSession(null)
      setMessages([])
    }
    fetchSessions()
  }

  async function reopenSession(id: string) {
    await supabase
      .from('chat_sessions')
      .update({ status: 'open', updated_at: new Date().toISOString() })
      .eq('id', id)
    fetchSessions()
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t('admin.accessDenied')}</p>
      </div>
    )
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return t('chats.justNow')
    if (diffMin < 60) return t('chats.minutesAgo', { n: diffMin })
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return t('chats.hoursAgo', { n: diffHr })
    return formatDate(date)
  }

  function getIntentLabel(intent: string | null) {
    switch (intent) {
      case 'reservation': return t('chats.intent.reservation')
      case 'feedback': return t('chats.intent.feedback')
      case 'availability': return t('chats.intent.availability')
      case 'list_property': return t('chats.intent.listProperty')
      case 'other': return t('chats.intent.other')
      default: return t('chats.intent.general')
    }
  }

  function getIntentColor(intent: string | null) {
    switch (intent) {
      case 'reservation': return 'bg-blue-50 text-blue-700'
      case 'feedback': return 'bg-yellow-50 text-yellow-700'
      case 'availability': return 'bg-green-50 text-green-700'
      case 'list_property': return 'bg-teal-50 text-teal-700'
      case 'other': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const currentSession = sessions.find(s => s.id === selectedSession)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('chats.title')}</h1>
          <p className="text-sm text-gray-500">{t('chats.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-200px)] min-h-[500px]">
        {/* Sessions list */}
        <div className="w-80 shrink-0 bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Filter tabs */}
          <div className="flex border-b border-gray-200 p-2 gap-1 shrink-0">
            {(['open', 'closed', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  filter === f ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t(`chats.filters.${f}`)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                <MessageCircle className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">{filter === 'all' ? t('chats.noChats') : t('chats.noChatsFiltered', { filter: t(`chats.filters.${filter}`) })}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {sessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => openSession(session.id)}
                    className={`w-full text-start p-3 hover:bg-gray-50 transition-colors ${
                      selectedSession === session.id ? 'bg-primary-50 border-r-2 border-primary-600' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getIntentColor(session.intent)}`}>
                        {getIntentLabel(session.intent)}
                      </span>
                      <span className="text-[10px] text-gray-400">{formatTime(session.updated_at)}</span>
                    </div>
                    <p className="text-sm text-gray-800 font-medium truncate">
                      {session.customer_phone || t('chats.chatNumber', { id: session.id.substring(0, 6) })}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {session.last_message || t('chats.noMessagesYet')}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">{t('chats.messageCount', { count: session.message_count })}</span>
                      {session.status === 'open' ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-green-600">
                          <Clock className="w-2.5 h-2.5" /> {t('chats.filters.open')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                          <CheckCircle2 className="w-2.5 h-2.5" /> {t('chats.filters.closed')}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat view */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden">
          {selectedSession ? (
            <>
              {/* Chat header */}
              <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {currentSession?.customer_phone || t('chats.chatNumber', { id: selectedSession.substring(0, 8) })}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t('chats.startedInfo', { intent: getIntentLabel(currentSession?.intent ?? null), time: currentSession ? formatTime(currentSession.created_at) : '' })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {currentSession?.status === 'open' ? (
                    <button
                      onClick={() => closeSession(selectedSession)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                    >
                      <XIcon className="w-3 h-3" />
                      {t('chats.closeChat')}
                    </button>
                  ) : (
                    <button
                      onClick={() => reopenSession(selectedSession)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                    >
                      {t('chats.reopen')}
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'customer' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[70%] ${msg.role === 'customer' ? '' : ''}`}>
                      <div className={`px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                        msg.role === 'customer'
                          ? 'bg-gray-100 text-gray-800 rounded-bl-sm'
                          : msg.role === 'agent'
                          ? 'bg-primary-600 text-white rounded-br-sm'
                          : 'bg-blue-50 text-blue-800 border border-blue-100 rounded-br-sm'
                      }`}>
                        {msg.content}
                      </div>
                      <p className={`text-[10px] text-gray-400 mt-0.5 ${msg.role === 'customer' ? 'text-start' : 'text-end'}`}>
                        {t('chats.senderAt', { sender: msg.role === 'bot' ? t('chats.aiBot') : msg.role === 'agent' ? t('chats.you') : t('chats.customer'), time: formatTime(msg.created_at) })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              {currentSession?.status === 'open' && (
                <div className="border-t border-gray-200 p-3 flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                    placeholder={t('chats.replyPlaceholder')}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    disabled={sending}
                  />
                  <button
                    onClick={sendReply}
                    disabled={!reply.trim() || sending}
                    className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white rounded-xl px-4 py-2.5 transition-colors disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              <MessageCircle className="w-12 h-12 text-gray-300 mb-3" />
              <h3 className="text-lg font-medium text-gray-600">{t('chats.selectConversation')}</h3>
              <p className="text-sm text-gray-400 mt-1">{t('chats.selectConversationHint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
