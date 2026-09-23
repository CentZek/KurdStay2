import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

interface Booking {
  id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  check_in_date: string
  check_out_date: string
  guests: number
  rooms: number
  base_price_total: number
  margin_percentage: number
  margin_amount: number
  final_price_total: number
  status: string
  notes: string
  created_at: string
  hotels: { name: string; currency: string }
  room_types: { name: string }
}

export default function AdminBookings() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState(searchParams.get('status') || 'all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.role === 'admin') fetchBookings()
  }, [profile])

  async function fetchBookings() {
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase
      .from('bookings')
      .select('*, hotels(name, currency), room_types(name)')
      .order('created_at', { ascending: false })
    if (fetchError) setError(t('common.errorOccurred'))
    else setBookings(data || [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    if (updatingId) return
    setUpdatingId(id)
    setError('')
    const { error: updateError } = await supabase.from('bookings').update({ status }).eq('id', id)
    if (updateError) { setError(t('common.errorOccurred')); setUpdatingId(''); return }

    // Send WhatsApp notification when booking is confirmed
    if (status === 'confirmed') {
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ type: 'booking_confirmed', booking_id: id }),
      }).catch(() => {})
    }

    await fetchBookings()
    setUpdatingId('')
  }

  if (profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('admin.accessDeniedShort')}</p></div>
  }

  const filteredBookings = bookings.filter(b => (filter === 'all' || b.status === filter) && [b.customer_name, b.customer_email, b.customer_phone, b.hotels?.name, b.id].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())))

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700',
    confirmed: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-700',
    completed: 'bg-blue-50 text-blue-700',
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('admin.manageBookings')}</h1>

      {error && <div role="alert" className="feedback-message error">{error} <button onClick={fetchBookings}>{t('ux.retry')}</button></div>}
      <div className="booking-toolbar"><input type="search" aria-label={t('ux.bookingSearch')} placeholder={t('ux.bookingSearch')} value={search} onChange={e => setSearch(e.target.value)}/></div>
      <div className="flex gap-2 mb-6 flex-wrap">
        {['all', 'pending', 'confirmed', 'cancelled', 'completed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === s ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? t('propertyTypes.all') : t(`booking.status.${s}`)}
            {s !== 'all' && (
              <span className="ms-1.5 text-xs">
                ({bookings.filter(b => b.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : filteredBookings.length === 0 ? (
        <p className="text-gray-500">{t('common.noResults')}</p>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map(booking => (
            <div key={booking.id} className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">{booking.customer_name}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[booking.status]}`}>
                      {t(`booking.status.${booking.status}`)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1 break-words">
                    <p className="text-xs text-gray-400">{t('ux.bookingReference')}: {booking.id.slice(0, 8).toUpperCase()}</p>
                    <p>{t('common.hotel')}: <span className="font-medium">{booking.hotels?.name}</span> - {booking.room_types?.name}</p>
                    <p>{booking.check_in_date} {t('booking.dateTo')} {booking.check_out_date} | {t('booking.guestsRooms', { guests: booking.guests, rooms: booking.rooms })}</p>
                    <p>{booking.customer_email} {booking.customer_phone && `| ${booking.customer_phone}`}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>{t('admin.basePrice')}: <strong className="text-gray-700">{booking.hotels?.currency === 'IQD' ? `${Number(booking.base_price_total).toLocaleString()} IQD` : `$${booking.base_price_total}`}</strong></span>
                    <span>{t('admin.marginPercentage')}: <strong className="text-gray-700">{booking.margin_percentage}%</strong></span>
                    <span>{t('admin.commission')}: <strong className="text-gray-700">{booking.hotels?.currency === 'IQD' ? `${Number(booking.margin_amount).toLocaleString()} IQD` : `$${booking.margin_amount}`}</strong></span>
                    <span>{t('admin.finalPrice')}: <strong className="text-primary-600">{booking.hotels?.currency === 'IQD' ? `${Number(booking.final_price_total).toLocaleString()} IQD` : `$${booking.final_price_total}`}</strong></span>
                  </div>
                </div>
                {booking.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      disabled={Boolean(updatingId)}
                      onClick={() => updateStatus(booking.id, 'confirmed')}
                      className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      {t('common.confirm')}
                    </button>
                    <button
                      disabled={Boolean(updatingId)}
                      onClick={() => updateStatus(booking.id, 'cancelled')}
                      className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                )}
                {booking.status === 'confirmed' && (
                  <button
                    disabled={Boolean(updatingId)}
                      onClick={() => updateStatus(booking.id, 'completed')}
                    className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors"
                  >
                    {t('booking.markComplete')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
