import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { differenceInDays, format, addDays, parseISO, isValid } from 'date-fns'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/locale'

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
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [hotel, setHotel] = useState<Hotel | null>(null)
  const [roomType, setRoomType] = useState<RoomType | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  function getLocalToday() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const today = getLocalToday()

  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || '')
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || '')
  const [guests, setGuests] = useState(searchParams.get('guests') || '2')
  const [rooms, setRooms] = useState('1')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (profile) { setName(value => value || profile.name || ''); setEmail(value => value || profile.email || ''); setPhone(value => value || profile.phone || '') }
  }, [profile])

  useEffect(() => {
    fetchData()
  }, [hotelId, roomTypeId])

  async function fetchData() {
    setLoading(true)
    const [hotelRes, roomRes] = await Promise.all([
      supabase.from('hotels').select('id, name, city, profit_margin_percentage, currency').eq('id', hotelId).maybeSingle(),
      supabase.from('room_types').select('id, name, base_price, max_guests').eq('id', roomTypeId).eq('hotel_id', hotelId).maybeSingle(),
    ])
    setHotel(hotelRes.data)
    setRoomType(roomRes.data)
    setLoading(false)
  }

  function calculatePricing() {
    if (!hotel || !roomType || !checkIn || !checkOut) return null
    const nights = differenceInDays(new Date(checkOut), new Date(checkIn))
    if (!Number.isFinite(nights) || nights <= 0) return null

    const basePriceTotal = roomType.base_price * nights * parseInt(rooms)
    const marginPercentage = hotel.profit_margin_percentage || 0
    const marginAmount = basePriceTotal * marginPercentage / 100
    const finalPriceTotal = basePriceTotal + marginAmount

    return { nights, basePriceTotal, marginPercentage, marginAmount, finalPriceTotal }
  }

  function formatPrice(amount: number) {
    if (!hotel) return `$${amount.toFixed(2)}`
    if (hotel.currency === 'IQD') return `${Math.round(amount).toLocaleString()} IQD`
    return `$${Math.round(amount)}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hotel || !roomType) return
    const pricing = calculatePricing()
    if (!Number.isInteger(Number(guests)) || Number(guests) < 1 || Number(guests) > roomType.max_guests) { setFormError(t('ux.guestCapacity')); return }
    if (!pricing) {
      setFormError(t('booking.invalidDates'))
      return
    }
    if (pricing.nights <= 0) {
      setFormError(t('booking.invalidDates'))
      return
    }
    const freshToday = getLocalToday()
    if (checkIn < freshToday) {
      setFormError(t('booking.pastDate'))
      return
    }
    if (checkOut <= checkIn) {
      setFormError(t('booking.invalidDates'))
      return
    }

    setFormError('')
    setSubmitting(true)

    const { data, error } = await supabase.from('bookings').insert({
      hotel_id: hotel.id,
      room_type_id: roomType.id,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      check_in_date: checkIn,
      check_out_date: checkOut,
      guests: parseInt(guests),
      rooms: parseInt(rooms),
      base_price_total: pricing.basePriceTotal,
      margin_percentage: pricing.marginPercentage,
      margin_amount: pricing.marginAmount,
      final_price_total: pricing.finalPriceTotal,
      status: 'pending',
      notes,
    }).select('id').single()

    setSubmitting(false)

    if (error) {
      setFormError(t('booking.submitFailed'))
      return
    }

    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'booking_created', booking_id: data.id }),
    }).catch(() => {})

    navigate(`/booking/confirmation/${data.id}`)
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
        <p className="text-gray-400">{t('common.notFound')}</p>
      </div>
    )
  }

  const pricing = calculatePricing()

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">{t('booking.title')}</h1>
      <p className="booking-intro">{t('ux.bookingHelp')}</p>

      {formError && (
        <div role="alert" className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Form */}
        <div className="lg:col-span-3 space-y-6">
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
                    setCheckIn(e.target.value)
                    if (checkOut && e.target.value >= checkOut) setCheckOut('')
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
                  onChange={e => setCheckOut(e.target.value)}
                  className="w-full min-w-0 max-w-full box-border appearance-none mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label htmlFor="booking-guests" className="text-sm text-gray-600 font-medium">{t('common.guests')}</label>
                <select
                  id="booking-guests"
                  value={guests}
                  onChange={e => setGuests(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {Array.from({ length: roomType.max_guests }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="booking-rooms" className="text-sm text-gray-600 font-medium">{t('common.rooms')}</label>
                <select
                  id="booking-rooms"
                  value={rooms}
                  onChange={e => setRooms(e.target.value)}
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
                  type="text" autoComplete="name"
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
                  type="email" autoComplete="email"
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
                  type="tel" autoComplete="tel"
                  id="booking-phone"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label htmlFor="booking-notes" className="text-sm text-gray-600 font-medium">{t('booking.notes')}</label>
                <textarea
                  id="booking-notes"
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
            disabled={submitting || !pricing}
            className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t('common.loading') : t('booking.confirmBooking')}
          </button>
        </div>

        {/* Summary */}
        <div className="booking-summary lg:col-span-2">
          <div className="sticky top-24 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">{t('booking.bookingSummary')}</h2>
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
