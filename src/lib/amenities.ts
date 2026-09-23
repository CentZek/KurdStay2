import type { TFunction } from 'i18next'

const AMENITY_SLUGS: Record<string, string> = {
  WiFi: 'wifi',
  Parking: 'parking',
  Pool: 'pool',
  Gym: 'gym',
  Spa: 'spa',
  Restaurant: 'restaurant',
  Bar: 'bar',
  'Room Service': 'roomService',
  Breakfast: 'breakfast',
  'Air Conditioning': 'airConditioning',
  Laundry: 'laundry',
  'Airport Shuttle': 'airportShuttle',
  'Business Center': 'businessCenter',
  'Pet Friendly': 'petFriendly',
  'Kids Club': 'kidsClub',
  'Beach Access': 'beachAccess',
  Balcony: 'balcony',
  Kitchen: 'kitchen',
  TV: 'tv',
  Safe: 'safe',
  'Mini Bar': 'miniBar',
  'Hair Dryer': 'hairDryer',
  Iron: 'iron',
  'Coffee Maker': 'coffeeMaker',
  Elevator: 'elevator',
  'Wheelchair Accessible': 'wheelchairAccessible',
  '24h Reception': 'reception24h',
  Garden: 'garden',
  Terrace: 'terrace',
  'Hot Tub': 'hotTub',
}

export function amenityLabel(t: TFunction, name: string): string {
  const slug = AMENITY_SLUGS[name]
  return slug ? t(`amenities.${slug}`) : name
}
