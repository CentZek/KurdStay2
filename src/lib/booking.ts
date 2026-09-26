import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value)) && format(parseISO(value), 'yyyy-MM-dd') === value
}

export function stayNights(checkIn: string, checkOut: string): number {
  if (!validDate(checkIn) || !validDate(checkOut)) return 0
  const nights = differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn))
  return nights > 0 && nights <= 365 ? nights : 0
}

export function bookingErrorKey(message: string): string {
  if (message.includes('ROOM_UNAVAILABLE') || message.includes('PROPERTY_UNAVAILABLE')) return 'booking.unavailable'
  if (message.includes('PRICE_CHANGED')) return 'booking.priceChanged'
  if (message.includes('INVALID_DATES')) return 'booking.invalidDates'
  if (message.includes('INVALID_CAPACITY')) return 'ux.guestCapacity'
  return 'booking.submitFailed'
}
