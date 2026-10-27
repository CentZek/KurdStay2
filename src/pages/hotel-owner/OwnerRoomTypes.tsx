import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { Plus, X, ArrowLeft, Image, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { amenityLabel } from '../../lib/amenities'
import AdminDialog from '../../components/AdminDialog'

interface RoomType {
  id: string
  name: string
  description: string
  max_guests: number
  base_price: number
  amenities: string[]
  images: string[]
}

interface Hotel {
  id: string
  name: string
  currency: string
}

const EMPTY_FORM = { name: '', description: '', max_guests: '2', base_price: '', amenities: '' }

export default function OwnerRoomTypes() {
  const { hotelId } = useParams()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const requestId = useRef(0)
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [hotel, setHotel] = useState<Hotel | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RoomType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageRoom, setImageRoom] = useState<RoomType | null>(null)
  const [newImageUrl, setNewImageUrl] = useState('')
  const [feedback, setFeedback] = useState('')
  const [feedbackError, setFeedbackError] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setFeedback('')
    setFeedbackError(false)

    async function fetchData() {
      try {
        const [roomsRes, hotelRes] = await Promise.all([
          supabase.from('room_types').select('*').eq('hotel_id', hotelId).order('created_at'),
          supabase.from('hotels').select('id, name, currency').eq('id', hotelId).maybeSingle(),
        ])
        if (currentRequest !== requestId.current) return
        if (roomsRes.error || hotelRes.error) {
          setRoomTypes([])
          setHotel(null)
          setFeedbackError(true)
          setFeedback(t('common.errorOccurred'))
          return
        }
        setRoomTypes(roomsRes.data || [])
        setHotel(hotelRes.data)
      } catch {
        if (currentRequest !== requestId.current) return
        setRoomTypes([])
        setHotel(null)
        setFeedbackError(true)
        setFeedback(t('common.errorOccurred'))
      } finally {
        if (currentRequest === requestId.current) setLoading(false)
      }
    }

    fetchData()
    return () => { requestId.current += 1 }
  }, [hotelId, t])

  async function refreshRooms() {
    const { data, error } = await supabase.from('room_types').select('*').eq('hotel_id', hotelId).order('created_at')
    if (error) throw error
    setRoomTypes(data || [])
  }

  function showError() {
    setFeedbackError(true)
    setFeedback(t('common.errorOccurred'))
  }

  function openAdd() {
    if (saving || deletingId) return
    setEditing(null)
    setForm(EMPTY_FORM)
    setFeedback('')
    setShowForm(true)
  }

  function openEdit(room: RoomType) {
    if (saving || deletingId) return
    setEditing(room)
    setForm({
      name: room.name,
      description: room.description || '',
      max_guests: String(room.max_guests),
      base_price: String(room.base_price),
      amenities: (room.amenities || []).join(', '),
    })
    setFeedback('')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving || deletingId || !hotelId) return
    setSaving(true)
    setFeedback('')
    setFeedbackError(false)
    const payload = {
      hotel_id: hotelId,
      name: form.name,
      description: form.description,
      max_guests: parseInt(form.max_guests),
      base_price: parseFloat(form.base_price),
      amenities: form.amenities ? form.amenities.split(',').map(s => s.trim()).filter(Boolean) : [],
    }

    try {
      const { data, error } = editing
        ? await supabase.from('room_types').update(payload).eq('id', editing.id).select('id').single()
        : await supabase.from('room_types').insert(payload).select('id').single()
      if (error || !data) throw error || new Error('Room type was not saved')
      setShowForm(false)
      setFeedbackError(false)
      setFeedback(t('ux.saved'))
      await refreshRooms()
    } catch {
      showError()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (saving || deletingId || imageBusy || !confirm(t('owner.confirmDeleteRoomType'))) return
    setDeletingId(id)
    setFeedback('')
    setFeedbackError(false)
    try {
      const { data, error } = await supabase.from('room_types').delete().eq('id', id).select('id').maybeSingle()
      if (error || !data) throw error || new Error('Room type was not deleted')
      setRoomTypes(prev => prev.filter(room => room.id !== id))
      setFeedback(t('ux.saved'))
    } catch {
      showError()
    } finally {
      setDeletingId(null)
    }
  }

  async function addRoomImage() {
    if (!imageRoom || !newImageUrl.trim() || imageBusy) return
    setImageBusy(true)
    setFeedback('')
    setFeedbackError(false)
    const updated = [...(imageRoom.images || []), newImageUrl.trim()]
    try {
      const { data, error } = await supabase.from('room_types').update({ images: updated }).eq('id', imageRoom.id).select('id').single()
      if (error || !data) throw error || new Error('Room image was not saved')
      setImageRoom({ ...imageRoom, images: updated })
      setRoomTypes(prev => prev.map(room => room.id === imageRoom.id ? { ...room, images: updated } : room))
      setNewImageUrl('')
      setFeedback(t('ux.saved'))
    } catch {
      showError()
    } finally {
      setImageBusy(false)
    }
  }

  async function removeRoomImage(index: number) {
    if (!imageRoom || imageBusy) return
    setImageBusy(true)
    setFeedback('')
    setFeedbackError(false)
    const updated = imageRoom.images.filter((_, i) => i !== index)
    try {
      const { data, error } = await supabase.from('room_types').update({ images: updated }).eq('id', imageRoom.id).select('id').single()
      if (error || !data) throw error || new Error('Room image was not saved')
      setImageRoom({ ...imageRoom, images: updated })
      setRoomTypes(prev => prev.map(room => room.id === imageRoom.id ? { ...room, images: updated } : room))
      setFeedback(t('ux.saved'))
    } catch {
      showError()
    } finally {
      setImageBusy(false)
    }
  }

  if (profile?.role !== 'hotel_owner' && profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('owner.accessDenied')}</p></div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/owner" aria-label={t('common.back')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t('owner.roomTypes')}</h1>
          {hotel && <p className="text-sm text-gray-500">{hotel.name}</p>}
        </div>
        <button onClick={openAdd} disabled={saving || Boolean(deletingId)}
          className="bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors flex items-center gap-2 disabled:opacity-50">
          <Plus className="w-4 h-4" />
          {t('owner.addRoomType')}
        </button>
      </div>

      {feedback && !showForm && !imageRoom && <div role={feedbackError ? 'alert' : 'status'} className={`feedback-message ${feedbackError ? 'error' : ''}`}>{feedback}</div>}
      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : roomTypes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">{t('owner.noRoomTypes')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {roomTypes.map(room => (
            <div key={room.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {room.images && room.images.length > 0 && (
                <div className="flex h-24 overflow-hidden border-b border-gray-100">
                  {room.images.slice(0, 4).map((img, i) => (
                    <div key={i} className="flex-1 min-w-0">
                      <img src={img} alt={t('owner.photoAlt', { n: i + 1 })} className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {room.images.length > 4 && (
                    <div className="w-24 bg-gray-800 flex items-center justify-center text-white text-sm font-medium">
                      +{room.images.length - 4}
                    </div>
                  )}
                </div>
              )}

              <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{room.name}</h3>
                  {room.description && <p className="text-sm text-gray-500 mt-0.5">{room.description}</p>}
                  <div className="flex gap-4 mt-2 text-sm text-gray-600">
                    <span>{t('owner.maxGuestsValue', { n: room.max_guests })}</span>
                    <span>{t('owner.basePriceLabel')} <strong>{formatPrice(room.base_price, hotel)}</strong></span>
                  </div>
                  {room.amenities && room.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {room.amenities.map(a => (
                        <span key={a} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{amenityLabel(t, a)}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setImageRoom(room); setNewImageUrl(''); setFeedback('') }} disabled={saving || Boolean(deletingId)}
                    className="text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-100 flex items-center gap-1 disabled:opacity-50">
                    <Image className="w-3.5 h-3.5" />
                    {t('owner.photosCount', { n: room.images?.length || 0 })}
                  </button>
                  <button onClick={() => openEdit(room)} disabled={saving || Boolean(deletingId)}
                    className="text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary-100 disabled:opacity-50">
                    {t('common.edit')}
                  </button>
                  <button onClick={() => handleDelete(room.id)} disabled={saving || Boolean(deletingId)} aria-label={`${t('common.delete')} ${room.name}`}
                    className="text-red-600 bg-red-50 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <AdminDialog title={editing ? t('owner.editRoomType') : t('owner.addRoomType')} onClose={() => setShowForm(false)} busy={saving} className="room-type-dialog">
          <div className="admin-dialog-header flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">{editing ? t('owner.editRoomType') : t('owner.addRoomType')}</h2>
            <button type="button" disabled={saving} aria-label={t('common.cancel')} onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <form onSubmit={handleSubmit} className="admin-dialog-body space-y-4">
            {feedbackError && feedback && <div role="alert" className="feedback-message error">{feedback}</div>}
            <div>
              <label htmlFor="room-name" className="text-sm text-gray-600 font-medium">{t('owner.roomName')} *</label>
              <input id="room-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={t('owner.roomNamePlaceholder')} disabled={saving}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label htmlFor="room-description" className="text-sm text-gray-600 font-medium">{t('hotel.description')}</label>
              <textarea id="room-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} disabled={saving}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="room-max-guests" className="text-sm text-gray-600 font-medium">{t('owner.maxGuests')} *</label>
                <input id="room-max-guests" type="number" min="1" required value={form.max_guests} disabled={saving}
                  onChange={e => setForm({ ...form, max_guests: e.target.value })}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label htmlFor="room-base-price" className="text-sm text-gray-600 font-medium">{t('owner.basePriceCurrency', { currency: hotel?.currency || 'USD' })} *</label>
                <input id="room-base-price" type="number" step="0.01" min="0" required value={form.base_price} disabled={saving}
                  onChange={e => setForm({ ...form, base_price: e.target.value })}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
            <div>
              <label htmlFor="room-amenities" className="text-sm text-gray-600 font-medium">{t('owner.amenitiesLabel')}</label>
              <input id="room-amenities" value={form.amenities} onChange={e => setForm({ ...form, amenities: e.target.value })} disabled={saving}
                placeholder={t('owner.amenitiesPlaceholder')}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <button type="submit" disabled={saving}
              className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50">
              {saving ? t('ux.saving') : t('common.save')}
            </button>
          </form>
        </AdminDialog>
      )}

      {imageRoom && (
        <AdminDialog title={`${t('owner.roomPhotos')}: ${imageRoom.name}`} onClose={() => setImageRoom(null)} busy={imageBusy} className="room-photos-dialog">
          <div className="admin-dialog-header flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{t('owner.roomPhotos')}</h2>
              <p className="text-sm text-gray-500">{imageRoom.name}</p>
            </div>
            <button type="button" disabled={imageBusy} aria-label={t('common.cancel')} onClick={() => setImageRoom(null)}>
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="admin-dialog-body">
            {feedbackError && feedback && <div role="alert" className="feedback-message error">{feedback}</div>}
            {imageRoom.images && imageRoom.images.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 mb-6">
                {imageRoom.images.map((img, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden aspect-video">
                    <img src={img} alt={t('owner.photoAlt', { n: i + 1 })} className="w-full h-full object-cover" />
                    <button type="button" disabled={imageBusy} aria-label={`${t('common.delete')} ${t('owner.photoAlt', { n: i + 1 })}`}
                      onClick={() => removeRoomImage(i)}
                      className="absolute top-2 end-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:opacity-50">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-xl mb-6">
                <Image className="w-10 h-10 text-gray-300 mx-auto" />
                <p className="mt-2 text-sm text-gray-500">{t('owner.noRoomPhotos')}</p>
              </div>
            )}
            <div className="flex gap-2">
              <label htmlFor="room-image-url" className="sr-only">{t('owner.pasteImageUrl')}</label>
              <input id="room-image-url" type="url" value={newImageUrl} disabled={imageBusy}
                onChange={e => setNewImageUrl(e.target.value)} placeholder={t('owner.pasteImageUrl')}
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <button type="button" onClick={addRoomImage} disabled={!newImageUrl.trim() || imageBusy}
                className="bg-primary-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                {t('owner.add')}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">{t('owner.roomPhotosHelp')}</p>
          </div>
        </AdminDialog>
      )}
    </div>
  )
}

function formatPrice(amount: number, hotel: Hotel | null) {
  if (hotel?.currency === 'IQD') return `${amount.toLocaleString()} IQD`
  return `$${amount}`
}
