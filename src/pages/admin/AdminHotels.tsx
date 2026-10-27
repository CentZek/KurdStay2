import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Plus, X, Trash2, MapPin, ChevronLeft, Building2, Image as ImageIcon, Sparkles, Settings2, Globe } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import AdminDialog from '../../components/AdminDialog'
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
  const [imageBusy, setImageBusy] = useState(false)
  const [pageError, setPageError] = useState('')
  const [ownersError, setOwnersError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const busy = submitting || videoBusy || imageBusy
  const [saveError, setSaveError] = useState('')
  const [formAmenities, setFormAmenities] = useState<string[]>([])

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchHotels()
      fetchOwners()
    }
  }, [profile])

  async function fetchHotels() {
    setLoading(true)
    setPageError('')
    try {
      const { data, error } = await supabase.from('hotels').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setHotels(data || [])
    } catch { setPageError(t('common.errorOccurred')) }
    finally { setLoading(false) }
  }

  async function fetchOwners() {
    setOwnersError('')
    try {
      const { data, error } = await supabase.from('profiles').select('id, name, email').eq('role', 'hotel_owner')
      if (error) throw error
      setOwners(data || [])
    } catch { setOwnersError(t('common.errorOccurred')) }
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
    if (busy) return
    if (currentStep !== 'settings') { nextStep(); return }
    if (!validateFields()) return
    setSaveError('')
    setSubmitting(true)

    const payload = {
      name: form.name.trim(),
      city: form.city.trim(),
      location: form.location,
      description: form.description,
      address: form.address.trim(),
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

    try {
      const result = editingHotel
        ? await supabase.from('hotels').update(payload).eq('id', editingHotel.id).select('id').single()
        : await supabase.from('hotels').insert(payload).select('id').single()
      if (result.error) throw result.error
      setShowForm(false)
      await fetchHotels()
    } catch { setSaveError(t('video.saveFailed')) }
    finally { setSubmitting(false) }
  }

  async function deleteHotel(id: string) {
    if (deleting) return
    setDeleting(true)
    setPageError('')
    try {
      const { error } = await supabase.from('hotels').delete().eq('id', id).select('id').single()
      if (error) throw error
      setDeleteConfirm(null)
      await fetchHotels()
    } catch { setPageError(t('common.errorOccurred')) }
    finally { setDeleting(false) }
  }

  const steps: { id: FormStep; label: string; icon: React.ReactNode }[] = [
    { id: 'basics', label: t('common.details'), icon: <Building2 className="w-4 h-4" /> },
    { id: 'images', label: t('video.media'), icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'amenities', label: t('hotel.amenities'), icon: <Sparkles className="w-4 h-4" /> },
    { id: 'settings', label: t('common.settings'), icon: <Settings2 className="w-4 h-4" /> },
  ]

  function validateFields(step?: FormStep) {
    const fields = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')
    for (const field of Array.from(fields || [])) {
      const fieldStep = field.closest<HTMLElement>('[data-step]')?.dataset.step as FormStep
      if (step && fieldStep !== step) continue
      if (field.required && field.type === 'text') field.setCustomValidity(field.value.trim() ? '' : t('common.required'))
      if (!field.checkValidity()) {
        setCurrentStep(fieldStep || 'basics')
        requestAnimationFrame(() => field.reportValidity())
        return false
      }
    }
    return true
  }

  function goToStep(step: FormStep) {
    if (busy) return
    const index = steps.findIndex(s => s.id === currentStep)
    const target = steps.findIndex(s => s.id === step)
    if (target > index && !validateFields(currentStep)) return
    setCurrentStep(step)
    formRef.current?.scrollTo({ top: 0 })
  }

  function nextStep() {
    const idx = steps.findIndex(s => s.id === currentStep)
    if (idx < steps.length - 1) goToStep(steps[idx + 1].id)
  }

  function prevStep() {
    const idx = steps.findIndex(s => s.id === currentStep)
    if (idx > 0) goToStep(steps[idx - 1].id)
  }

  const filteredHotels = hotels.filter(hotel =>
    (statusFilter === 'all' || hotel.status === statusFilter) &&
    [hotel.name, hotel.city, hotel.address].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())))

  const imageFolder = editingHotel ? editingHotel.id : `new-${Date.now()}`

  if (profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('admin.accessDenied')}</p></div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="dashboard-heading">
        <h1 className="text-2xl font-bold text-gray-900">{t('admin.hotels')}</h1>
        <div className="flex flex-wrap items-center gap-3">
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

      {pageError && !deleteConfirm && <div role="alert" className="feedback-message error">{pageError} <button onClick={fetchHotels}>{t('ux.retry')}</button></div>}
      <div className="admin-toolbar">
        <input type="search" aria-label={t('common.search')} placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
        <select aria-label={t('common.status')} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">{t('ux.allStatuses')}</option>
          {['active', 'inactive', 'pending'].map(status => <option key={status} value={status}>{status === 'pending' ? t('booking.status.pending') : t(`admin.hotelsForm.status${status === 'active' ? 'Active' : 'Inactive'}`)}</option>)}
        </select>
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
                {!filteredHotels.length && <tr><td colSpan={8} className="p-8 text-center text-gray-600">{t('common.noResults')}</td></tr>}
                {filteredHotels.map(hotel => (
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
        <AdminDialog title={t('admin.hotelsForm.deleteTitle')} onClose={() => setDeleteConfirm(null)} busy={deleting} className="max-w-sm p-6">
            {pageError && <p role="alert" className="feedback-message error">{pageError}</p>}
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('admin.hotelsForm.deleteTitle')}</h3>
            <p className="text-sm text-gray-600 mb-6">{t('admin.hotelsForm.deleteWarning')}</p>
            <div className="flex gap-3">
              <button
                disabled={deleting}
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                disabled={deleting}
                onClick={() => deleteHotel(deleteConfirm)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
              >
                {t('common.delete')}
              </button>
            </div>
        </AdminDialog>
      )}

      {/* Multi-step Modal Form */}
      {showForm && (
        <AdminDialog title={editingHotel ? t('admin.editHotel') : t('admin.addHotel')} onClose={() => setShowForm(false)} busy={busy} className="hotel-editor">
            {/* Header */}
            <div className="admin-dialog-header">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingHotel ? t('admin.editHotel') : t('admin.addHotel')}
              </h2>
              <button disabled={busy} aria-label={t('common.cancel')} onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Step Navigation */}
            <div className="hotel-editor-tabs" role="group" aria-label={t('common.edit')}>
              {steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  disabled={busy}
                  onClick={() => goToStep(step.id)}
                  aria-pressed={currentStep === step.id}
                  aria-controls={`hotel-panel-${step.id}`}
                  className={`hotel-editor-tab ${
                    currentStep === step.id
                      ? 'active'
                      : ''
                  }`}
                >
                  {step.icon}
                  <span>{step.label}</span>
                </button>
              ))}
            </div>

            {/* Form Content */}
            <form ref={formRef} noValidate onSubmit={handleSubmit} className="admin-dialog-body" onInput={e => { if (e.target instanceof HTMLInputElement) e.target.setCustomValidity('') }}>
              {saveError && <p role="alert" className="feedback-message error">{saveError}</p>}
              {/* Step 1: Basic Details */}
              <div hidden={currentStep !== 'basics'} data-step="basics" id="hotel-panel-basics" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label htmlFor="hotel-name" className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.hotelName')} *</label>
                      <input id="hotel-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder={t('admin.hotelsForm.hotelNamePlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="hotel-description" className="text-sm text-gray-600 font-medium">{t('hotel.description')}</label>
                      <textarea id="hotel-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                        placeholder={t('admin.hotelsForm.descriptionPlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                    </div>
                    <div>
                      <label htmlFor="hotel-property_type" className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.propertyType')} *</label>
                      <select id="hotel-property_type" value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="hotel">{t('admin.hotelsForm.typeHotel')}</option>
                        <option value="motel">{t('admin.hotelsForm.typeMotel')}</option>
                        <option value="apartment">{t('admin.hotelsForm.typeApartment')}</option>
                        <option value="villa">{t('admin.hotelsForm.typeVilla')}</option>
                        <option value="farm">{t('admin.hotelsForm.typeFarm')}</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="hotel-city" className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.city')} *</label>
                      <input id="hotel-city" required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                        placeholder={t('admin.hotelsForm.cityPlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="hotel-address" className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.address')} *</label>
                      <input id="hotel-address" required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                        placeholder={t('admin.hotelsForm.addressPlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label htmlFor="hotel-location" className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.locationArea')}</label>
                      <input id="hotel-location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                        placeholder={t('admin.hotelsForm.locationAreaPlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label htmlFor="hotel-country" className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.country')}</label>
                      <input id="hotel-country" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })}
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
                        <input type="number" step="any" min={-90} max={90} aria-label={t('admin.hotelsForm.latitudePlaceholder')} value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })}
                          placeholder={t('admin.hotelsForm.latitudePlaceholder')}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      </div>
                      <div>
                        <input type="number" step="any" min={-180} max={180} aria-label={t('admin.hotelsForm.longitudePlaceholder')} value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })}
                          placeholder={t('admin.hotelsForm.longitudePlaceholder')}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      </div>
                    </div>
                  </div>
                </div>

              {/* Step 2: Images */}
              <div hidden={currentStep !== 'images'} data-step="images" id="hotel-panel-images" className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">{t('admin.hotelsForm.photosTitle')}</h3>
                    <p className="text-xs text-gray-400 mb-4">
                      {t('admin.hotelsForm.photosHelp')}
                    </p>
                    <ImageUploader
                      images={formImages}
                      onChange={setFormImages}
                      folder={imageFolder}
                      onBusyChange={setImageBusy}
                    />
                    <PropertyMediaEditor value={formVideo} onChange={setFormVideo} onBusyChange={setVideoBusy} />
                  </div>
                </div>

              {/* Step 3: Amenities */}
              <div hidden={currentStep !== 'amenities'} data-step="amenities" id="hotel-panel-amenities" className="space-y-4">
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

              {/* Step 4: Settings */}
              <div hidden={currentStep !== 'settings'} data-step="settings" id="hotel-panel-settings" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="hotel-profit_margin_percentage" className="text-sm text-gray-600 font-medium">{t('admin.marginPercentage')} *</label>
                      <input id="hotel-profit_margin_percentage" type="number" step="0.01" min="0" required value={form.profit_margin_percentage}
                        onChange={e => setForm({ ...form, profit_margin_percentage: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label htmlFor="hotel-currency" className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.currency')} *</label>
                      <select id="hotel-currency" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="USD">USD ($)</option>
                        <option value="IQD">{t('admin.hotelsForm.currencyIqd')}</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="hotel-contact_person" className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.contactPerson')}</label>
                      <input id="hotel-contact_person" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })}
                        placeholder={t('admin.hotelsForm.contactPersonPlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label htmlFor="hotel-phone" className="text-sm text-gray-600 font-medium">{t('common.phone')}</label>
                      <input id="hotel-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                        placeholder={t('admin.hotelsForm.phonePlaceholder')}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label htmlFor="hotel-owner" className="text-sm text-gray-600 font-medium">{t('admin.hotelsForm.owner')}</label>
                      {ownersError && <p role="alert" className="feedback-message error">{ownersError} <button type="button" onClick={fetchOwners}>{t('ux.retry')}</button></p>}
                      <select id="hotel-owner" disabled={!!ownersError} value={form.owner_id} onChange={e => setForm({ ...form, owner_id: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="">{t('admin.hotelsForm.noOwner')}</option>
                        {owners.map(o => <option key={o.id} value={o.id}>{o.name} ({o.email})</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="hotel-status" className="text-sm text-gray-600 font-medium">{t('common.status')}</label>
                      <select id="hotel-status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                        className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="active">{t('admin.hotelsForm.statusActive')}</option>
                        <option value="inactive">{t('admin.hotelsForm.statusInactive')}</option>
                        <option value="pending">{t('booking.status.pending')}</option>
                      </select>
                    </div>
                  </div>
                </div>
            </form>

            {/* Footer */}
            <div className="admin-dialog-footer">
              <div>
                {currentStep !== 'basics' && (
                  <button
                    type="button"
                    onClick={prevStep}
                    disabled={busy}
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
                    disabled={busy}
                    className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
                  >
                    {t('common.next')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => formRef.current?.requestSubmit()}
                    disabled={busy}
                    className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {submitting ? t('admin.hotelsForm.saving') : (editingHotel ? t('admin.hotelsForm.updateHotel') : t('admin.hotelsForm.createHotel'))}
                  </button>
                )}
              </div>
            </div>
        </AdminDialog>
      )}
    </div>
  )
}
