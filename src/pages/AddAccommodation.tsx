import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import ImageUploader from '../components/ImageUploader'
import AmenityPicker from '../components/AmenityPicker'
import {
  Building2, Image as ImageIcon, Sparkles, MapPin, ChevronLeft, CheckCircle2, Loader2, Home,
} from 'lucide-react'

type Step = 'basics' | 'photos' | 'amenities' | 'contact'

const steps: { id: Step; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'basics', labelKey: 'addProperty.steps.details', icon: <Building2 className="w-4 h-4" /> },
  { id: 'photos', labelKey: 'addProperty.steps.photos', icon: <ImageIcon className="w-4 h-4" /> },
  { id: 'amenities', labelKey: 'addProperty.steps.amenities', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'contact', labelKey: 'addProperty.steps.contact', icon: <MapPin className="w-4 h-4" /> },
]

export default function AddAccommodation() {
  const { t } = useTranslation()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)

  const [step, setStep] = useState<Step>('basics')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    property_name: '', property_type: 'hotel', description: '',
    city: '', address: '', location: '', country: 'Iraq',
    phone: '', contact_person: '', latitude: '', longitude: '',
  })
  const [images, setImages] = useState<string[]>([])
  const [amenities, setAmenities] = useState<string[]>([])

  useEffect(() => {
    if (!authLoading && !user) navigate('/login')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading])

  useEffect(() => {
    if (user) {
      setForm(f => ({ ...f, contact_person: f.contact_person || user.name, phone: f.phone || user.phone || '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const idx = steps.findIndex(s => s.id === step)
  function next() { if (idx < steps.length - 1) setStep(steps[idx + 1].id) }
  function prev() { if (idx > 0) setStep(steps[idx - 1].id) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !user) return
    if (!form.property_name || !form.city || !form.address) {
      setError(t('addProperty.errors.requiredFields'))
      setStep('basics')
      return
    }
    if (images.length === 0) {
      setError(t('addProperty.errors.photoRequired'))
      setStep('photos')
      return
    }
    setError('')
    setSubmitting(true)

    const { error: insertError } = await supabase.from('accommodation_applications').insert({
      applicant_id: user.id,
      applicant_name: user.name,
      applicant_phone: user.phone || null,
      property_name: form.property_name,
      property_type: form.property_type,
      description: form.description || null,
      city: form.city,
      address: form.address,
      location: form.location || null,
      country: form.country || 'Iraq',
      phone: form.phone || null,
      contact_person: form.contact_person || null,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      amenities,
      images,
      status: 'pending',
    })

    setSubmitting(false)
    if (insertError) {
      setError(t('addProperty.errors.submitFailed'))
      return
    }
    setDone(true)
  }

  const inputClass = 'w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
  const imageFolder = `applications/${user?.id || 'new'}`

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-primary-400">{t('addProperty.successTitle')}</h1>
        <p className="mt-3 text-gray-300">{t('addProperty.successMessage')}</p>
        <div className="mt-8 flex justify-center gap-3">
          <button onClick={() => navigate('/profile')} className="bg-primary-600 text-white px-5 py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors">
            {t('addProperty.backToProfile')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-primary-500/20 ring-1 ring-primary-500/40 flex items-center justify-center">
          <Home className="w-6 h-6 text-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-primary-400">{t('addProperty.title')}</h1>
          <p className="text-gray-300 text-sm">{t('addProperty.subtitle')}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Steps */}
        <div className="flex border-b border-gray-100 px-4 sm:px-6 overflow-x-auto">
          {steps.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                step === s.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {s.icon}
              {t(s.labelKey)}
            </button>
          ))}
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="p-6">
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

          {step === 'basics' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm text-gray-600 font-medium">{t('addProperty.propertyName')} *</label>
                <input required value={form.property_name} onChange={e => setForm({ ...form, property_name: e.target.value })} placeholder={t('addProperty.propertyNamePh')} className={inputClass} />
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('addProperty.type')} *</label>
                <select value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })} className={inputClass}>
                  <option value="hotel">{t('propertyTypesSingular.hotel')}</option>
                  <option value="motel">{t('propertyTypesSingular.motel')}</option>
                  <option value="apartment">{t('propertyTypesSingular.apartment')}</option>
                  <option value="villa">{t('propertyTypesSingular.villa')}</option>
                  <option value="farm">{t('propertyTypesSingular.farm')}</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('addProperty.city')} *</label>
                <input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder={t('addProperty.cityPh')} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-gray-600 font-medium">{t('addProperty.address')} *</label>
                <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder={t('addProperty.addressPh')} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-gray-600 font-medium">{t('addProperty.description')}</label>
                <textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={t('addProperty.descriptionPh')} className={`${inputClass} resize-none`} />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-gray-600 font-medium">{t('addProperty.area')}</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder={t('addProperty.areaPh')} className={inputClass} />
              </div>
            </div>
          )}

          {step === 'photos' && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">{t('addProperty.photosTitle')}</h3>
              <p className="text-xs text-gray-400 mb-4">{t('addProperty.photosHelp')}</p>
              <ImageUploader images={images} onChange={setImages} folder={imageFolder} />
            </div>
          )}

          {step === 'amenities' && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">{t('addProperty.amenitiesTitle')}</h3>
              <p className="text-xs text-gray-400 mb-4">{t('addProperty.amenitiesHelp')}</p>
              <AmenityPicker amenities={amenities} onChange={setAmenities} />
            </div>
          )}

          {step === 'contact' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('addProperty.contactPerson')}</label>
                  <input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('addProperty.contactPhone')}</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+964 750 123 4567" className={inputClass} />
                </div>
              </div>
              <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-primary-600" />
                  <label className="text-sm text-gray-700 font-medium">{t('addProperty.mapLocation')}</label>
                  <span className="text-xs text-gray-400">{t('addProperty.optional')}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" step="any" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder={t('addProperty.latitude')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  <input type="number" step="any" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder={t('addProperty.longitude')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <p className="text-xs text-gray-400">{t('addProperty.legalNote')}</p>
            </div>
          )}
        </form>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <div>
            {idx > 0 && (
              <button type="button" onClick={prev} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                <ChevronLeft className="w-4 h-4" /> {t('common.back')}
              </button>
            )}
          </div>
          {step !== 'contact' ? (
            <button type="button" onClick={next} className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors">
              {t('common.next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? t('addProperty.submitting') : t('addProperty.submitForReview')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
