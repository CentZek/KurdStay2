import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Users, ChevronDown, AlertCircle, TrendingUp, Flame, ArrowDownNarrowWide, ArrowUpNarrowWide } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { optimizeImageUrl, getImageSrcSet } from '../../lib/imageUtils'
import { amenityLabel } from '../../lib/amenities'

interface Hotel {
  id: string
  name: string
  location: string
  city: string
  images: string[]
  amenities: string[]
  property_type: string
  profit_margin_percentage: number
  currency: string
  room_types: { base_price: number; max_guests: number }[]
}

type SortMode = 'popular' | 'most_booked' | 'price_low' | 'price_high'

const PAGE_SIZE = 12

const CITY_VARIANTS: Record<string, string[]> = {
  duhok: ['duhok', 'dohuk', 'dahuk'],
  erbil: ['erbil', 'arbil', 'hawler', 'hewler', 'hewlêr'],
  sulaymaniya: ['sulaymaniya', 'sulaymaniyah', 'suleimaniyah', 'sulaimaniyya', 'slemani', 'slêmanî'],
  zakho: ['zakho', 'zaxo'],
}

function expandSearchVariants(term: string): string[] {
  const lower = term.toLowerCase().trim()
  for (const variants of Object.values(CITY_VARIANTS)) {
    if (variants.some(v => lower.includes(v) || v.includes(lower))) {
      return variants
    }
  }
  return [lower]
}

