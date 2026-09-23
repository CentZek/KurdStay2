import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { Building2, Bed, Calendar, CalendarCheck, TrendingUp, Users, Image, X, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { currentLocale } from '../../lib/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts'

interface Hotel {
  id: string
  name: string
  city: string
  status: string
  currency: string
  images: string[]
}

interface Booking {
  id: string
  hotel_id: string
  check_in_date: string
  final_price_total: number
  margin_amount: number
  status: string
  created_at: string
  room_types: { name: string }[] | { name: string } | null
}

interface RoomType {
  id: string
  hotel_id: string
  name: string
  base_price: number
}

export default function OwnerDashboard() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null)
  const [showImageModal, setShowImageModal] = useState(false)
  const [propertyFilter, setPropertyFilter] = useState('')
  const [error, setError] = useState('')
  const [imageSaving, setImageSaving] = useState(false)
  const [newImageUrl, setNewImageUrl] = useState('')

  useEffect(() => {
    if (profile?.role === 'hotel_owner') fetchData()
  }, [profile])

  async function fetchData() {
    setLoading(true)
    setError('')
    const { data: managerLinks, error: managerError } = await supabase
      .from('hotel_managers')
      .select('hotel_id')
      .eq('profile_id', profile!.id)

    if (managerError) { setError(t('common.errorOccurred')); setLoading(false); return }
    const hotelIds = (managerLinks || []).map(l => l.hotel_id)

    let hotelsList: Hotel[] = []
    if (hotelIds.length > 0) {
      const { data: hotelsData, error: hotelError } = await supabase
        .from('hotels')
        .select('id, name, city, status, currency, images')
        .in('id', hotelIds)
      if (hotelError) { setError(t('common.errorOccurred')); setLoading(false); return }
      hotelsList = hotelsData || []
    }
    setHotels(hotelsList)

    if (hotelsList.length > 0) {
      const hotelIds = hotelsList.map(h => h.id)
      const [bookingsRes, roomsRes] = await Promise.all([
        supabase.from('bookings').select('id, hotel_id, check_in_date, final_price_total, margin_amount, status, created_at, room_types(name)').in('hotel_id', hotelIds).order('created_at', { ascending: false }),
        supabase.from('room_types').select('id, hotel_id, name, base_price').in('hotel_id', hotelIds),
      ])
      if (bookingsRes.error || roomsRes.error) { setError(t('common.errorOccurred')); setLoading(false); return }
      setBookings(bookingsRes.data || [])
      setRoomTypes(roomsRes.data || [])
    }

    setLoading(false)
  }

  function openImageManager(hotel: Hotel) {
    setSelectedHotel(hotel)
    setShowImageModal(true)
    setNewImageUrl('')
  }

  async function addImage() {
    if (!selectedHotel || !newImageUrl.trim() || imageSaving) return
    try { if (!['https:', 'http:'].includes(new URL(newImageUrl.trim()).protocol)) return } catch { setError(t('common.errorOccurred')); return }
    const updatedImages = [...(selectedHotel.images || []), newImageUrl.trim()]
    setImageSaving(true)
    const { error: saveError } = await supabase.from('hotels').update({ images: updatedImages }).eq('id', selectedHotel.id)
    setImageSaving(false)
    if (saveError) { setError(t('common.errorOccurred')); return }
    setSelectedHotel({ ...selectedHotel, images: updatedImages })
    setHotels(prev => prev.map(h => h.id === selectedHotel.id ? { ...h, images: updatedImages } : h))
    setNewImageUrl('')
  }

  async function removeImage(index: number) {
    if (!selectedHotel) return
    const updatedImages = selectedHotel.images.filter((_, i) => i !== index)
    setImageSaving(true)
    const { error: saveError } = await supabase.from('hotels').update({ images: updatedImages }).eq('id', selectedHotel.id)
    setImageSaving(false)
    if (saveError) { setError(t('common.errorOccurred')); return }
    setSelectedHotel({ ...selectedHotel, images: updatedImages })
    setHotels(prev => prev.map(h => h.id === selectedHotel.id ? { ...h, images: updatedImages } : h))
  }

  if (profile?.role !== 'hotel_owner') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t('owner.accessDeniedOwners')}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-500">{t('common.loading')}</div>
      </div>
    )
  }

  if (error && !showImageModal) return <div className="p-8"><div role="alert" className="feedback-message error">{error}</div><button onClick={fetchData}>{t('ux.retry')}</button></div>

  if (hotels.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="dashboard-heading"><div><p className="eyebrow">KURDSTAY / {t('ux.workspace')}</p><h1 className="text-2xl font-bold text-gray-900">{t('owner.dashboard')}</h1><p>{t('ux.ownerIntro')}</p></div></div>
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="mt-4 text-gray-500">{t('owner.noHotels')}</p>
          <p className="mt-1 text-sm text-gray-400">{t('owner.contactAdmin')}</p>
        </div>
      </div>
    )
  }

  const visibleHotels = hotels.filter(h => !propertyFilter || h.id === propertyFilter)
  const visibleBookings = bookings.filter(b => !propertyFilter || b.hotel_id === propertyFilter)
  const totalBookings = visibleBookings.length
  const confirmedBookings = visibleBookings.filter(b => b.status === 'confirmed' || b.status === 'completed')
  const pendingBookings = visibleBookings.filter(b => b.status === 'pending')
  const revenueByCurrency = confirmedBookings.reduce<Record<string, number>>((totals, b) => { const code = hotels.find(h => h.id === b.hotel_id)?.currency || 'USD'; totals[code] = (totals[code] || 0) + Number(b.final_price_total); return totals }, {})
  const mixedCurrencies = new Set(visibleHotels.map(h => h.currency)).size > 1
  const currency = visibleHotels[0]?.currency || 'USD'

  const formatPrice = (amount: number) => {
    if (currency === 'IQD') return `${amount.toLocaleString()} IQD`
    return `$${amount.toFixed(0)}`
  }

  // Booking status breakdown for pie chart
  const statusData = [
    { name: t('booking.status.confirmed'), value: visibleBookings.filter(b => b.status === 'confirmed').length, color: '#16a34a' },
    { name: t('booking.status.pending'), value: visibleBookings.filter(b => b.status === 'pending').length, color: '#f59e0b' },
    { name: t('booking.status.completed'), value: visibleBookings.filter(b => b.status === 'completed').length, color: '#2563eb' },
    { name: t('booking.status.cancelled'), value: visibleBookings.filter(b => b.status === 'cancelled').length, color: '#dc2626' },
  ].filter(d => d.value > 0)

  // Monthly bookings trend (last 6 months)
  const monthlyData = (() => {
    const months: Record<string, { month: string; bookings: number; revenue: number }> = {}
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString(currentLocale(), { month: 'short' })
      months[key] = { month: label, bookings: 0, revenue: 0 }
    }
    for (const b of visibleBookings) {
      const key = b.created_at.slice(0, 7)
      if (months[key]) {
        months[key].bookings++
        if (b.status === 'confirmed' || b.status === 'completed') {
          months[key].revenue += Number(b.final_price_total)
        }
      }
    }
    return Object.values(months)
  })()

  // Revenue by room type
  const roomRevenueData = (() => {
    const map = new Map<string, number>()
    for (const b of confirmedBookings) {
      const roomName = (Array.isArray(b.room_types) ? b.room_types[0]?.name : b.room_types?.name) || t('owner.unknown')
      map.set(roomName, (map.get(roomName) || 0) + Number(b.final_price_total))
    }
    return Array.from(map.entries()).map(([name, revenue]) => ({ name, revenue }))
  })()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="dashboard-heading"><div><p className="eyebrow">KURDSTAY / {t('ux.workspace')}</p><h1 className="text-2xl font-bold text-gray-900">{t('owner.dashboard')}</h1><p>{t('ux.ownerIntro')}</p></div></div>

      <div className="booking-toolbar"><select aria-label={t('ux.selectProperty')} value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)}><option value="">{t('ux.allProperties')}</option>{hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
      {pendingBookings.length > 0 && <div className="priority-banner"><span>{t('ux.priorities')} &middot; {pendingBookings.length} {t('booking.status.pending')}</span><a href="#managed-properties">{t('ux.selectProperty')}</a></div>}
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalBookings}</p>
          <p className="text-sm text-gray-500">{t('admin.totalBookings')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{pendingBookings.length}</p>
          <p className="text-sm text-gray-500">{t('booking.status.pending')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{Object.entries(revenueByCurrency).map(([code, amount]) => <span key={code} className="block text-lg">{amount.toLocaleString()} {code}</span>)}{Object.keys(revenueByCurrency).length === 0 && '0'}</p>
          <p className="text-sm text-gray-500">{t('admin.totalRevenue')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
              <Bed className="w-5 h-5 text-primary-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{roomTypes.filter(r => !propertyFilter || r.hotel_id === propertyFilter).length}</p>
          <p className="text-sm text-gray-500">{t('owner.roomTypes')}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Bookings Trend */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t('owner.bookingsTrend')}</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                />
                <Line type="monotone" dataKey="bookings" stroke="#b18a46" strokeWidth={2} dot={{ r: 4 }} name={t('owner.bookings')} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Booking Status Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t('owner.bookingStatus')}</h3>
          {statusData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">{t('owner.noBookingsYet')}</div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="h-52 w-full min-w-0 shrink-0 sm:flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={75} innerRadius={40}>
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {statusData.map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-xs text-gray-600">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Revenue by Room Type */}
      {!mixedCurrencies && roomRevenueData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
          <h3 className="font-semibold text-gray-900 mb-4">{t('owner.revenueByRoomType')}</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roomRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                  formatter={(value) => [formatPrice(Number(value)), t('owner.revenue')]}
                />
                <Bar dataKey="revenue" fill="#294b60" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Hotels Grid */}
      <h2 id="managed-properties" className="text-lg font-semibold text-gray-900 mb-4">{t('ux.allProperties')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {visibleHotels.map(hotel => (
          <div key={hotel.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Hotel Image Preview */}
            {hotel.images && hotel.images.length > 0 ? (
              <div className="h-40 overflow-hidden relative">
                <img src={hotel.images[0]} alt={hotel.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-3 start-4 text-white">
                  <h3 className="font-semibold text-lg">{hotel.name}</h3>
                  <p className="text-sm text-white/80">{hotel.city}</p>
                </div>
              </div>
            ) : (
              <div className="h-40 bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                  <Building2 className="w-8 h-8 text-gray-300 mx-auto" />
                  <h3 className="font-semibold text-gray-900 mt-2">{hotel.name}</h3>
                  <p className="text-sm text-gray-500">{hotel.city}</p>
                </div>
              </div>
            )}

            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  hotel.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {hotel.status}
                </span>
                <button
                  onClick={() => openImageManager(hotel)}
                  className="text-gray-500 hover:text-primary-600 transition-colors flex items-center gap-1.5 text-xs font-medium"
                >
                  <Image className="w-3.5 h-3.5" />
                  {t('owner.managePhotos')}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Link
                  to={`/owner/rooms/${hotel.id}`}
                  className="flex flex-col items-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-primary-50 transition-colors"
                >
                  <Bed className="w-5 h-5 text-primary-600" />
                  <span className="text-xs font-medium text-gray-700">{t('owner.roomTypes')}</span>
                </Link>
                <Link
                  to={`/owner/availability/${hotel.id}`}
                  className="flex flex-col items-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-primary-50 transition-colors"
                >
                  <Calendar className="w-5 h-5 text-secondary-600" />
                  <span className="text-xs font-medium text-gray-700">{t('owner.availability')}</span>
                </Link>
                <Link
                  to={`/owner/bookings/${hotel.id}`}
                  className="flex flex-col items-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-primary-50 transition-colors"
                >
                  <CalendarCheck className="w-5 h-5 text-accent-600" />
                  <span className="text-xs font-medium text-gray-700">{t('owner.bookings')}</span>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Image Management Modal */}
      {showImageModal && selectedHotel && (
        <div role="dialog" aria-modal="true" aria-label={t('owner.hotelPhotos')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 m-4 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">{t('owner.hotelPhotosTitle', { name: selectedHotel.name })}</h2>
              <button aria-label={t('common.cancel')} onClick={() => { setShowImageModal(false); setError('') }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {error && <div role="alert" className="feedback-message error">{error}</div>}
            {/* Existing Images */}
            {selectedHotel.images && selectedHotel.images.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 mb-6">
                {selectedHotel.images.map((img, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden aspect-video">
                    <img src={img} alt={t('owner.photoAlt', { n: i + 1 })} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      disabled={imageSaving}
                      aria-label={t('owner.deletePhoto', { n: i + 1 })}
                      className="absolute top-2 end-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-xl mb-6">
                <Image className="w-10 h-10 text-gray-300 mx-auto" />
                <p className="mt-2 text-sm text-gray-500">{t('owner.noPhotosYet')}</p>
              </div>
            )}

            {/* Add Image */}
            <div className="flex gap-2">
              <input
                type="url"
                aria-label={t('owner.imageUrl')}
                value={newImageUrl}
                onChange={e => setNewImageUrl(e.target.value)}
                placeholder={t('owner.pasteImageUrl')}
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={addImage}
                disabled={!newImageUrl.trim() || imageSaving}
                className="bg-primary-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {t('owner.add')}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">{t('owner.galleryHelp')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
