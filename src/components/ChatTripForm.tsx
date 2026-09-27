import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatCriteria } from '../lib/chatSearch'
import { amenityLabel } from '../lib/amenities'

export default function ChatTripForm({criteria,cities,busy,onSearch}: {criteria:ChatCriteria;cities:string[];busy:boolean;onSearch:(value:ChatCriteria)=>void}) {
  const {t}=useTranslation()
  const [draft,setDraft]=useState({...criteria,guests:criteria.guests || 2})
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baghdad',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  return <form className="chat-trip-form" onSubmit={e=>{e.preventDefault();if(draft.checkIn && draft.checkOut && draft.checkOut>draft.checkIn)onSearch(draft)}}>
    <label className="chat-trip-city">{t('common.location')}<select aria-label={t('common.location')} required value={draft.city || ''} onChange={e=>setDraft({...draft,city:e.target.value})}>
      <option value="" disabled>{t('assistant.chooseCity')}</option><option value="*">{t('assistant.anywhere')}</option>
      {[...new Set([...cities,...(criteria.city && criteria.city!=='*' ? [criteria.city] : [])])].map(city=><option key={city} value={city}>{city}</option>)}</select></label>
    <label>{t('common.checkIn')}<input required type="date" min={today} value={draft.checkIn || ''} onChange={e=>setDraft({...draft,checkIn:e.target.value,checkOut:draft.checkOut && draft.checkOut>e.target.value ? draft.checkOut : null})}/></label>
    <label>{t('common.checkOut')}<input required type="date" min={draft.checkIn ? new Date(Date.parse(draft.checkIn)+86400000).toISOString().slice(0,10) : today} value={draft.checkOut || ''} onChange={e=>setDraft({...draft,checkOut:e.target.value})}/></label>
    <label>{t('common.guests')}<input required type="number" min={1} max={100} value={draft.guests} onChange={e=>setDraft({...draft,guests:Number(e.target.value)})}/></label>
    <label>{t('common.rooms')}<input required type="number" min={1} max={5} value={draft.rooms} onChange={e=>setDraft({...draft,rooms:Number(e.target.value)})}/></label>
    <details className="chat-trip-preferences" open={!!(draft.maxTotal || draft.propertyType || draft.amenities.length)}><summary>{t('assistant.preferences')}</summary>
      <label>{t('addProperty.propertyType')}<select aria-label={t('addProperty.propertyType')} value={draft.propertyType||''} onChange={e=>setDraft({...draft,propertyType:e.target.value||null})}>
        <option value="">{t('propertyTypes.all')}</option>{['hotel','farm','motel','apartment','villa'].map(type=><option key={type} value={type}>{t(`propertyTypesSingular.${type}`)}</option>)}</select></label>
      <label>{t('assistant.maxBudget')}<input type="number" min={1} max={1e10} step="any" value={draft.maxTotal??''} onChange={e=>setDraft({...draft,maxTotal:e.target.value?Number(e.target.value):null})}/></label>
      <label>{t('addProperty.currency')}<select aria-label={t('addProperty.currency')} required={!!draft.maxTotal} value={draft.currency||''} onChange={e=>setDraft({...draft,currency:e.target.value||null})}><option value="">—</option><option value="USD">USD</option><option value="IQD">IQD</option></select></label>
      {!!draft.amenities.length && <div className="chat-filter-chips">{draft.amenities.map(a=><button type="button" key={a} onClick={()=>setDraft({...draft,amenities:draft.amenities.filter(item=>item!==a)})} aria-label={`${t('common.delete')}: ${amenityLabel(t,a)}`}>{amenityLabel(t,a)} ×</button>)}</div>}
    </details>
    <button type="submit" disabled={busy}>{t('assistant.findStays')}</button>
  </form>
}
