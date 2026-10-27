import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MessageCircle, X, Send, Loader2, Sparkles, Headphones, CalendarDays, RotateCcw, MapPin, ArrowUpRight, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { functionHeaders } from '../lib/session'
import { chatStayUrl, emptyCriteria, type ChatCriteria, type ChatStay } from '../lib/chatSearch'
import { validDate } from '../lib/booking'
import ChatTripForm from './ChatTripForm'

interface Message { id:string; role:'user'|'assistant'|'agent'; content:string; recommendations?:ChatStay[]; searched?:boolean; suggestions?:string[] }
type Intent='availability'|'reservation'|'feedback'|'list_property'|'other'
const message=(role:Message['role'],content:string):Message=>({id:crypto.randomUUID(),role,content})

export default function ChatBot() {
  const {t,i18n}=useTranslation()
  const [open,setOpen]=useState(false)
  const [messages,setMessages]=useState<Message[]>([])
  const [input,setInput]=useState('')
  const [intent,setIntent]=useState<Intent>('availability')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [criteria,setCriteria]=useState<ChatCriteria>(emptyCriteria)
  const [showTrip,setShowTrip]=useState(false)
  const [cities,setCities]=useState<string[]>([])
  const [sessionId,setSessionId]=useState<string|null>(null)
  const [waiting,setWaiting]=useState(false)
  const [liveAgent,setLiveAgent]=useState(false)
  const panel=useRef<HTMLDivElement>(null)
  const scroller=useRef<HTMLDivElement>(null)
  const inputRef=useRef<HTMLInputElement>(null)
  const launcher=useRef<HTMLButtonElement>(null)
  const request=useRef<AbortController|null>(null)
  const generation=useRef(0)
  const busy=useRef(false)
  const agentActive=useRef(false)
  const pending=useRef<{history:Message[];trip?:ChatCriteria}|null>(null)

  const agentCursor=useRef<{created_at:string;id:string}|null>(null)

  function setBusy(value:boolean) { busy.current=value;setLoading(value) }
  function close() { setOpen(false);setTimeout(()=>launcher.current?.focus(),0) }
  useEffect(()=>{
    if(!open)return
    inputRef.current?.focus()
    function containFocus(event:KeyboardEvent) {
      if(event.key==='Escape') { event.preventDefault();close();return }
      if(event.key!=='Tab')return
      const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')||[]).filter(item=>item.getClientRects().length)
      if(!items.length)return
      const first=items[0],last=items[items.length-1]
      if(event.shiftKey && (document.activeElement===first || !panel.current?.contains(document.activeElement))) {event.preventDefault();last.focus()}
      else if(!event.shiftKey && (document.activeElement===last || !panel.current?.contains(document.activeElement))) {event.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',containFocus)
    return()=>document.removeEventListener('keydown',containFocus)
  },[open])
  useEffect(()=>{
    const area=scroller.current
    if(!area)return
    const last=messages[messages.length-1]
    const turns=area.querySelectorAll('.chat-turn')
    const newest=turns[turns.length-1]
    area.scrollTop=last?.recommendations?.length && newest && !loading
      ? area.scrollTop+newest.getBoundingClientRect().top-area.getBoundingClientRect().top-12 : area.scrollHeight
  },[messages,loading,error])
  useEffect(()=>()=>request.current?.abort(),[])
  useEffect(()=>{ if(!open)return;let active=true;supabase.rpc('chat_stay_catalog').then(({data})=>{if(active && Array.isArray(data?.cities))setCities(data.cities)});return()=>{active=false} },[open])

  // Incremental private polling pauses in hidden tabs and backs off after failures.
  useEffect(()=>{
    if(!open || !sessionId)return
    let active=true,timer:number,abort:AbortController|null=null
    let failures=0,sequence=0
    agentCursor.current=null
    const schedule=(delay:number,run:number)=>{if(active && run===sequence)timer=window.setTimeout(()=>void poll(),delay)}
    const poll=async()=>{
      if(!active)return
      const run=++sequence
      if(document.hidden) {schedule(30000,run);return}
      const controller=new AbortController()
      abort=controller
      const requestTimer=window.setTimeout(()=>controller.abort(),10000)
      try {
        let query=supabase.from('chat_messages').select('id,content,created_at').eq('session_id',sessionId).eq('role','agent').order('created_at').order('id').limit(25)
        if(agentCursor.current) {
          const {created_at,id}=agentCursor.current
          query=query.or(`created_at.gt.${created_at},and(created_at.eq.${created_at},id.gt.${id})`)
        }
        const {data,error}=await query.abortSignal(controller.signal)
        if(error)throw error
        if(!active || run!==sequence)return
        failures=0
        if(data?.length) {
          agentCursor.current=data[data.length-1]
          agentActive.current=true;request.current?.abort();pending.current=null;setError('');setLiveAgent(true);setWaiting(false)
          setMessages(previous=>{const fresh=data.filter(m=>!previous.some(p=>p.id===m.id));return fresh.length?[...previous,...fresh.map(m=>({...m,role:'agent' as const}))]:previous})
        }
        schedule(4000,run)
      } catch {
        if(active && run===sequence) {failures++;schedule(Math.min(30000,4000*2**Math.min(failures-1,3)),run)}
      } finally {
        window.clearTimeout(requestTimer)
        if(abort===controller)abort=null
      }
    }
    const visibility=()=>{
      if(!active)return
      window.clearTimeout(timer)
      if(document.hidden) {sequence++;abort?.abort()}
      else {abort?.abort();void poll()}
    }
    document.addEventListener('visibilitychange',visibility)
    void poll()
    return()=>{active=false;sequence++;window.clearTimeout(timer);abort?.abort();document.removeEventListener('visibilitychange',visibility)}
  },[open,sessionId])

  async function ensureSession(turn:number,signal?:AbortSignal) {
    if(sessionId)return sessionId
    const {data,error}=await supabase.from('chat_sessions').insert({intent,status:'open'}).select('id').abortSignal(signal||AbortSignal.timeout(15000)).single()
    if(error || !data?.id)throw new Error('assistant.connectionError')
    if(turn!==generation.current)throw new DOMException('Aborted','AbortError')
    setSessionId(data.id);return data.id as string
  }
  async function store(sid:string,m:Message,signal?:AbortSignal) {
    const {error}=await supabase.from('chat_messages').insert({id:m.id,session_id:sid,role:m.role==='user'?'customer':m.role==='assistant'?'bot':'agent',content:m.content}).abortSignal(signal||AbortSignal.timeout(15000))
    if(error && error.code!=='23505')throw new Error('assistant.connectionError')
  }
  function reset() {
    generation.current++;request.current?.abort();agentActive.current=false;pending.current=null;setBusy(false);setMessages([]);setInput('');setError('');setCriteria(emptyCriteria);setShowTrip(false);setSessionId(null);setWaiting(false);setLiveAgent(false);setIntent('availability')
  }
  async function send(content:string,trip?:ChatCriteria,retry=false) {
    if(busy.current || (!content.trim() && !retry))return
    const turn=generation.current
    const history=retry && pending.current ? pending.current.history : [...messages,message('user',content.trim())]
    const chosenTrip=retry ? pending.current?.trip : trip
    pending.current={history,trip:chosenTrip};setMessages(history);setInput('');setError('');setBusy(true)
    const abort=new AbortController();request.current=abort
    const timeout=window.setTimeout(()=>abort.abort(),40000)
    try {
      const sid=await ensureSession(turn,abort.signal)
      await store(sid,history[history.length-1],abort.signal)
      if(turn!==generation.current)return
      if(agentActive.current || waiting){pending.current=null;return}
      if(abort.signal.aborted)throw new Error('assistant.connectionError')
      let data:any
      if(chosenTrip) {
        const {data:stays,error}=await supabase.rpc('find_chat_stays',{p_city:chosenTrip.city,p_check_in:chosenTrip.checkIn,p_check_out:chosenTrip.checkOut,p_guests:chosenTrip.guests,p_rooms:chosenTrip.rooms,p_property_type:chosenTrip.propertyType,p_max_total:chosenTrip.maxTotal,p_currency:chosenTrip.currency,p_amenities:chosenTrip.amenities}).abortSignal(abort.signal)
        if(error || !Array.isArray(stays))throw new Error('assistant.searchError')
        data={reply:t(stays.length?'assistant.results':'assistant.noMatches'),criteria:chosenTrip,recommendations:stays,searched:true}
      } else {
        const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chatbot`,{method:'POST',signal:abort.signal,
          headers:{'Content-Type':'application/json',...functionHeaders()},body:JSON.stringify({sessionId:sid,intent,language:i18n.language,criteria,
            messages:history.slice(-16).map(m=>({role:m.role==='user'?'user':'assistant',content:m.content.slice(0,2000)}))})})
        data=await response.json()
        if(!response.ok || data.error)throw new Error(response.status===429?'assistant.rateLimit':'assistant.connectionError')
      }
      if(turn!==generation.current || agentActive.current)return
      if(abort.signal.aborted)throw new Error('assistant.connectionError')
      const recommendations=Array.isArray(data.recommendations)?[...new Map<string,ChatStay>(data.recommendations.map((s:ChatStay)=>[s.id,s])).values()].slice(0,3):[]
      const reply:Message={...message('assistant',typeof data.reply==='string' && data.reply.trim()?data.reply:t(data.searched?(recommendations.length?'assistant.results':'assistant.noMatches'):'assistant.completeTrip')),
        searched:data.searched===true,recommendations,suggestions:Array.isArray(data.suggestions)?data.suggestions.slice(0,3):[]}
      setMessages(previous=>[...previous,reply]);if(data.criteria)setCriteria(data.criteria)
      setShowTrip(false);pending.current=null
      // A logging failure must not discard a successful search or repeat the AI turn.
      await store(sid,reply).catch(()=>{})
    } catch(failure) {
      if(turn===generation.current && !agentActive.current)setError(failure instanceof Error && failure.message.startsWith('assistant.')?failure.message:'assistant.connectionError')
    } finally { window.clearTimeout(timeout);if(turn===generation.current)setBusy(false) }
  }
  async function requestAgent() {
    if(busy.current || waiting || liveAgent)return
    setBusy(true);setError('');const turn=generation.current
    try {
      const sid=await ensureSession(turn)
      const {error}=await supabase.rpc('request_chat_agent',{p_session:sid}).abortSignal(AbortSignal.timeout(15000))
      if(error)throw error
      if(turn!==generation.current)return
      setWaiting(true);const notice=message('assistant',t('assistant.agentWaiting'));setMessages(previous=>[...previous,notice]);await store(sid,notice).catch(()=>{})
    } catch { if(turn===generation.current)setError('assistant.connectionError') }
    finally { if(turn===generation.current)setBusy(false) }
  }
  const latest=messages[messages.length-1]
  const locale=i18n.language==='kmr'?'ar-IQ':i18n.language
  const formatDate=(value:string)=>!validDate(value)?'':new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`))

  return <>
    {!open && <button ref={launcher} className="chat-launcher" onClick={()=>setOpen(true)} aria-label={t('chatbot.openChat')}><MessageCircle size={23}/><span>{t('assistant.findStays')}</span></button>}
    {open && <div ref={panel} role="dialog" aria-modal="true" aria-label={t('chatbot.title')} className="stay-chat">
      <header className="stay-chat-header"><div className="stay-chat-avatar"><Sparkles size={21}/></div><div className="stay-chat-heading"><strong>{t('chatbot.title')}</strong><span>{t(liveAgent?'chatbot.connectedToAgent':waiting?'assistant.waiting':'assistant.subtitle')}</span></div>
        <button type="button" onClick={reset} aria-label={t('chatbot.newConversation')} title={t('chatbot.newConversation')}><RotateCcw size={18}/></button>
        <button type="button" onClick={close} aria-label={t('chatbot.closeChat')}><X size={21}/></button></header>
      <div className="stay-chat-messages" ref={scroller} role="log" aria-live="polite" aria-relevant="additions text">
        {!messages.length && <div className="chat-welcome"><span className="chat-welcome-icon"><Sparkles size={28}/></span><h2>{t('assistant.welcome')}</h2><p>{t('assistant.intro')}</p>
          <div className="chat-start-actions"><button type="button" onClick={()=>void send(t('assistant.start'))}>{t('assistant.start')}</button><button type="button" onClick={()=>setShowTrip(true)}>{t('assistant.chooseDates')}</button></div>
          <div className="chat-help-options">{(['reservation','list_property','feedback','other'] as Intent[]).map(option=><button type="button" key={option} onClick={()=>{setIntent(option);setMessages([message('assistant',t(option==='reservation'?'assistant.reservationIntro':`chatbot.greeting.${option==='list_property'?'listProperty':option}`))])}}>{t(`chatbot.menu.${option}`)}</button>)}</div>
        </div>}
        {messages.map((m,index)=><div key={m.id} className={`chat-turn chat-turn-${m.role}`}>
          <div className="chat-bubble" dir="auto">{m.role==='agent' && <small>{t('chatbot.liveAgent')}</small>}{m.content}</div>
          {m.searched && index===messages.length-1 && !loading && <div className="chat-results">
            {m.recommendations?.map((stay,n)=><article key={stay.id} className="chat-stay-card">
              <div className="chat-stay-image">{stay.image && /^https?:\/\//.test(stay.image)?<img src={stay.image} alt="" loading="lazy"/>:<Building2 size={30}/>}<span>{n+1}</span></div>
              <div className="chat-stay-info"><h3 dir="auto">{stay.name}</h3><p><MapPin size={13} aria-hidden="true"/>{stay.city}</p><p className="chat-stay-dates"><time dateTime={stay.checkIn}>{formatDate(stay.checkIn)}</time> <span aria-hidden="true">→</span> <time dateTime={stay.checkOut}>{formatDate(stay.checkOut)}</time></p>
                <p dir="auto">{stay.roomName}</p><p>{t('common.guestCount',{count:stay.guests})} · {t('common.roomCount',{count:stay.rooms})}</p>
                <div className="chat-stay-price"><strong>{new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(stay.total)} <bdi>{stay.currency}</bdi></strong><span>{t('common.total')} · {t('common.nightCount',{count:stay.nights})}</span></div>
                <Link to={chatStayUrl(stay)} onClick={close}>{t('assistant.bookStay')}<ArrowUpRight size={16}/></Link></div>
            </article>)}
            {!!m.recommendations?.length && <p className="chat-result-note">{t('assistant.availabilityNote')}</p>}
          </div>}
        </div>)}
        {loading && <div className="chat-thinking" role="status"><Loader2 size={17} className="animate-spin"/>{t('assistant.thinking')}</div>}
        {error && <div className="chat-error" role="alert"><p>{t(error)}</p>{pending.current && <button type="button" disabled={loading} onClick={()=>void send('',undefined,true)}>{t('assistant.retry')}</button>}<button type="button" onClick={()=>setShowTrip(true)}>{t('assistant.chooseDates')}</button></div>}
        {!loading && latest?.role==='assistant' && !waiting && !liveAgent && !error && <div className="chat-suggestions">{latest.suggestions?.map(s=><button key={s} type="button" onClick={()=>void send(s)} dir="auto">{s}</button>)}</div>}
      </div>
      {showTrip && <div className="chat-trip-panel"><div><strong>{t('assistant.tripDetails')}</strong><button type="button" onClick={()=>setShowTrip(false)} aria-label={t('common.cancel')}><X size={18}/></button></div>
        <ChatTripForm key={JSON.stringify(criteria)} criteria={criteria} cities={cities} busy={loading} onSearch={trip=>void send(`${trip.city}: ${trip.checkIn} → ${trip.checkOut}, ${t('common.guestCount',{count:trip.guests})}, ${t('common.roomCount',{count:trip.rooms})}`,trip)}/></div>}
      <div className="chat-tools"><button type="button" disabled={loading || waiting || liveAgent} onClick={()=>setShowTrip(!showTrip)}><CalendarDays size={15}/>{t('assistant.tripDetails')}</button>
        <button type="button" disabled={loading || waiting || liveAgent} onClick={()=>void requestAgent()}><Headphones size={15}/>{t('chatbot.talkToAgent')}</button></div>
      {intent==='list_property' && <Link className="chat-context-link" to="/add-accommodation" onClick={close}>{t('ux.listProperty')}<ArrowUpRight size={15}/></Link>}
      {intent==='reservation' && <Link className="chat-context-link" to="/profile" onClick={close}>{t('common.myProfile')}<ArrowUpRight size={15}/></Link>}
      <form className="chat-composer" onSubmit={e=>{e.preventDefault();void send(input)}}><input ref={inputRef} dir="auto" aria-label={t('assistant.message')} value={input} maxLength={1500} onChange={e=>setInput(e.target.value)} placeholder={t(waiting||liveAgent?'chatbot.inputPlaceholderAgent':'assistant.placeholder')} disabled={loading}/>
        <button type="submit" disabled={loading || !input.trim()} aria-label={t('assistant.send')}><Send size={19}/></button></form>
    </div>}
  </>
}
