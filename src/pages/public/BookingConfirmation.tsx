import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle, Clock, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/locale'

interface Booking {
  id: string
  customer_name: string
  customer_email: string
  check_in_date: string
  check_out_date: string
  guests: number
  rooms: number
  final_price_total: number
  status: string
  hotel_id: string
  hotels: { name: string; currency: string }
  room_types: { name: string }
}

export default function BookingConfirmation() {
  const { bookingId } = useParams()
  const { t } = useTranslation()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (bookingId) fetchBooking()
  }, [bookingId])

  async function fetchBooking() {
    setLoading(true)
    const { data, error } = await supabase
      .from('bookings')
      .select('*, hotels(name, currency), room_types(name)')
      .eq('id', bookingId)
      .maybeSingle()
    setError(Boolean(error))
    setBooking(data)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">{t('common.loading')}</div>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4"><p role="alert">{t(error ? 'common.errorOccurred' : 'booking.notFound')}</p><button onClick={fetchBooking} className="rounded-xl bg-primary-600 px-5 py-3 text-white">{t('booking.retry')}</button><Link to="/" className="block underline">{t('common.home')}</Link></div>
      </div>
    )
  }

  const StatusIcon = booking.status === 'pending' ? Clock : booking.status === 'cancelled' ? XCircle : CheckCircle

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="animate-scale-in">
        <div className="w-20 h-20 bg-secondary-100 rounded-full flex items-center justify-center mx-auto">
          <StatusIcon className="w-10 h-10 text-secondary-600" />
        </div>

        <h1 className="mt-6 text-2xl font-bold text-white">{booking.status === 'pending' ? t('booking.bookingConfirmed') : t(`booking.status.${booking.status}`)}</h1>
        {booking.status === 'pending' && <p className="mt-2 text-gray-300">{t('booking.bookingConfirmedMsg')}</p>}

        <div className="mt-8 bg-white border border-gray-200 rounded-2xl p-6 text-start">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('booking.bookingId')}</span>
              <span className="font-mono text-xs text-gray-700 break-all text-end ms-4">{booking.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('common.hotel')}</span>
              <span className="font-medium text-gray-900">{booking.hotels?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('common.room')}</span>
              <span className="font-medium text-gray-900">{booking.room_types?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('common.checkIn')}</span>
              <span className="font-medium text-gray-900">{formatDate(booking.check_in_date, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('common.checkOut')}</span>
              <span className="font-medium text-gray-900">{formatDate(booking.check_out_date, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('common.guests')}</span>
              <span className="font-medium text-gray-900">{booking.guests}</span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between">
              <span className="font-semibold text-gray-900">{t('common.total')}</span>
              <span className="text-lg font-bold text-primary-600">
                {booking.hotels?.currency === 'IQD' ? `${Number(booking.final_price_total).toLocaleString()} IQD` : `$${booking.final_price_total}`}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('common.status')}</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-100 text-accent-800">
                {t(`booking.status.${booking.status}`)}
              </span>
            </div>
          </div>
        </div>

        <Link
          to="/"
          className="mt-6 inline-block bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors"
        >
          {t('common.home')}
        </Link>
      </div>
    </div>
  )
}
