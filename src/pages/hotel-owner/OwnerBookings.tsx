import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/locale'

interface Booking {
  id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  hotels: { name: string; currency: string }
  check_in_date: string
  check_out_date: string
  guests: number
  rooms: number
  base_price_total: number
  status: string
  created_at: string
  room_types: { name: string }
}

export default function OwnerBookings() {
  const { hotelId } = useParams()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.role === 'hotel_owner' || profile?.role === 'admin') fetchBookings()
  }, [profile, hotelId])

  async function fetchBookings() {
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase
      .from('bookings')
      .select('*, room_types(name), hotels(name, currency)')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
    if (fetchError) setError(t('common.errorOccurred'))
    else setBookings(data || [])
    setLoading(false)
  }

  if (profile?.role !== 'hotel_owner' && profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('owner.accessDenied')}</p></div>
  }

  const filteredBookings = bookings.filter(b => (filter === 'all' || b.status === filter) && [b.customer_name, b.customer_email, b.customer_phone, b.id].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())))

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700',
    confirmed: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-700',
    completed: 'bg-blue-50 text-blue-700',
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/owner" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{t('owner.bookings')}</h1>
      </div>

      {error && <div role="alert" className="feedback-message error">{error} <button onClick={fetchBookings}>{t('ux.retry')}</button></div>}
      <div className="booking-toolbar"><input type="search" aria-label={t('ux.bookingSearch')} placeholder={t('ux.bookingSearch')} value={search} onChange={e => setSearch(e.target.value)}/><select aria-label={t('common.status')} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t('ux.allStatuses')}</option>{['pending','confirmed','completed','cancelled'].map(status => <option key={status} value={status}>{t(`booking.status.${status}`)}</option>)}</select></div>
      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">{t('common.noResults')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map(booking => (
            <div key={booking.id} className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{booking.customer_name}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[booking.status]}`}>
                      {t(`booking.status.${booking.status}`)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{t('ux.bookingReference')}: {booking.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-gray-600">
                    {booking.room_types?.name} | {booking.check_in_date} {t('owner.to')} {booking.check_out_date}
                  </p>
                  <p className="text-sm text-gray-500">
                    {t('owner.guestsRooms', { guests: booking.guests, rooms: booking.rooms })} | {t('owner.basePrice')}: {Number(booking.base_price_total).toLocaleString()} {booking.hotels?.currency || 'USD'}
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  {formatDate(booking.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