export default function SearchResults() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [sortMode, setSortMode] = useState<SortMode>('popular')
  const [popularityMap, setPopularityMap] = useState<Record<string, number>>({})
  const [bookingCountMap, setBookingCountMap] = useState<Record<string, number>>({})

  const location = searchParams.get('location') || ''
  const propertyType = searchParams.get('type') || ''
  const guestCount = Math.max(1, Number(searchParams.get('guests')) || 1)

  useEffect(() => {
    fetchHotels()
    fetchSortData()
    setVisibleCount(PAGE_SIZE)
  }, [location, propertyType])

  async function fetchSortData() {
    const [popRes, bookRes] = await Promise.all([
      supabase.rpc('get_hotels_with_popularity', {
        filter_city: location || null,
        filter_property_type: propertyType || null,
      }),
      supabase.rpc('get_hotel_booking_counts'),
    ])

    const popMap: Record<string, number> = {}
    for (const row of (popRes.data || [])) {
      popMap[row.hotel_id] = Number(row.popularity_score)
    }
    setPopularityMap(popMap)

    const bMap: Record<string, number> = {}
    for (const row of (bookRes.data || [])) {
      bMap[row.hotel_id] = Number(row.booking_count)
    }
    setBookingCountMap(bMap)
  }

  async function fetchHotels() {
    setLoading(true)
    setError('')

    let query = supabase
      .from('hotels')
      .select('id, name, location, city, images, amenities, property_type, currency, profit_margin_percentage, room_types(base_price, max_guests)')
      .eq('status', 'active')

    if (location) {
      const variants = expandSearchVariants(location)
      const orClauses = variants
        .map(v => `city.ilike.${JSON.stringify(`%${v}%`)}`)
        .join(',')
      query = query.or(orClauses)
    }

    if (propertyType) {
      query = query.eq('property_type', propertyType)
    }

    const { data, error: fetchError } = await query.order('name')

    if (fetchError) {
      setError(t('common.errorOccurred'))
      setHotels([])
    } else {
      setHotels(data || [])
    }
    setLoading(false)
  }

  function getMinPrice(hotel: Hotel) {
    if (!hotel.room_types || hotel.room_types.length === 0) return null
    return Math.min(...hotel.room_types.map(r => r.base_price)) * (1 + (hotel.profit_margin_percentage || 0) / 100)
  }

  function getMaxGuests(hotel: Hotel) {
    if (!hotel.room_types || hotel.room_types.length === 0) return 0
    return Math.max(...hotel.room_types.map(r => r.max_guests))
  }

  function formatPrice(amount: number, currency: string) {
    if (currency === 'IQD') return `${Math.round(amount).toLocaleString()} IQD`
    return `$${Math.round(amount)}`
  }

  function getSortedHotels(): Hotel[] {
    const list = hotels.filter(h => !h.room_types?.length || getMaxGuests(h) >= guestCount)
    switch (sortMode) {
      case 'popular':
        return list.sort((a, b) => (popularityMap[b.id] || 0) - (popularityMap[a.id] || 0))
      case 'most_booked':
        return list.sort((a, b) => (bookingCountMap[b.id] || 0) - (bookingCountMap[a.id] || 0))
      case 'price_low': {
        return list.sort((a, b) => {
          const pa = getMinPrice(a) ?? Infinity
          const pb = getMinPrice(b) ?? Infinity
          return pa - pb
        })
      }
      case 'price_high': {
        return list.sort((a, b) => {
          const pa = getMinPrice(a) ?? 0
          const pb = getMinPrice(b) ?? 0
          return pb - pa
        })
      }
      default:
        return list
    }
  }

  const sortedHotels = getSortedHotels()

  const sortOptions: { value: SortMode; labelKey: string; icon: typeof TrendingUp }[] = [
    { value: 'popular', labelKey: 'search.sortPopular', icon: TrendingUp },
    { value: 'most_booked', labelKey: 'search.sortMostBooked', icon: Flame },
    { value: 'price_low', labelKey: 'search.sortPriceLow', icon: ArrowUpNarrowWide },
    { value: 'price_high', labelKey: 'search.sortPriceHigh', icon: ArrowDownNarrowWide },
  ]

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 animate-pulse">
              <div className="aspect-[16/10] bg-gray-200" />
              <div className="p-5 space-y-3">
                <div className="h-5 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-4 bg-gray-200 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <form className="results-filter" onSubmit={e => {
        e.preventDefault()
        const values = new FormData(e.currentTarget)
        const params = new URLSearchParams(searchParams)
        for (const key of ['location', 'type']) { const value = String(values.get(key) || '').trim(); if (value) params.set(key, value); else params.delete(key) }
        setSearchParams(params)
      }}>
        <label><span>{t('common.location')}</span><input key={location} name="location" defaultValue={location} placeholder={t('common.allDestinations')}/></label>
        <label><span>{t('search.filterBy')}</span><select key={propertyType} name="type" defaultValue={propertyType}><option value="">{t('propertyTypes.all')}</option>{['hotel','farm','villa','apartment','motel'].map(type => <option key={type} value={type}>{t(`propertyTypes.${type}`)}</option>)}</select></label>
        <button type="submit">{t('common.search')}</button>
        {(searchParams.get('checkIn') || searchParams.get('checkOut')) && <p className="results-dates">{t('common.checkIn')}: {searchParams.get('checkIn')} &middot; {t('common.checkOut')}: {searchParams.get('checkOut')} &middot; {t('common.guestCount', { count: guestCount })}</p>}
      </form>
      {/* Header + Sort Bar */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('search.title')}</h1>
          <p className="mt-1 text-gray-400 text-sm">
            {t('search.hotelsFound', { count: sortedHotels.length })} {location && t('search.inLocation', { location })}
          </p>
        </div>

        {/* Sort Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-white/5 ring-1 ring-white/10 p-1 rounded-xl">
          {sortOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setSortMode(opt.value); setVisibleCount(PAGE_SIZE) }}
              aria-pressed={sortMode === opt.value}
              aria-label={t(opt.labelKey)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                sortMode === opt.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <opt.icon className="w-3.5 h-3.5" />
              <span>{t(opt.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {sortedHotels.length === 0 && !error ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-white/5 ring-1 ring-white/10 rounded-full flex items-center justify-center mx-auto">
            <MapPin className="w-8 h-8 text-gray-400" />
          </div>
          <p className="mt-4 text-gray-400 text-lg">{t('common.noResults')}</p>
          <button
            onClick={() => navigate('/search')}
            className="mt-4 text-primary-600 font-medium text-sm hover:underline"
          >
            {t('common.viewAllProperties')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedHotels.slice(0, visibleCount).map((hotel) => {
              const minPrice = getMinPrice(hotel)
              return (
                <Link
                  key={hotel.id}
                  to={`/hotel/${hotel.id}?${searchParams.toString()}`}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group cursor-pointer"
                >
                  <div className="relative overflow-hidden aspect-[16/10]">
                    <img
                      src={optimizeImageUrl(hotel.images?.[0] || 'https://images.pexels.com/photos/258154/pexels-photo-258154.jpeg?auto=compress&cs=tinysrgb&w=600', 600)}
                      srcSet={getImageSrcSet(hotel.images?.[0] || '', [400, 600, 800])}
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      alt={hotel.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute top-3 start-3 bg-white/90 backdrop-blur px-2.5 py-1 rounded-lg">
                      <span className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide capitalize">
                        {t(`propertyTypes.${hotel.property_type || 'hotel'}`)}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <h3 className="font-semibold text-primary-700 text-lg">{hotel.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1.5 text-gray-500">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="text-sm">{hotel.city}, {hotel.location}</span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 text-gray-500">
                      <Users className="w-3.5 h-3.5" />
                      <span className="text-sm">{t('common.upTo')} {t('common.guestCount', { count: getMaxGuests(hotel) })}</span>
                    </div>

                    {hotel.amenities && hotel.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {hotel.amenities.slice(0, 3).map(a => (
                          <span key={a} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {amenityLabel(t, a)}
                          </span>
                        ))}
                        {hotel.amenities.length > 3 && (
                          <span className="text-xs text-gray-400 px-1">+{hotel.amenities.length - 3}</span>
                        )}
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-end justify-between">
                      {minPrice !== null ? (
                        <div>
                          <p className="text-xs text-gray-500">{t('common.from')}</p>
                          <p className="text-xl font-bold text-primary-600">
                            {formatPrice(minPrice, hotel.currency || 'USD')}
                            <span className="text-sm font-normal text-gray-500">/{t('common.night')}</span>
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">{t('common.priceOnRequest')}</p>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {visibleCount < sortedHotels.length && (
            <div className="flex justify-center mt-8">
              <button
                onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-medium text-gray-200 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <ChevronDown className="w-4 h-4" />
                {t('common.loadMore')} ({sortedHotels.length - visibleCount} {t('common.remaining')})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
