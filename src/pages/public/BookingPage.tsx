import { functionHeaders } from '../../lib/session'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format, addDays, parseISO, isValid } from 'date-fns'
import { AlertCircle, ArrowLeft, CalendarCheck, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/locale'
import {
  baghdadToday, bookingErrorKey, clearBookingRequest, normalizeOccupancy, pendingBookingRequests,
  reusableBookingRequest, saveBookingRequest, stayNights, validDate, type PendingBookingRequest,
} from '../../lib/booking'

interface Hotel {
  id: string
  name: string
  city: string
  profit_margin_percentage: number
  currency: string
}

interface RoomType {
  id: string
  name: string
  base_price: number
  max_guests: number
}

export default function BookingPage() {
  const { hotelId, roomTypeId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [hotel, setHotel] = useState<Hotel | null>(null)
  const [roomType, setRoomType] = useState<RoomType | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [quoteError, setQuoteError] = useState('')
  const [quoting, setQuoting] = useState(false)
  const [quoteRevision, setQuoteRevision] = useState(0)
  const [quote, setQuote] = useState<{ key: string; nights: number; finalPriceTotal: number } | null>(null)
  const submittingRef = useRef(false)
  const requestRef = useRef<PendingBookingRequest | null>(null)
  const submissionRef = useRef(0)
  const dataRequestRef = useRef(0)
  const confirmationStarted = useRef(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const today = baghdadToday()
  const initialOccupancy = normalizeOccupancy(searchParams.get('guests'), searchParams.get('rooms'))

  const [checkIn, setCheckIn] = useState(validDate(searchParams.get('checkIn') || '') ? searchParams.get('checkIn')! : '')
  const [checkOut, setCheckOut] = useState(validDate(searchParams.get('checkOut') || '') ? searchParams.get('checkOut')! : '')
  const [guests, setGuests] = useState(String(initialOccupancy.guests))
  const [rooms, setRooms] = useState(String(initialOccupancy.rooms))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (profile) { setName(value => value || profile.name || ''); setEmail(value => value || profile.email || ''); setPhone(value => value || profile.phone || '') }
  }, [profile])

  useEffect(() => {
    submissionRef.current += 1
    submittingRef.current = false
    setSubmitting(false)
    requestRef.current = null
    fetchData()
    return () => {
      dataRequestRef.current += 1
      submissionRef.current += 1
    }
  }, [hotelId, roomTypeId])

  useEffect(() => {
    let active = true
    async function recoverRequests() {
      for (const request of pendingBookingRequests(hotelId, roomTypeId)) {
        const { data } = await supabase.from('bookings').select('id').eq('request_id', request.id).maybeSingle()
        if (!active) return
        if (data) {
          confirmationStarted.current = true
          dataRequestRef.current += 1
          clearBookingRequest(request)
          navigate(`/booking/confirmation/${data.id}`, { replace: true })
          return
        }
      }
    }
    recoverRequests().catch(() => {})
    return () => { active = false }
  }, [hotelId, roomTypeId, navigate])

  async function fetchData() {
    const requestId = ++dataRequestRef.current
    setLoading(true)
    setFormError('')
    try {
      const [hotelRes, roomRes] = await Promise.all([
        supabase.from('hotels').select('id, name, city, profit_margin_percentage, currency').eq('id', hotelId).eq('status', 'active').maybeSingle(),
        supabase.from('room_types').select('id, name, base_price, max_guests').eq('id', roomTypeId).eq('hotel_id', hotelId).maybeSingle(),
      ])
      if (requestId !== dataRequestRef.current) return
      if (hotelRes.error || roomRes.error) setFormError(t('common.errorOccurred'))
      setHotel(hotelRes.data)
      setRoomType(roomRes.data)
      if (roomRes.data) {
        const occupancy = normalizeOccupancy(guests, rooms, roomRes.data.max_guests)
        setGuests(String(occupancy.guests))
        setRooms(String(occupancy.rooms))
      }
      setLoading(false)
    } catch {
      if (requestId !== dataRequestRef.current) return
      setFormError(t('common.errorOccurred'))
      setHotel(null)
      setRoomType(null)
      setLoading(false)
    }
  }

  // Keep URL normalization out of the data-request completion: an asynchronous
  // completion must not navigate back over a recovered booking confirmation.
  useEffect(() => {
    if (roomType && !confirmationStarted.current) syncCheckoutParams({ guests, rooms })
  }, [roomType, guests, rooms])

  function syncCheckoutParams(changes: Record<string, string | null>) {
    if (confirmationStarted.current) return
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    if (params.toString() !== searchParams.toString()) setSearchParams(params, { replace: true })
  }

  const quoteKey = [hotelId, roomTypeId, checkIn, checkOut, guests, rooms].join('|')
  const pricing = quote?.key === quoteKey ? quote : null

  useEffect(() => {
    let active = true
    setQuote(null)
    setQuoteError('')
    if (!hotel || !roomType || !stayNights(checkIn, checkOut) || checkIn < today) {
      if (checkIn && checkOut) setQuoteError(checkIn < today ? 'booking.pastDate' : 'booking.invalidDates')
      setQuoting(false)
      return
    }
    setQuoting(true)
    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('get_booking_quote', {
          p_hotel_id: hotel.id, p_room_type_id: roomType.id, p_check_in: checkIn,
          p_check_out: checkOut, p_guests: Number(guests), p_rooms: Number(rooms),
        })
        if (!active) return
        if (error) setQuoteError(bookingErrorKey(error.message))
        else if (data) setQuote({ ...data, key: quoteKey })
      } catch { if (active) setQuoteError('booking.submitFailed') }
      finally { if (active) setQuoting(false) }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [hotel, roomType, quoteKey, quoteRevision, today])

  useEffect(() => {
    if (formError) errorRef.current?.focus()
  }, [formError])

  function formatPrice(amount: number) {
    if (!hotel) return `$${amount.toFixed(2)}`
    if (hotel.currency === 'IQD') return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} IQD`
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current || !hotel || !roomType) return
    if (!Number.isInteger(Number(guests)) || Number(guests) < 1 || Number(guests) > roomType.max_guests * Number(rooms)) { setFormError(t('ux.guestCapacity')); return }
    if (!pricing || pricing.nights <= 0) {
      setFormError(t('booking.invalidDates'))
      return
    }
    if (checkIn < baghdadToday()) {
      setFormError(t('booking.pastDate'))
      return
    }
    if (checkOut <= checkIn) {
      setFormError(t('booking.invalidDates'))
      return
    }
    if (!name.trim() || !email.trim()) { setFormError(t('booking.invalidContact')); return }
    setFormError('')
    submittingRef.current = true
    setSubmitting(true)
    const submissionId = ++submissionRef.current
    const payload = {
      p_hotel_id: hotel.id, p_room_type_id: roomType.id, p_name: name.trim(), p_email: email.trim(),
      p_phone: phone.trim(), p_check_in: checkIn, p_check_out: checkOut,
      p_guests: Number(guests), p_rooms: Number(rooms), p_notes: notes.trim(),
      p_expected_total: pricing.finalPriceTotal,
    }
    const fingerprint = JSON.stringify(payload)
    try {
      const request = requestRef.current?.payload === fingerprint
        ? requestRef.current
        : reusableBookingRequest(fingerprint) || { payload: fingerprint, id: crypto.randomUUID() }
      requestRef.current = request
      saveBookingRequest(request)
      const { data, error } = await supabase.rpc('create_booking', { ...payload, p_request_id: request.id })
      if (submissionId !== submissionRef.current) {
        if (data) clearBookingRequest(request)
        return
      }
      if (error || !data) {
        setFormError(t(bookingErrorKey(error?.message || '')))
        if (/ROOM_UNAVAILABLE|PROPERTY_UNAVAILABLE|PRICE_CHANGED|INVALID_/.test(error?.message || '')) {
          setQuoteRevision(value => value + 1)
        }
        return
      }
      confirmationStarted.current = true
      dataRequestRef.current += 1
      clearBookingRequest(request)
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...functionHeaders() },
        body: JSON.stringify({ type: 'booking_created', booking_id: data }),
      }).catch(() => {})
      navigate(`/booking/confirmation/${data}`, { replace: true })
    } catch {
      if (submissionId === submissionRef.current) setFormError(t('booking.submitFailed'))
    } finally {
      if (submissionId === submissionRef.current) {
        submittingRef.current = false
        setSubmitting(false)
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">{t('common.loading')}</div>
      </div>
    )
  }

  if (!hotel || !roomType) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4"><p role="alert">{formError || t('common.notFound')}</p><button onClick={fetchData} className="px-5 py-3 rounded-xl bg-primary-600 text-white">{t('booking.retry')}</button></div>
      </div>
    )
  }


  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to={`/hotel/${hotel.id}?${searchParams.toString()}`} className="inline-flex items-center gap-2 text-sm text-primary-200 mb-5"><ArrowLeft size={16} className="rtl:rotate-180" aria-hidden="true" />{t('booking.backToProperty')}</Link>
      <h1 className="text-2xl font-bold text-white mb-8">{t('booking.title')}</h1>
      <p className="booking-intro">{t('ux.bookingHelp')}</p>

      {formError && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Form */}
        <fieldset disabled={submitting} className="lg:col-span-3 space-y-6 min-w-0">
          {/* Dates */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">{t('hotel.selectDates')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="min-w-0">
                <label htmlFor="booking-checkIn" className="text-sm text-gray-600 font-medium">{t('common.checkIn')}</label>
                <input
                  type="date"
                  required
                  id="booking-checkIn"
                  value={checkIn}
                  min={today}
                  onChange={e => {
                    const value = e.target.value
                    const nextCheckOut = checkOut && value >= checkOut ? '' : checkOut
                    setCheckIn(value)
                    setCheckOut(nextCheckOut)
                    syncCheckoutParams({ checkIn: value, checkOut: nextCheckOut })
                  }}
                  className="w-full min-w-0 max-w-full box-border appearance-none mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="booking-checkOut" className="text-sm text-gray-600 font-medium">{t('common.checkOut')}</label>
                <input
                  type="date"
                  required
                  id="booking-checkOut"
                  value={checkOut}
                  min={format(addDays(parseISO(isValid(parseISO(checkIn)) ? checkIn : today), 1), 'yyyy-MM-dd')}
                  onChange={e => { setCheckOut(e.target.value); syncCheckoutParams({ checkOut: e.target.value }) }}
                  className="w-full min-w-0 max-w-full box-border appearance-none mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label htmlFor="booking-guests" className="text-sm text-gray-600 font-medium">{t('common.guests')}</label>
                <select
                  id="booking-guests"
                  value={guests}
                  onChange={e => { setGuests(e.target.value); syncCheckoutParams({ guests: e.target.value }) }}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {Array.from({ length: roomType.max_guests * Number(rooms) }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="booking-rooms" className="text-sm text-gray-600 font-medium">{t('common.rooms')}</label>
                <select
                  id="booking-rooms"
                  value={rooms}
                  onChange={e => {
                    const nextRooms = e.target.value
                    const nextGuests = String(Math.min(Number(guests), roomType.max_guests * Number(nextRooms)))
                    setRooms(nextRooms)
                    setGuests(nextGuests)
                    syncCheckoutParams({ rooms: nextRooms, guests: nextGuests })
                  }}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {[1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Guest Info */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">{t('booking.guestInfo')}</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="booking-name" className="text-sm text-gray-600 font-medium">{t('common.name')} *</label>
                <input
                  type="text" autoComplete="name" maxLength={200}
                  required
                  id="booking-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label htmlFor="booking-email" className="text-sm text-gray-600 font-medium">{t('common.email')} *</label>
                <input
                  type="email" autoComplete="email" maxLength={254}
                  required
                  id="booking-email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label htmlFor="booking-phone" className="text-sm text-gray-600 font-medium">{t('common.phone')}</label>
                <input
                  type="tel" autoComplete="tel" maxLength={40}
                  id="booking-phone"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label htmlFor="booking-notes" className="text-sm text-gray-600 font-medium">{t('booking.notes')}</label>
                <textarea
                  id="booking-notes" maxLength={2000}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || quoting || !pricing}
            className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting || quoting ? <span className="inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin" />{t(submitting ? 'booking.submitting' : 'booking.checkingAvailability')}</span> : t('booking.requestBooking')}
          </button>
        </fieldset>

        {/* Summary */}
        <div className="booking-summary lg:col-span-2">
          <div aria-busy={quoting} className="sticky top-24 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4"><CalendarCheck className="inline-block me-2 text-primary-600" size={20} aria-hidden="true" />{t('booking.bookingSummary')}</h2>
            {quoting && <p role="status" className="mb-4 text-sm text-gray-500">{t('booking.checkingAvailability')}</p>}
            {quoteError && <div role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t(quoteError)}<button type="button" className="block underline mt-2 py-2" onClick={() => setQuoteRevision(value => value + 1)}>{t('booking.retry')}</button></div>}
            <p className="text-sm text-gray-500 mb-4">{checkIn && checkOut ? `${formatDate(checkIn, { year: 'numeric', month: 'short', day: 'numeric' })} / ${formatDate(checkOut, { year: 'numeric', month: 'short', day: 'numeric' })}` : t('ux.chooseDates')}</p>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('common.hotel')}</span>
                <span className="font-medium text-gray-900">{hotel.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('common.room')}</span>
                <span className="font-medium text-gray-900">{roomType.name}</span>
              </div>
              {pricing && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t('booking.nights')}</span>
                    <span className="font-medium text-gray-900">{pricing.nights}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{t('common.rooms')}</span>
                      <span className="font-medium text-gray-900">{rooms}</span>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-900">{t('common.total')}</span>
                      <span className="text-xl font-bold text-primary-600">
                        {formatPrice(pricing.finalPriceTotal)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
            <p className="booking-request-note">{t('ux.requestNote')}</p>
          </div>
        </div>
      </form>
    </div>
  )
}
