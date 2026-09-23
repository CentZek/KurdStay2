import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Users, Wifi, Car, Coffee, Dumbbell, Navigation, ChevronLeft, ChevronRight, AlertCircle, Tv, AirVent, Waves, UtensilsCrossed, Sparkles, ShowerHead, Phone, Bath, BedDouble, Briefcase, Baby, Cigarette, CigaretteOff, ParkingCircle, Shirt, Snowflake, Sun, TreePine, Mountain, Eye, DoorOpen, Flame, Globe, HandPlatter, IceCream, Key, Lamp, Languages, Lock, Luggage, Mail, Map, Maximize, Music, PawPrint, Plane, Power, Receipt, Refrigerator, School, Shield, ShoppingBag, Star, Sunrise, Thermometer, Ticket, Timer, Utensils, Volume2, WashingMachine, Wind, Wine, Zap, CircleDot, Home, Sofa, CookingPot, Gamepad2, Scissors, Heart, Building2, Landmark, Armchair, Stethoscope, Clock, Droplets, Heater, Bed, MonitorSmartphone, Router, Vault } from 'lucide-react'
import { format, addDays, parseISO, isValid } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { optimizeImageUrl, getImageSrcSet } from '../../lib/imageUtils'
import { amenityLabel } from '../../lib/amenities'

interface Hotel {
  id: string
  name: string
  location: string
  city: string
  country: string
  description: string
  address: string
  images: string[]
  amenities: string[]
  currency: string
  latitude: number | null
  longitude: number | null
}

interface RoomType {
  id: string
  name: string
  description: string
  max_guests: number
  base_price: number
  images: string[]
  amenities: string[]
}

const amenityKeywords: [string[], typeof Wifi][] = [
  [['wifi', 'wi-fi', 'internet', 'wireless'], Wifi],
  [['parking', 'garage', 'valet'], Car],
  [['breakfast', 'morning meal'], Coffee],
  [['gym', 'fitness', 'exercise', 'workout'], Dumbbell],
  [['tv', 'television', 'cable', 'satellite', 'flat-screen', 'flatscreen'], Tv],
  [['air conditioning', 'ac', 'air-conditioning', 'climate control', 'cooling'], Snowflake],
  [['heating', 'heater', 'heated'], Heater],
  [['pool', 'swimming'], Waves],
  [['restaurant', 'dining', 'buffet', 'cuisine'], UtensilsCrossed],
  [['spa', 'massage', 'wellness', 'sauna', 'steam', 'jacuzzi', 'hot tub'], Sparkles],
  [['shower', 'hot water', 'rain shower'], ShowerHead],
  [['room service', 'concierge'], Phone],
  [['bath', 'bathtub'], Bath],
  [['balcony', 'terrace', 'patio', 'deck'], Sun],
  [['garden', 'courtyard', 'green'], TreePine],
  [['view', 'mountain view', 'city view', 'sea view', 'lake view'], Eye],
  [['bar', 'lounge', 'drinks'], Wine],
  [['laundry', 'washing', 'ironing', 'dry cleaning'], WashingMachine],
  [['kitchen', 'kitchenette', 'microwave', 'stove', 'cooking'], CookingPot],
  [['refrigerator', 'fridge', 'minibar', 'mini-bar', 'mini bar'], Refrigerator],
  [['safe', 'safety', 'security', 'locker', 'vault'], Vault],
  [['elevator', 'lift'], Building2],
  [['wheelchair', 'accessible', 'disability'], DoorOpen],
  [['non-smoking', 'no smoking', 'smoke-free'], CigaretteOff],
  [['smoking'], Cigarette],
  [['pet', 'dog', 'animal'], PawPrint],
  [['business', 'meeting', 'conference'], Briefcase],
  [['baby', 'child', 'kids', 'crib', 'cot', 'family'], Baby],
  [['bed linen', 'bedding', 'towel', 'linen'], BedDouble],
  [['coffee', 'tea', 'kettle', 'coffee maker', 'espresso'], Coffee],
  [['airport', 'shuttle', 'transfer', 'transport'], Plane],
  [['luggage', 'baggage', 'storage'], Luggage],
  [['24-hour', '24 hour', 'front desk', 'reception'], Clock],
  [['housekeeping', 'cleaning', 'maid'], Sparkles],
  [['hair dryer', 'hairdryer', 'blow dryer'], Wind],
  [['alarm', 'wake-up', 'wake up'], Timer],
  [['soundproof', 'quiet', 'noise'], Volume2],
  [['carpet', 'floor'], Sofa],
  [['clothes', 'wardrobe', 'closet', 'rack', 'hanger'], Shirt],
  [['desk', 'workspace', 'work desk'], Lamp],
  [['telephone', 'phone line'], Phone],
  [['electric', 'power', 'socket', 'outlet', 'plug', 'usb', 'charger'], Power],
  [['fan', 'ventilation'], Wind],
  [['fire', 'fireplace', 'bbq', 'barbecue', 'grill'], Flame],
  [['game', 'billiard', 'board game', 'play'], Gamepad2],
  [['bicycle', 'bike', 'cycling'], Car],
  [['currency', 'exchange', 'atm', 'cash'], Receipt],
  [['salon', 'beauty', 'barber', 'hair'], Scissors],
  [['medical', 'first aid', 'doctor', 'pharmacy'], Stethoscope],
  [['key', 'key card', 'keycard'], Key],
  [['music', 'entertainment'], Music],
  [['rooftop', 'roof'], Sunrise],
  [['sofa', 'seating', 'living room', 'sitting'], Armchair],
  [['connecting', 'adjoining'], DoorOpen],
  [['landmark', 'monument', 'attraction'], Landmark],
  [['newspaper', 'magazine'], Mail],
  [['shop', 'store', 'shopping'], ShoppingBag],
  [['water', 'drinking water', 'bottled water', 'purifier'], Droplets],
  [['monitor', 'smart tv', 'screen'], MonitorSmartphone],
  [['router', 'modem'], Router],
]

