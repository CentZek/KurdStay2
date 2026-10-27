import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Users, ChevronDown, AlertCircle, TrendingUp, Flame, ArrowDownNarrowWide, ArrowUpNarrowWide } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { optimizeImageUrl, getImageSrcSet } from '../../lib/imageUtils'
import { amenityLabel } from '../../lib/amenities'
import { baghdadToday, stayNights, validDate } from '../../lib/booking'

interface Hotel {
  id: string
  name: string
  location: string
  city: string
  images: string[]
  amenities: string[]
  property_type: string
  currency: string
  min_price: number
  max_guests: number
  total_count: number
}

type SortMode = 'popular' | 'most_booked' | 'price_low' | 'price_high'

const PAGE_SIZE = 12
const SORT_MODES: SortMode[] = ['popular', 'most_booked', 'price_low', 'price_high']
const PROPERTY_TYPES = ['hotel', 'farm', 'villa', 'apartment', 'motel']

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback
}

export default function SearchResults() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pagination, setPagination] = useState({ key: '', count: PAGE_SIZE })
  const [retryRevision, setRetryRevision] = useState(0)
  const requestRef = useRef(0)
  const loaded = useRef<{ key: string; rows: Hotel[]; total: number }>({ key: '', rows: [], total: 0 })

  const location = (searchParams.get('location') || '').trim().slice(0, 100)
  const requestedType = searchParams.get('type') || ''
  const propertyType = PROPERTY_TYPES.includes(requestedType) ? requestedType : ''
  const requestedSort = searchParams.get('sort') || 'popular'
  const sortMode: SortMode = SORT_MODES.includes(requestedSort as SortMode) ? requestedSort as SortMode : 'popular'
  const occupancyGuests = positiveInteger(searchParams.get('guests'), 1, 100)
  const rooms = positiveInteger(searchParams.get('rooms'), 1, 5)
  const requestedCheckIn = searchParams.get('checkIn') || ''
  const requestedCheckOut = searchParams.get('checkOut') || ''
  const hasDates = validDate(requestedCheckIn) && validDate(requestedCheckOut)
    && requestedCheckIn >= baghdadToday() && stayNights(requestedCheckIn, requestedCheckOut) > 0
  const checkIn = hasDates ? requestedCheckIn : ''
  const checkOut = hasDates ? requestedCheckOut : ''
  const queryKey = JSON.stringify([location, propertyType, checkIn, checkOut, occupancyGuests, rooms, sortMode])
  const visibleCount = pagination.key === queryKey ? pagination.count : PAGE_SIZE

  const normalizedParams = new URLSearchParams()
  if (location) normalizedParams.set('location', location)
  if (propertyType) normalizedParams.set('type', propertyType)
  if (hasDates) {
    normalizedParams.set('checkIn', checkIn)
    normalizedParams.set('checkOut', checkOut)
  }
  normalizedParams.set('guests', String(occupancyGuests))
  if (rooms !== 1) normalizedParams.set('rooms', String(rooms))
  if (sortMode !== 'popular') normalizedParams.set('sort', sortMode)

  useEffect(() => {
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')

    async function fetchHotels() {
      try {
        const cacheKey = `${queryKey}:${retryRevision}`
        const previous = loaded.current.key === cacheKey ? loaded.current : null
        const rows = previous ? [...previous.rows] : []
        let total = previous?.total ?? Infinity
        while (rows.length < visibleCount && rows.length < total) {
          const { data, error: fetchError } = await supabase.rpc('search_hotels', {
            p_location: location || null, p_property_type: propertyType || null,
            p_check_in: checkIn || null, p_check_out: checkOut || null,
            p_guests: occupancyGuests, p_rooms: rooms, p_sort: sortMode,
            p_limit: Math.min(50, visibleCount - rows.length), p_offset: rows.length,
          })
          if (requestId !== requestRef.current) return
          if (fetchError || !Array.isArray(data)) throw fetchError || new Error('Invalid search response')
          if (!data.length) { total = rows.length; break }
          total = Number(data[0].total_count) || 0
          rows.push(...data as Hotel[])
        }
        if (requestId !== requestRef.current) return
        loaded.current = { key: cacheKey, rows, total }
        setHotels(rows)
        setTotalCount(total)
        setLoading(false)
      } catch {
        if (requestId !== requestRef.current) return
        setError(t('common.errorOccurred'))
        setHotels([])
        setTotalCount(0)
        setLoading(false)
      }
    }
    fetchHotels()

    return () => { requestRef.current += 1 }
  }, [queryKey, visibleCount, retryRevision])

  const sortOptions: { value: SortMode; labelKey: string; icon: typeof TrendingUp }[] = [
    { value: 'popular', labelKey: 'search.sortPopular', icon: TrendingUp },
    { value: 'most_booked', labelKey: 'search.sortMostBooked', icon: Flame },
    { value: 'price_low', labelKey: 'search.sortPriceLow', icon: ArrowUpNarrowWide },
    { value: 'price_high', labelKey: 'search.sortPriceHigh', icon: ArrowDownNarrowWide },
  ]

  function changeSort(value: SortMode) {
    const params = new URLSearchParams(searchParams)
    params.set('sort', value)
    setSearchParams(params)
  }

  function formatPrice(amount: number, currency: string) {
    if (currency === 'IQD') return `${Math.round(amount).toLocaleString()} IQD`
    return `$${Math.round(amount)}`
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="status" aria-label={t('common.loading')} aria-busy="true">
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
      <form className="results-filter" onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        const params = new URLSearchParams(searchParams)
        for (const key of ['location', 'type']) {
          const value = String(values.get(key) || '').trim()
          if (value) params.set(key, value)
          else params.delete(key)
        }
        setSearchParams(params)
      }}>
        <label><span>{t('common.location')}</span><input key={location} name="location" defaultValue={location} placeholder={t('common.allDestinations')}/></label>
        <label><span>{t('search.filterBy')}</span><select key={propertyType} name="type" defaultValue={propertyType}><option value="">{t('propertyTypes.all')}</option>{PROPERTY_TYPES.map(type => <option key={type} value={type}>{t(`propertyTypes.${type}`)}</option>)}</select></label>
        <button type="submit">{t('common.search')}</button>
        {hasDates && <p className="results-dates">{t('common.checkIn')}: {checkIn} &middot; {t('common.checkOut')}: {checkOut} &middot; {t('common.guestCount', { count: occupancyGuests })}</p>}
      </form>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('search.title')}</h1>
          <p className="mt-1 text-gray-400 text-sm">
            {t('search.hotelsFound', { count: totalCount })} {location && t('search.inLocation', { location })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 bg-white/5 ring-1 ring-white/10 p-1 rounded-xl">
          {sortOptions.map(option => (
            <button
              key={option.value}
              onClick={() => changeSort(option.value)}
              aria-pressed={sortMode === option.value}
              aria-label={t(option.labelKey)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                sortMode === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <option.icon className="w-3.5 h-3.5" />
              <span>{t(option.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button type="button" className="underline" onClick={() => setRetryRevision(value => value + 1)}>{t('booking.retry')}</button>
        </div>
      )}

      {hotels.length === 0 && !error ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-white/5 ring-1 ring-white/10 rounded-full flex items-center justify-center mx-auto">
            <MapPin className="w-8 h-8 text-gray-400" />
          </div>
          <p className="mt-4 text-gray-400 text-lg">{t('common.noResults')}</p>
          <button onClick={() => navigate('/search')} className="mt-4 text-primary-600 font-medium text-sm hover:underline">
            {t('common.viewAllProperties')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {hotels.map(hotel => (
              <Link
                key={hotel.id}
                to={`/hotel/${hotel.id}?${normalizedParams.toString()}`}
                className="stay-card bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group cursor-pointer"
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
                    <span className="text-sm">{t('common.upTo')} {t('common.guestCount', { count: hotel.max_guests })}</span>
                  </div>
                  {hotel.amenities && hotel.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {hotel.amenities.slice(0, 3).map(amenity => (
                        <span key={amenity} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{amenityLabel(t, amenity)}</span>
                      ))}
                      {hotel.amenities.length > 3 && <span className="text-xs text-gray-400 px-1">+{hotel.amenities.length - 3}</span>}
                    </div>
                  )}
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-gray-500">{t('common.from')}</p>
                      <p className="text-xl font-bold text-primary-600">
                        {formatPrice(Number(hotel.min_price), hotel.currency || 'USD')}
                        <span className="text-sm font-normal text-gray-500">/{t('common.night')}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {hotels.length < totalCount && (
            <div className="flex justify-center mt-8">
              <button
                onClick={() => setPagination({ key: queryKey, count: visibleCount + PAGE_SIZE })}
                className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-medium text-gray-200 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <ChevronDown className="w-4 h-4" />
                {t('common.loadMore')} ({totalCount - hotels.length} {t('common.remaining')})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
