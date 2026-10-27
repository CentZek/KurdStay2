import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { ArrowLeft, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/locale'
import { format, addDays, parseISO } from 'date-fns'

interface RoomType {
  id: string
  name: string
  base_price: number
}

interface AvailabilityRow {
  id?: string
  room_type_id: string
  date: string
  available_rooms: number
  base_price_override: number | null
  is_closed: boolean
}

const days = 14

export default function OwnerAvailability() {
  const { hotelId } = useParams()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const roomRequest = useRef(0)
  const availabilityRequest = useRef(0)
  const viewRef = useRef('')
  const [currency, setCurrency] = useState('USD')
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [selectedRoom, setSelectedRoom] = useState('')
  const [availability, setAvailability] = useState<AvailabilityRow[]>([])
  const [loadedView, setLoadedView] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saveError, setSaveError] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const currentView = selectedRoom && startDate ? `${selectedRoom}:${startDate}` : ''
  viewRef.current = currentView

  useEffect(() => {
    if (profile?.role !== 'hotel_owner' && profile?.role !== 'admin') return
    const currentRequest = ++roomRequest.current
    setLoading(true)
    setRoomTypes([])
    setSelectedRoom('')
    setAvailability([])
    setLoadedView('')

    async function fetchRoomTypes() {
      try {
        const [hotelRes, roomsRes] = await Promise.all([
          supabase.from('hotels').select('currency').eq('id', hotelId).maybeSingle(),
          supabase.from('room_types').select('id, name, base_price').eq('hotel_id', hotelId),
        ])
        if (currentRequest !== roomRequest.current) return
        if (hotelRes.error || roomsRes.error) {
          setSaveError(true)
          setFeedback(t('common.errorOccurred'))
          return
        }
        setCurrency(hotelRes.data?.currency || 'USD')
        setRoomTypes(roomsRes.data || [])
        if (roomsRes.data && roomsRes.data.length > 0) setSelectedRoom(roomsRes.data[0].id)
      } catch {
        if (currentRequest !== roomRequest.current) return
        setSaveError(true)
        setFeedback(t('common.errorOccurred'))
      } finally {
        if (currentRequest === roomRequest.current) setLoading(false)
      }
    }

    fetchRoomTypes()
    return () => { roomRequest.current += 1 }
  }, [hotelId, profile?.role, t])

  useEffect(() => {
    const currentRequest = ++availabilityRequest.current
    setLoadedView('')
    setAvailability([])
    if (!currentView) {
      setFetching(false)
      return
    }
    setFetching(true)
    const roomId = selectedRoom
    const viewStart = startDate

    async function fetchAvailability() {
      try {
        const endDate = format(addDays(parseISO(viewStart), days - 1), 'yyyy-MM-dd')
        const { data, error } = await supabase
          .from('room_availability')
          .select('*')
          .eq('room_type_id', roomId)
          .gte('date', viewStart)
          .lte('date', endDate)
        if (currentRequest !== availabilityRequest.current || viewRef.current !== currentView) return
        if (error) {
          setSaveError(true)
          setFeedback(t('common.errorOccurred'))
          return
        }
        const existingMap = new Map((data || []).map(row => [row.date, row]))
        const rows: AvailabilityRow[] = []
        for (let i = 0; i < days; i++) {
          const date = format(addDays(parseISO(viewStart), i), 'yyyy-MM-dd')
          rows.push(existingMap.get(date) || {
            room_type_id: roomId,
            date,
            available_rooms: 0,
            base_price_override: null,
            is_closed: false,
          })
        }
        setAvailability(rows)
        setLoadedView(currentView)
      } catch {
        if (currentRequest !== availabilityRequest.current || viewRef.current !== currentView) return
        setSaveError(true)
        setFeedback(t('common.errorOccurred'))
      } finally {
        if (currentRequest === availabilityRequest.current) setFetching(false)
      }
    }

    fetchAvailability()
    return () => { availabilityRequest.current += 1 }
  }, [currentView, selectedRoom, startDate, t])

  function updateRow(index: number, field: keyof AvailabilityRow, value: number | boolean | null) {
    setFeedback('')
    setSaveError(false)
    setAvailability(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  function changeView(room: string, date: string) {
    viewRef.current = room && date ? `${room}:${date}` : ''
    availabilityRequest.current += 1
    setLoadedView('')
    setAvailability([])
    setFetching(Boolean(room && date))
    setFeedback('')
    setSaveError(false)
  }

  async function handleSave() {
    const saveView = currentView
    const requestAtStart = availabilityRequest.current
    if (saving || fetching || !saveView || loadedView !== saveView || !availability.length) return
    if (availability.some(row => row.room_type_id !== selectedRoom || row.date < startDate || row.date > format(addDays(parseISO(startDate), days - 1), 'yyyy-MM-dd'))) return

    setSaving(true)
    setFeedback('')
    setSaveError(false)
    try {
      const { data, error } = await supabase.from('room_availability').upsert(
        availability.map(row => ({
          room_type_id: row.room_type_id,
          date: row.date,
          available_rooms: Math.max(0, Math.floor(row.available_rooms)),
          base_price_override: row.base_price_override === null ? null : Math.max(0, row.base_price_override),
          is_closed: row.is_closed,
        })),
        { onConflict: 'room_type_id,date' },
      ).select('room_type_id,date')
      if (error || data?.length !== availability.length) throw error || new Error('Availability was not saved')
      if (viewRef.current !== saveView || availabilityRequest.current !== requestAtStart) return
      setFeedback(t('ux.saved'))
    } catch {
      if (viewRef.current !== saveView || availabilityRequest.current !== requestAtStart) return
      setSaveError(true)
      setFeedback(t('common.errorOccurred'))
    } finally {
      setSaving(false)
    }
  }

  if (profile?.role !== 'hotel_owner' && profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('owner.accessDenied')}</p></div>
  }

  const saveDisabled = saving || fetching || !availability.length || loadedView !== currentView

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="availability-heading flex items-center gap-3 mb-8">
        <Link to="/owner" aria-label={t('common.back')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex-1">{t('owner.availability')}</h1>
        <button onClick={handleSave} disabled={saveDisabled}
          className="bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors flex items-center gap-2 disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? t('ux.saving') : t('common.save')}
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-5">{t('ux.availabilityHelp')}</p>
      {feedback && <div role={saveError ? 'alert' : 'status'} className={`feedback-message ${saveError ? 'error' : ''}`}>{feedback}</div>}
      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : roomTypes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">{t('owner.addRoomTypesFirst')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <select aria-label={t('owner.roomTypes')} disabled={saving || fetching} value={selectedRoom} onChange={e => { changeView(e.target.value, startDate); setSelectedRoom(e.target.value) }}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              {roomTypes.map(room => <option key={room.id} value={room.id}>{room.name} ({Number(room.base_price).toLocaleString()} {currency}/{t('common.night')})</option>)}
            </select>
            <input type="date" aria-label={t('common.date')} disabled={saving || fetching} value={startDate} onChange={e => { if (e.target.value) { changeView(selectedRoom, e.target.value); setStartDate(e.target.value) } }}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="availability-table w-full text-sm" aria-busy={fetching}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">{t('common.date')}</th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">{t('owner.availableRooms')}</th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">{t('owner.priceOverride')}</th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">{t('owner.closedDate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {availability.map((row, i) => (
                    <tr key={row.date} className={row.is_closed ? 'bg-red-50/50' : ''}>
                      <td data-label={t('common.date')} className="px-4 py-3 font-medium text-gray-900">
                        {formatDate(new Date(row.date + 'T00:00:00'), { weekday: 'short', month: 'short', day: 'numeric' })}
                      </td>
                      <td data-label={t('owner.availableRooms')} className="px-4 py-3">
                        <input aria-label={`${t('owner.availableRooms')} ${row.date}`} type="number" min="0" value={row.available_rooms}
                          onChange={e => updateRow(i, 'available_rooms', parseInt(e.target.value) || 0)}
                          disabled={row.is_closed || saving || fetching}
                          className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50" />
                      </td>
                      <td data-label={t('owner.priceOverride')} className="px-4 py-3">
                        <input aria-label={`${t('owner.priceOverride')} ${row.date}`} type="number" step="0.01" min="0"
                          value={row.base_price_override ?? ''}
                          onChange={e => updateRow(i, 'base_price_override', e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder={t('owner.defaultPlaceholder')}
                          disabled={row.is_closed || saving || fetching}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50" />
                      </td>
                      <td data-label={t('owner.closedDate')} className="px-4 py-3">
                        <input aria-label={`${t('owner.closedDate')} ${row.date}`} disabled={saving || fetching} type="checkbox" checked={row.is_closed}
                          onChange={e => updateRow(i, 'is_closed', e.target.checked)}
                          className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
