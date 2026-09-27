export interface ChatCriteria { city: string | null; checkIn: string | null; checkOut: string | null; guests: number | null; rooms: number; propertyType: string | null; maxTotal: number | null; currency: string | null; amenities: string[] }
export interface ChatStay { id: string; roomId: string; name: string; city: string; image: string | null; roomName: string; total: number; currency: string; nights: number; guests: number; rooms: number; checkIn: string; checkOut: string; amenities: string[] }
export const emptyCriteria: ChatCriteria = { city:null,checkIn:null,checkOut:null,guests:null,rooms:1,propertyType:null,maxTotal:null,currency:null,amenities:[] }
export function chatStayUrl(stay: ChatStay): string {
  if (!/^[0-9a-f-]{36}$/i.test(stay.id)) return '/search'
  return `/hotel/${stay.id}?${new URLSearchParams({checkIn:stay.checkIn,checkOut:stay.checkOut,guests:String(stay.guests),rooms:String(stay.rooms),room:stay.roomId})}`
}