function getAmenityIcon(amenity: string): typeof Wifi {
  const lower = amenity.toLowerCase()
  for (const [keywords, icon] of amenityKeywords) {
    if (keywords.some(kw => lower.includes(kw))) return icon
  }
  return CircleDot
}

export default function HotelDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [hotel, setHotel] = useState<Hotel | null>(null)
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeImage, setActiveImage] = useState(0)

  const today = format(new Date(), 'yyyy-MM-dd')
  const checkIn = searchParams.get('checkIn') || ''
  const checkOut = searchParams.get('checkOut') || ''
  const guests = searchParams.get('guests') || '2'

  useEffect(() => {
    if (id) fetchHotel()
  }, [id])

  useEffect(() => {
    if (!id) return
    const startTime = Date.now()
    return () => {
      const duration = Math.round((Date.now() - startTime) / 1000)
      if (duration >= 2) {
        supabase.from('hotel_views').insert({ hotel_id: id, duration_seconds: duration }).then(() => {})
      }
    }
  }, [id])

  async function fetchHotel() {
    setLoading(true)
    setError('')
    const [hotelRes, roomsRes] = await Promise.all([
      supabase.from('hotels').select('id, name, location, city, country, description, address, images, amenities, currency, latitude, longitude').eq('id', id).maybeSingle(),
      supabase.from('room_types').select('*').eq('hotel_id', id),
    ])
    if (hotelRes.error || roomsRes.error) {
      setError(t('common.errorOccurred'))
    }
    setHotel(hotelRes.data)
    setRoomTypes(roomsRes.data || [])
    setLoading(false)
  }

  function formatPrice(amount: number) {
    if (!hotel) return `$${amount.toFixed(0)}`
    if (hotel.currency === 'IQD') return `${Math.round(amount).toLocaleString()} IQD`
    return `$${Math.round(amount)}`
  }

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(key, value)
    else params.delete(key)
    if (key === 'checkIn' && checkOut && (!value || value >= checkOut)) params.delete('checkOut')
    setSearchParams(params, { replace: true })
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="aspect-[16/9] bg-gray-200 rounded-2xl" />
          <div className="h-8 bg-gray-200 rounded w-1/2" />
          <div className="h-5 bg-gray-200 rounded w-1/3" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-red-600"><AlertCircle className="w-5 h-5" /> {error}</div>
      </div>
    )
  }

  if (!hotel) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t('common.notFound')}</p>
      </div>
    )
  }

  const images = hotel.images?.length > 0
    ? hotel.images
    : [
        'https://images.pexels.com/photos/258154/pexels-photo-258154.jpeg?auto=compress&cs=tinysrgb&w=800',
        'https://images.pexels.com/photos/1134176/pexels-photo-1134176.jpeg?auto=compress&cs=tinysrgb&w=800',
        'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=800',
      ]

  const canGoPrev = activeImage > 0
  const canGoNext = activeImage < images.length - 1

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Gallery */}
      <div className="relative rounded-2xl overflow-hidden mb-8">
        <div className="aspect-[16/9] sm:aspect-[2.4/1]">
          <img
            src={optimizeImageUrl(images[activeImage], 1200)}
            srcSet={getImageSrcSet(images[activeImage], [600, 900, 1200, 1800])}
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 90vw, 1200px"
            alt={hotel.name}
            className="w-full h-full object-cover"
            decoding="async"
          />
        </div>

        {images.length > 1 && (
          <>
            <button
              onClick={() => setActiveImage(i => Math.max(0, i - 1))}
              disabled={!canGoPrev}
              className="absolute start-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg disabled:opacity-30 hover:bg-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <button
              onClick={() => setActiveImage(i => Math.min(images.length - 1, i + 1))}
              disabled={!canGoNext}
              className="absolute end-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg disabled:opacity-30 hover:bg-white transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          </>
        )}

        <div className="absolute bottom-3 end-3 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur">
          {activeImage + 1} / {images.length}
        </div>
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveImage(i)}
              className={`shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                activeImage === i ? 'border-primary-500' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <img src={optimizeImageUrl(img, 160)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Info */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-primary-400">{hotel.name}</h1>
            <div className="flex items-center gap-1.5 mt-2 text-gray-300">
              <MapPin className="w-4 h-4" />
              <span>{hotel.address || `${hotel.city}, ${hotel.location}, ${hotel.country}`}</span>
            </div>
            {(hotel.latitude && hotel.longitude) && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${hotel.latitude},${hotel.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                <Navigation className="w-4 h-4" />
                {t('hotel.getDirections')}
              </a>
            )}
          </div>

          {hotel.description && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">{t('hotel.description')}</h2>
              <p className="text-gray-300 leading-relaxed">{hotel.description}</p>
            </div>
          )}

          {hotel.amenities && hotel.amenities.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">{t('hotel.amenities')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {hotel.amenities.map(amenity => {
                  const Icon = getAmenityIcon(amenity)
                  return (
                    <div key={amenity} className="flex items-center gap-2 p-3 bg-white/5 ring-1 ring-white/10 rounded-xl">
                      <Icon className="w-4 h-4 text-primary-400" />
                      <span className="text-sm text-gray-200">{amenityLabel(t, amenity)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Room Types */}
          <div id="room-types">
            <h2 className="text-lg font-semibold text-white mb-4">{t('hotel.roomTypes')}</h2>
            {roomTypes.length === 0 ? (
              <div className="bg-white/5 ring-1 ring-white/10 rounded-2xl p-8 text-center">
                <p className="text-gray-400">{t('hotel.noRoomsAvailable')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {roomTypes.map(room => (
                  <div
                    key={room.id}
                    className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-primary-500/40 hover:bg-white/[0.07] transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-white">{room.name}</h3>
                        {room.description && (
                          <p className="text-sm text-gray-400 mt-1">{room.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 text-gray-400">
                          <Users className="w-4 h-4" />
                          <span className="text-sm">
                            {room.max_guests} {t('common.guests')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-end gap-4">
                        <div className="text-end">
                          <p className="text-2xl font-bold text-primary-400">
                            {formatPrice(room.base_price)}
                          </p>
                          <p className="text-xs text-gray-400">{t('common.pricePerNight')}</p>
                        </div>
                        <button
                          onClick={() => navigate(`/booking/${hotel.id}/${room.id}?${searchParams.toString()}`)}
                          className="bg-primary-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors whitespace-nowrap"
                        >
                          {t('common.bookNow')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 order-first lg:order-last">
          <div className="lg:sticky top-24 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">{t('hotel.selectDates')}</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="detail-check-in" className="text-xs text-gray-500 font-medium">{t('common.checkIn')}</label>
                <input
                  type="date" id="detail-check-in"
                  value={checkIn}
                  min={today}
                  onChange={e => {
                    updateParam('checkIn', e.target.value)
                  }}
                  className="w-full min-w-0 max-w-full box-border appearance-none mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label htmlFor="detail-check-out" className="text-xs text-gray-500 font-medium">{t('common.checkOut')}</label>
                <input
                  type="date" id="detail-check-out"
                  value={checkOut}
                  min={format(addDays(parseISO(isValid(parseISO(checkIn)) ? checkIn : today), 1), 'yyyy-MM-dd')}
                  onChange={e => updateParam('checkOut', e.target.value)}
                  className="w-full min-w-0 max-w-full box-border appearance-none mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label htmlFor="detail-guests" className="text-xs text-gray-500 font-medium">{t('common.guests')}</label>
                <select id="detail-guests"
                  value={guests}
                  onChange={e => updateParam('guests', e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>{n} {t('common.guests')}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
