import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { Building2, CalendarCheck, Users, DollarSign, MapPin, TrendingUp, MessageCircle, Home, ArrowUpRight, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface HotelCommission {
  hotel_id: string
  hotel_name: string
  currency: string
  confirmed_count: number
  total_commission: number
}

export default function AdminDashboard() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [stats, setStats] = useState({ hotels: 0, bookings: 0, pending: 0, confirmed: 0, totalCommission: 0, openChats: 0, pendingApplications: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [commissionByHotel, setCommissionByHotel] = useState<HotelCommission[]>([])

  useEffect(() => {
    if (profile?.role === 'admin') fetchStats()
  }, [profile])

  async function fetchStats() {
    setLoading(true)
    setError('')
    const [hotelsRes, bookingsRes, pendingRes, confirmedRes, chatsRes, appsRes] = await Promise.all([
      supabase.from('hotels').select('id, name, currency'),
      supabase.from('bookings').select('hotel_id, margin_amount, status'),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('bookings').select('hotel_id, margin_amount').eq('status', 'confirmed'),
      supabase.from('chat_sessions').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('accommodation_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])

    if ([hotelsRes, bookingsRes, pendingRes, confirmedRes, chatsRes, appsRes].some(result => result.error)) {
      setError(t('common.errorOccurred')); setLoading(false); return
    }
    setLoading(false)
    const hotels = hotelsRes.data || []
    const allBookings = bookingsRes.data || []
    const confirmed = confirmedRes.data || []

    const totalCommission = confirmed.reduce((sum, b) => sum + Number(b.margin_amount), 0)

    const commissionMap = new Map<string, HotelCommission>()
    for (const hotel of hotels) {
      commissionMap.set(hotel.id, {
        hotel_id: hotel.id,
        hotel_name: hotel.name,
        currency: hotel.currency || 'USD',
        confirmed_count: 0,
        total_commission: 0,
      })
    }
    for (const b of confirmed) {
      const entry = commissionMap.get(b.hotel_id)
      if (entry) {
        entry.confirmed_count++
        entry.total_commission += Number(b.margin_amount)
      }
    }

    const commissionList = Array.from(commissionMap.values())
      .filter(c => c.confirmed_count > 0)
      .sort((a, b) => b.total_commission - a.total_commission)

    setCommissionByHotel(commissionList)
    setStats({
      hotels: hotels.length,
      bookings: allBookings.length,
      pending: pendingRes.count || 0,
      confirmed: confirmed.length,
      totalCommission,
      openChats: chatsRes.count || 0,
      pendingApplications: appsRes.count || 0,
    })
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t('admin.accessDenied')}</p>
      </div>
    )
  }

  const commissionTotals = commissionByHotel.reduce<Record<string, number>>((totals, hotel) => { totals[hotel.currency] = (totals[hotel.currency] || 0) + hotel.total_commission; return totals }, {})
  const cards = [
    { label: t('admin.totalHotels'), value: stats.hotels, icon: Building2, color: 'primary', link: '/admin/hotels' },
    { label: t('admin.totalBookings'), value: stats.bookings, icon: CalendarCheck, color: 'secondary', link: '/admin/bookings' },
    { label: t('admin.pendingReview'), value: stats.pending, icon: Users, color: 'accent', link: '/admin/bookings' },
    { label: t('admin.totalCommission'), value: Object.entries(commissionTotals).map(([currency, total]) => `${total.toLocaleString()} ${currency}`).join(' / ') || '0', icon: DollarSign, color: 'primary', link: '/admin/bookings' },
    { label: t('admin.openChats'), value: stats.openChats, icon: MessageCircle, color: 'secondary', link: '/admin/chats' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="dashboard-heading"><div><p className="eyebrow">KURDSTAY / {t('ux.workspace')}</p><h1 className="text-2xl font-bold text-gray-900">{t('admin.dashboard')}</h1><p>{t('ux.adminIntro')}</p></div><Link to="/admin/hotels"><Plus size={17}/>{t('admin.manageHotels')}</Link></div>
      {error && <div role="alert" className="feedback-message error">{error} <button onClick={fetchStats}>{t('ux.retry')}</button></div>}
      {!loading && !error && stats.pending > 0 && <div className="priority-banner"><span>{t('ux.priorities')} &middot; {stats.pending} {t('admin.pendingReview')}</span><Link to="/admin/bookings?status=pending">{t('ux.reviewBookings')}<ArrowUpRight size={17}/></Link></div>}

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
        {cards.map(card => (
          <Link
            key={card.label}
            to={card.link}
            className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="w-11 h-11 bg-primary-50 rounded-xl flex items-center justify-center">
              <card.icon className="w-5 h-5 text-primary-700" />
            </div>
            <p className="mt-4 text-xl font-bold text-gray-900 break-words">{loading ? '...' : error ? '-' : card.value}</p>
            <p className="mt-1 text-sm text-gray-500">{card.label}</p>
          </Link>
        ))}
      </div>

      {/* Commission Tracking */}
      {commissionByHotel.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('admin.commissionTracking')}</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">{t('admin.commissionDescription')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('common.hotel')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('admin.currency')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('admin.confirmedBookings')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('admin.commissionOwed')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {commissionByHotel.map(item => (
                  <tr key={item.hotel_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.hotel_name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {item.currency}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.confirmed_count}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-green-700">
                        {item.currency === 'IQD' ? `${item.total_commission.toLocaleString()} IQD` : `$${item.total_commission.toFixed(2)}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Link to="/admin/hotels" className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <Building2 className="w-8 h-8 text-primary-600" />
          <h3 className="mt-3 font-semibold text-gray-900">{t('admin.manageHotels')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('admin.manageHotelsDesc')}</p>
        </Link>
        <Link to="/admin/bookings" className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <CalendarCheck className="w-8 h-8 text-secondary-600" />
          <h3 className="mt-3 font-semibold text-gray-900">{t('admin.manageBookings')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('admin.manageBookingsDesc')}</p>
        </Link>
        <Link to="/admin/owners" className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <Users className="w-8 h-8 text-accent-600" />
          <h3 className="mt-3 font-semibold text-gray-900">{t('admin.manageOwners')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('admin.manageOwnersDesc')}</p>
        </Link>
        <Link to="/admin/destinations" className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <MapPin className="w-8 h-8 text-primary-600" />
          <h3 className="mt-3 font-semibold text-gray-900">{t('home.destinations')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('admin.destinationsDesc')}</p>
        </Link>
        <Link to="/admin/chats" className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <MessageCircle className="w-8 h-8 text-green-600" />
          <h3 className="mt-3 font-semibold text-gray-900">{t('chats.title')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('admin.liveChatsDesc')}</p>
        </Link>
        <Link to="/admin/applications" className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow relative">
          <Home className="w-8 h-8 text-primary-600" />
          <h3 className="mt-3 font-semibold text-gray-900">{t('admin.applications')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('admin.applicationsDesc')}</p>
          {stats.pendingApplications > 0 && (
            <span className="absolute top-4 end-4 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-amber-500 text-white text-xs font-semibold">{stats.pendingApplications}</span>
          )}
        </Link>
      </div>
    </div>
  )
}
