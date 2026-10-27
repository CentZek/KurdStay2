import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'

export const BOOKING_REQUESTS_KEY = 'kurdstay_booking_requests'
export const LEGACY_BOOKING_REQUEST_KEY = 'kurdstay_booking_request'

export interface PendingBookingRequest {
  id: string
  payload: string
}

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value)) && format(parseISO(value), 'yyyy-MM-dd') === value
}

export function stayNights(checkIn: string, checkOut: string): number {
  if (!validDate(checkIn) || !validDate(checkOut)) return 0
  const nights = differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn))
  return nights > 0 && nights <= 365 ? nights : 0
}

export function baghdadToday(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function normalizeOccupancy(guestValue: unknown, roomValue: unknown, maxGuestsPerRoom = 100) {
  const parsedRooms = Number(roomValue)
  const parsedGuests = Number(guestValue)
  const rooms = Number.isInteger(parsedRooms) && parsedRooms >= 1 && parsedRooms <= 5 ? parsedRooms : 1
  const maxGuests = Math.max(1, maxGuestsPerRoom * rooms)
  const guests = Number.isInteger(parsedGuests) && parsedGuests >= 1 ? Math.min(parsedGuests, maxGuests) : Math.min(2, maxGuests)
  return { guests, rooms }
}

export function bookingErrorKey(message: string): string {
  if (message.includes('ROOM_UNAVAILABLE') || message.includes('PROPERTY_UNAVAILABLE')) return 'booking.unavailable'
  if (message.includes('PRICE_CHANGED')) return 'booking.priceChanged'
  if (message.includes('INVALID_DATES')) return 'booking.invalidDates'
  if (message.includes('INVALID_CAPACITY')) return 'ux.guestCapacity'
  if (message.includes('INVALID_CONTACT')) return 'booking.invalidContact'
  return 'booking.submitFailed'
}

function pendingRequest(value: unknown): PendingBookingRequest | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<PendingBookingRequest>
  if (typeof candidate.id !== 'string' || !candidate.id || typeof candidate.payload !== 'string') return null
  try {
    const payload = JSON.parse(candidate.payload)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  } catch {
    return null
  }
  return { id: candidate.id, payload: candidate.payload }
}

function readStorage(key: string): string | null {
  try { return globalThis.sessionStorage?.getItem(key) || null } catch { return null }
}

function writeStorage(key: string, value: string): void {
  try { globalThis.sessionStorage?.setItem(key, value) } catch { /* The in-memory request still supports this attempt. */ }
}

function removeStorage(key: string): void {
  try { globalThis.sessionStorage?.removeItem(key) } catch { /* Storage can be unavailable in private browsing. */ }
}

function readRequestMap(): Record<string, PendingBookingRequest> {
  const raw = readStorage(BOOKING_REQUESTS_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
      const request = pendingRequest(value)
      return request ? [[key, request]] : []
    }))
  } catch {
    return {}
  }
}

export function pendingBookingRequests(hotelId?: string, roomTypeId?: string): PendingBookingRequest[] {
  const requests = Object.values(readRequestMap())
  const legacy = pendingRequest((() => { try { return JSON.parse(readStorage(LEGACY_BOOKING_REQUEST_KEY) || 'null') } catch { return null } })())
  if (legacy && !requests.some(request => request.id === legacy.id)) requests.push(legacy)
  return requests.filter(request => {
    try {
      const payload = JSON.parse(request.payload)
      return (!hotelId || payload.p_hotel_id === hotelId) && (!roomTypeId || payload.p_room_type_id === roomTypeId)
    } catch {
      return false
    }
  })
}

export function reusableBookingRequest(payload: string): PendingBookingRequest | null {
  return pendingBookingRequests().find(request => request.payload === payload) || null
}

export function saveBookingRequest(request: PendingBookingRequest): void {
  const requests = readRequestMap()
  requests[request.payload] = request
  writeStorage(BOOKING_REQUESTS_KEY, JSON.stringify(requests))
}

export function clearBookingRequest(request: PendingBookingRequest): void {
  const requests = readRequestMap()
  for (const [key, candidate] of Object.entries(requests)) {
    if (candidate.id === request.id || key === request.payload) delete requests[key]
  }
  writeStorage(BOOKING_REQUESTS_KEY, JSON.stringify(requests))
  const legacy = pendingRequest((() => { try { return JSON.parse(readStorage(LEGACY_BOOKING_REQUEST_KEY) || 'null') } catch { return null } })())
  if (legacy?.id === request.id) removeStorage(LEGACY_BOOKING_REQUEST_KEY)
}
