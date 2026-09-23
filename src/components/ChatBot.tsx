import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle, X, Send, Loader2, Bot, User, Headphones } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Message {
  role: 'user' | 'assistant' | 'agent'
  content: string
}

type Intent = '' | 'reservation' | 'feedback' | 'availability' | 'list_property' | 'other'

const MENU_OPTIONS = [
  { id: 'reservation' as Intent, emoji: '📋' },
  { id: 'feedback' as Intent, emoji: '⭐' },
  { id: 'availability' as Intent, emoji: '🔍' },
  { id: 'list_property' as Intent, emoji: '🏨' },
  { id: 'other' as Intent, emoji: '💬' },
]

export default function ChatBot() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [intent, setIntent] = useState<Intent>('')
  const [showMenu, setShowMenu] = useState(true)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [liveAgent, setLiveAgent] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open && inputRef.current && !showMenu) {
      inputRef.current.focus()
    }
  }, [open, showMenu])

  // Listen for agent messages via realtime
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`chat-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const msg = payload.new as { role: string; content: string }
          if (msg.role === 'agent') {
            setLiveAgent(true)
            setMessages(prev => [...prev, { role: 'agent', content: msg.content }])
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  async function createSession(selectedIntent: Intent) {
    const { data } = await supabase
      .from('chat_sessions')
      .insert({ intent: selectedIntent, status: 'open' })
      .select('id')
      .maybeSingle()
    if (data) {
      setSessionId(data.id)
      return data.id
    }
    return null
  }

  async function storeMessage(sid: string, role: string, content: string) {
    await supabase.from('chat_messages').insert({ session_id: sid, role, content })
  }

  function handleOpen() {
    setOpen(true)
    if (messages.length === 0) {
      setShowMenu(true)
    }
  }

  function handleClose() {
    setOpen(false)
  }

  function handleReset() {
    setMessages([])
    setIntent('')
    setShowMenu(true)
    setInput('')
    setSessionId(null)
    setLiveAgent(false)
  }

  const requestLiveAgent = useCallback(async () => {
    if (!sessionId) return
    setLiveAgent(true)
    const agentMsg = t('chatbot.agentConnected')
    setMessages(prev => [...prev, { role: 'assistant', content: agentMsg }])
    await storeMessage(sessionId, 'bot', agentMsg)
  }, [sessionId, t])

  async function sendMessage(content: string) {
    const newMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setInput('')

    let sid = sessionId
    if (!sid) {
      sid = await createSession(intent)
      if (!sid) return
    }

    await storeMessage(sid, 'customer', content)

    // If in live agent mode, don't call AI - just store and wait for agent reply
    if (liveAgent) {
      return
    }

    setLoading(true)

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chatbot`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role === 'agent' ? 'assistant' : m.role === 'user' ? 'user' : 'assistant', content: m.content })),
          intent,
          siteUrl: window.location.origin,
          language: i18n.language,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      const reply = data.error ? t('chatbot.errorGeneric') : data.reply
      setMessages([...newMessages, { role: 'assistant', content: reply }])
      await storeMessage(sid, 'bot', reply)
    } catch {
      const errMsg = t('chatbot.errorConnect')
      setMessages([...newMessages, { role: 'assistant', content: errMsg }])
      await storeMessage(sid, 'bot', errMsg)
    } finally {
      setLoading(false)
    }
  }

  async function handleMenuSelect(selectedIntent: Intent) {
    setIntent(selectedIntent)
    setShowMenu(false)

    const sid = await createSession(selectedIntent)

    const label = selectedIntent ? t(`chatbot.menu.${selectedIntent}`) : ''
    const assistantGreeting = getIntentGreeting(selectedIntent)
    setMessages([{ role: 'user', content: label }, { role: 'assistant', content: assistantGreeting }])

    if (sid) {
      await storeMessage(sid, 'customer', label)
      await storeMessage(sid, 'bot', assistantGreeting)
    }
  }

  function getIntentGreeting(selectedIntent: Intent): string {
    switch (selectedIntent) {
      case 'reservation':
        return t('chatbot.greeting.reservation')
      case 'feedback':
        return t('chatbot.greeting.feedback')
      case 'availability':
        return t('chatbot.greeting.availability')
      case 'list_property':
        return t('chatbot.greeting.listProperty')
      case 'other':
        return t('chatbot.greeting.other')
      default:
        return t('chatbot.greeting.default')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return
    sendMessage(input.trim())
  }

  return (
    <>
      {!open && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          aria-label={t('chatbot.openChat')}
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="bg-primary-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <div>
                <p className="text-sm font-semibold">{t('chatbot.title')}</p>
                <p className="text-[10px] opacity-80">
                  {liveAgent ? t('chatbot.connectedToAgent') : t('chatbot.replyInstantly')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && !liveAgent && (
                <button
                  onClick={requestLiveAgent}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-[10px] font-medium flex items-center gap-1"
                  title={t('chatbot.talkToAgent')}
                >
                  <Headphones className="w-3 h-3" />
                  {t('chatbot.agent')}
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={handleReset}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-[10px] font-medium"
                  title={t('chatbot.newConversation')}
                >
                  {t('chatbot.new')}
                </button>
              )}
              <button
                onClick={handleClose}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                aria-label={t('chatbot.closeChat')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {showMenu ? (
              <div className="space-y-3">
                <div className="bg-gray-100 rounded-xl rounded-tl-sm px-3 py-2.5 text-sm text-gray-800 max-w-[85%]">
                  {t('chatbot.welcome')}
                </div>
                <div className="space-y-2">
                  {MENU_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleMenuSelect(option.id)}
                      className="w-full text-start px-3 py-2.5 bg-white border border-gray-200 hover:border-primary-300 hover:bg-primary-50 rounded-xl text-sm text-gray-700 transition-all flex items-center gap-2.5 group"
                    >
                      <span className="text-base">{option.emoji}</span>
                      <span className="group-hover:text-primary-700 transition-colors">{t(`chatbot.menu.${option.id}`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-end gap-1.5 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        msg.role === 'user' ? 'bg-primary-100' : msg.role === 'agent' ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                        {msg.role === 'user' ? (
                          <User className="w-3 h-3 text-primary-600" />
                        ) : msg.role === 'agent' ? (
                          <Headphones className="w-3 h-3 text-green-600" />
                        ) : (
                          <Bot className="w-3 h-3 text-gray-600" />
                        )}
                      </div>
                      <div className={`px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white rounded-br-sm'
                          : msg.role === 'agent'
                          ? 'bg-green-50 text-gray-800 border border-green-200 rounded-bl-sm'
                          : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                      }`}>
                        {msg.role === 'agent' && <p className="text-[10px] text-green-600 font-medium mb-0.5">{t('chatbot.liveAgent')}</p>}
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-end gap-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-100">
                        <Bot className="w-3 h-3 text-gray-600" />
                      </div>
                      <div className="bg-gray-100 rounded-xl rounded-bl-sm px-3 py-2.5">
                        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {!showMenu && (
            <form onSubmit={handleSubmit} className="border-t border-gray-100 p-3 flex gap-2 shrink-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={liveAgent ? t('chatbot.inputPlaceholderAgent') : t('chatbot.inputPlaceholder')}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white rounded-xl p-2.5 transition-colors disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      )}
    </>
  )
}
