import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Plus, X, Trash2, MapPin, ChevronLeft, Building2, Image as ImageIcon, Sparkles, Settings2, Globe } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import ImageUploader from '../../components/ImageUploader'
import PropertyMediaEditor from '../../components/PropertyMediaEditor'
import { videoColumns, videoFromRow } from '../../lib/socialVideo'
import type { PropertyVideoValue } from '../../lib/propertyVideo'
import AmenityPicker from '../../components/AmenityPicker'

interface Hotel {
  id: string
  name: string
  city: string
  location: string
  status: string
  profit_margin_percentage: number
  owner_id: string | null
  description: string
  address: string
  country: string
  images: string[]
  social_video_url?: string | null
  video_url?: string | null
  video_poster_url?: string | null
  amenities: string[]
  property_type: string
  phone: string | null
  contact_person: string | null
  currency: string
  latitude: number | null
  longitude: number | null
}

interface Owner {
  id: string
  name: string
  email: string
}

type FormStep = 'basics' | 'images' | 'amenities' | 'settings'

export default function AdminHotels() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [owners, setOwners] = useState<Owner[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<FormStep>('basics')
  const formRef = useRef<HTMLFormElement>(null)

  const [form, setForm] = useState({
    name: '', city: '', location: '', description: '', address: '',
    country: 'Iraq', profit_margin_percentage: '10', owner_id: '',
    status: 'active', property_type: 'hotel',
    phone: '', contact_person: '', currency: 'USD',
    latitude: '', longitude: '',
  })
  const [formImages, setFormImages] = useState<string[]>([])
  const [formVideo, setFormVideo] = useState<PropertyVideoValue | null>(null)
  const [videoBusy, setVideoBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [formAmenities, setFormAmenities] = useState<string[]>([])

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchHotels()
      fetchOwners()
    }
  }, [profile])

  async function fetchHotels() {
    const { data } = await supabase.from('hotels').select('*').order('created_at', { ascending: false })
    setHotels(data || [])
    setLoading(false)
  }

  async function fetchOwners() {
    const { data } = await supabase.from('profiles').select('id, name, email').eq('role', 'hotel_owner')
    setOwners(data || [])
  }

  function openEditForm(hotel: Hotel) {
    setEditingHotel(hotel)
    setForm({
      name: hotel.name,
      city: hotel.city,
      location: hotel.location,
      description: hotel.description || '',
      address: hotel.address || '',
      country: hotel.country,
      profit_margin_percentage: String(hotel.profit_margin_percentage),
      owner_id: hotel.owner_id || '',
      status: hotel.status,
      property_type: hotel.property_type || 'hotel',
      phone: hotel.phone || '',
      contact_person: hotel.contact_person || '',
      currency: hotel.currency || 'USD',
      latitude: hotel.latitude != null ? String(hotel.latitude) : '',
      longitude: hotel.longitude != null ? String(hotel.longitude) : '',
    })
    setFormImages(hotel.images || [])
    setFormVideo(videoFromRow(hotel))
    setSaveError('')
    setFormAmenities(hotel.amenities || [])
    setCurrentStep('basics')
    setShowForm(true)
  }

  function openAddForm() {
    setEditingHotel(null)
    setForm({
      name: '', city: '', location: '', description: '', address: '',
      country: 'Iraq', profit_margin_percentage: '10', owner_id: '',
      status: 'active', property_type: 'hotel',
      phone: '', contact_person: '', currency: 'USD',
      latitude: '', longitude: '',
    })
    setFormImages([])
    setFormVideo(null)
    setSaveError('')
    setFormAmenities([])
    setCurrentStep('basics')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || videoBusy) return
    setSaveError('')
    setSubmitting(true)

    const payload = {
      name: form.name,
      city: form.city,
      location: form.location,
      description: form.description,
      address: form.address,
      country: form.country,
      profit_margin_percentage: parseFloat(form.profit_margin_percentage),
      owner_id: form.owner_id || null,
      images: formVideo?.poster && (!formImages.length || (formImages.length === 1 && formImages[0] === editingHotel?.video_poster_url)) ? [formVideo.poster] : formImages,
      ...videoColumns(formVideo),
      amenities: formAmenities,
      status: form.status,
      property_type: form.property_type,
      phone: form.phone || null,
      contact_person: form.contact_person || null,
      currency: form.currency,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
    }

    const { error } = editingHotel
      ? await supabase.from('hotels').update(payload).eq('id', editingHotel.id)
      : await supabase.from('hotels').insert(payload)
    setSubmitting(false)
    if (error) { setSaveError(t('video.saveFailed')); return }
    setShowForm(false)
    fetchHotels()
  }

  async function deleteHotel(id: string) {
    await supabase.from('hotels').delete().eq('id', id)
    setDeleteConfirm(null)
    fetchHotels()
  }

  const steps: { id: FormStep; label: string; icon: React.ReactNode }[] = [
    { id: 'basics', label: t('common.details'), icon: <Building2 className="w-4 h-4" /> },
    { id: 'images', label: t('video.media'), icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'amenities', label: t('hotel.amenities'), icon: <Sparkles className="w-4 h-4" /> },
    { id: 'settings', label: t('common.settings'), icon: <Settings2 className="w-4 h-4" /> },
  ]

  function nextStep() {
    const idx = steps.findIndex(s => s.id === currentStep)
    if (idx < steps.length - 1) setCurrentStep(steps[idx + 1].id)
  }

  function prevStep() {
    const idx = steps.findIndex(s => s.id === currentStep)
    if (idx > 0) setCurrentStep(steps[idx - 1].id)
  }

  const imageFolder = editingHotel ? editingHotel.id : `new-${Date.now()}`

  if (profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('admin.accessDenied')}</p></div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('admin.hotels')}</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/import-hotel')}
            className="border border-blue-200 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors flex items-center gap-2"
          >
            <Globe className="w-4 h-4" />
            {t('admin.hotelsForm.importBooking')}
          </button>
          <button
            onClick={openAddForm}
            className="bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('admin.addHotel')}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('common.hotel')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('admin.hotelsForm.tableType')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('common.location')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('admin.hotelsForm.tableImages')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('admin.hotelsForm.currency')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('admin.marginPercentage')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('common.status')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hotels.map(hotel => (
                  <tr key={hotel.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {hotel.images?.[0] ? (
                          <img src={hotel.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{hotel.name}</div>
                          <div className="text-xs text-gray-400">{hotel.address || hotel.city}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                        {hotel.property_type || 'hotel'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{hotel.city}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{t('admin.hotelsForm.photosCount', { count: hotel.images?.length || 0 })}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        hotel.currency === 'IQD' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {hotel.currency || 'USD'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                        {hotel.profit_margin_percentage}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        hotel.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {hotel.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditForm(hotel)}
                          className="text-primary-600 hover:underline text-xs font-medium"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(hotel.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title={t('admin.hotelsForm.deleteHotelTitle')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 m-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('admin.hotelsForm.deleteTitle')}</h3>
            <p className="text-sm text-gray-600 mb-6">{t('admin.hotelsForm.deleteWarning')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => deleteHotel(deleteConfirm)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-step Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col m-4 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingHotel ? t('admin.editHotel') : t('admin.addHotel')}
              </h2>
              <button disabled={videoBusy} aria-label={t('common.cancel')} onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Step Navigation */}
            <div className="flex border-b border-gray-100 px-6 overflow-x-auto">
              {steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  disabled={videoBusy}
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    currentStep === step.id
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {step.icon}
                  {step.label}
                </button>
              ))}
            </div>

            {/* Form Content */}
            <form ref={formRef} onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
              {saveError && <p role="alert" className="feedback-message error">{saveError}</p>}
              {/* Step 1: Basic Details */}
              {currentStep === 'basics' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.hotelName')} *</label>
                      <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder={t('admin.hotelsForm.hotelNamePlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm text-gray-600 font-medium">{t('hotel.description')}</label>
                      <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                        placeholder={t('admin.hotelsForm.descriptionPlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.propertyType')} *</label>
                      <select value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="hotel">{t('admin.hotelsForm.typeHotel')}</option>
                        <option value="motel">{t('admin.hotelsForm.typeMotel')}</option>
                        <option value="apartment">{t('admin.hotelsForm.typeApartment')}</option>
                        <option value="villa">{t('admin.hotelsForm.typeVilla')}</option>
                        <option value="farm">{t('admin.hotelsForm.typeFarm')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.city')} *</label>
                      <input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                        placeholder={t('admin.hotelsForm.cityPlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.address')} *</label>
                      <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                        placeholder={t('admin.hotelsForm.addressPlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.locationArea')}</label>
                      <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                        placeholder={t('admin.hotelsForm.locationAreaPlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.country')}</label>
                      <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                  </div>

                  {/* GPS Coordinates */}
                  <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="w-4 h-4 text-primary-600" />
                      <label className="text-sm text-gray-700 font-medium">{t('admin.hotelsForm.gpsCoordinates')}</label>
                      <span className="text-xs text-gray-400">{t('admin.hotelsForm.gpsOptional')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <input type="number" step="any" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })}
                          placeholder={t('admin.hotelsForm.latitudePlaceholder')}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      </div>
                      <div>
                        <input type="number" step="any" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })}
                          placeholder={t('admin.hotelsForm.longitudePlaceholder')}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Images */}
              {currentStep === 'images' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">{t('admin.hotelsForm.photosTitle')}</h3>
                    <p className="text-xs text-gray-400 mb-4">
                      {t('admin.hotelsForm.photosHelp')}
                    </p>
                    <ImageUploader
                      images={formImages}
                      onChange={setFormImages}
                      folder={imageFolder}
                    />
                    <PropertyMediaEditor value={formVideo} onChange={setFormVideo} onBusyChange={setVideoBusy} />
                  </div>
                </div>
              )}

              {/* Step 3: Amenities */}
              {currentStep === 'amenities' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">{t('admin.hotelsForm.amenitiesTitle')}</h3>
                    <p className="text-xs text-gray-400 mb-4">
                      {t('admin.hotelsForm.amenitiesHelp')}
                    </p>
                    <AmenityPicker
                      amenities={formAmenities}
                      onChange={setFormAmenities}
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Settings */}
              {currentStep === 'settings' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-600 font-medium">{t('admin.marginPercentage')} *</label>
                      <input type="number" step="0.01" required value={form.profit_margin_percentage}
                        onChange={e => setForm({ ...form, profit_margin_percentage: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.currency')} *</label>
                      <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="USD">USD ($)</option>
                        <option value="IQD">{t('admin.hotelsForm.currencyIqd')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.contactPerson')}</label>
                      <input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })}
                        placeholder={t('admin.hotelsForm.contactPersonPlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 font-medium">{t('common.phone')}</label>
                      <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                        placeholder={t('admin.hotelsForm.phonePlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.owner')}</label>
                      <select value={form.owner_id} onChange={e => setForm({ ...form, owner_id: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="">{t('admin.hotelsForm.noOwner')}</option>
                        {owners.map(o => <option key={o.id} value={o.id}>{o.name} ({o.email})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 font-medium">{t('common.status')}</label>
                      <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="active">{t('admin.hotelsForm.statusActive')}</option>
                        <option value="inactive">{t('admin.hotelsForm.statusInactive')}</option>
                        <option value="pending">{t('booking.status.pending')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              <div>
                {currentStep !== 'basics' && (
                  <button
                    type="button"
                    onClick={prevStep}
                    disabled={videoBusy}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {t('common.back')}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {currentStep !== 'settings' ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={videoBusy}
                    className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
                  >
                    {t('common.next')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => formRef.current?.requestSubmit()}
                    disabled={submitting || videoBusy}
                    className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {submitting ? t('admin.hotelsForm.saving') : (editingHotel ? t('admin.hotelsForm.updateHotel') : t('admin.hotelsForm.createHotel'))}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
