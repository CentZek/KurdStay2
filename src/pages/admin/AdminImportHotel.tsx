import { useState, useRef } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Globe, Loader2, AlertCircle, CheckCircle, ArrowLeft,
  MapPin, Building2, Image as ImageIcon, Sparkles, Settings2, ChevronLeft,
  Code, Link as LinkIcon, UserPlus, Copy, Eye, EyeOff, ClipboardList
} from 'lucide-react'
import AmenityPicker from '../../components/AmenityPicker'
import ImageUploader from '../../components/ImageUploader'
import { parseRoomTextToTypes } from '../../utils/roomTextParser'

interface ExtractedData {
  name: string
  description: string
  property_type: string
  city: string
  country: string
  address: string
  location: string
  latitude: number | null
  longitude: number | null
  amenities: string[]
  phone: string | null
  images: string[]
  star_rating: number | null
  check_in_time: string | null
  check_out_time: string | null
}

type ImportStep = 'input' | 'loading' | 'review' | 'success'
type ImportMode = 'url' | 'html' | 'paste'
type ImportType = 'full' | 'rooms-only'
type FormStep = 'basics' | 'images' | 'amenities' | 'rooms' | 'settings'

export default function AdminImportHotel() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)

  const [importStep, setImportStep] = useState<ImportStep>('input')
  const [importMode, setImportMode] = useState<ImportMode>('url')
  const [importType, setImportType] = useState<ImportType>('full')
  const [bookingUrl, setBookingUrl] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [roomTextContent, setRoomTextContent] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [existingHotels, setExistingHotels] = useState<{ id: string; name: string }[]>([])
  const [selectedHotelId, setSelectedHotelId] = useState('')
  const [formStep, setFormStep] = useState<FormStep>('basics')
  const [submitting, setSubmitting] = useState(false)
  const [owners, setOwners] = useState<{ id: string; name: string; email: string }[]>([])
  const [createOwnerAccount, setCreateOwnerAccount] = useState(true)
  const [ownerUsername, setOwnerUsername] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string; name: string } | null>(null)

  const [form, setForm] = useState({
    name: '', city: '', location: '', description: '', address: '',
    country: 'Iraq', profit_margin_percentage: '0', owner_id: '',
    status: 'active', property_type: 'hotel',
    phone: '', contact_person: '', currency: 'USD',
    latitude: '', longitude: '',
  })
  const [formImages, setFormImages] = useState<string[]>([])
  const [formAmenities, setFormAmenities] = useState<string[]>([])
  const [formRoomTypes, setFormRoomTypes] = useState<{
    name: string; description: string; max_guests: number; base_price: number; amenities: string[]; images: string[]
  }[]>([])

  async function handleImport() {
    if (importMode === 'url' && !bookingUrl.trim()) {
      setError(t('importHotel.errors.enterUrl'))
      return
    }
    if (importMode === 'html' && !htmlContent.trim()) {
      setError(t('importHotel.errors.pasteHtml'))
      return
    }

    setError('')
    setImportStep('loading')

    try {
      const payload: Record<string, string> = {}

      if (importMode === 'url') {
        payload.url = bookingUrl.trim()
      } else {
        payload.htmlContent = htmlContent
        if (bookingUrl.trim()) {
          payload.url = bookingUrl.trim()
        }
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-hotel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(payload),
        }
      )

      const result = await response.json()
      console.log('Import result:', JSON.stringify(result._debug, null, 2))
      if (result._debug) setDebugInfo(result._debug)

      if (!response.ok || result.error) {
        setError(result.error || t('importHotel.errors.importFailed', { status: response.status }))
        setImportStep('input')
        return
      }

      const data: ExtractedData = result.data
      if (!data) {
        setError(t('importHotel.errors.extractFailed'))
        setImportStep('input')
        return
      }
      populateForm(data)
      await fetchOwners()
      await fetchExistingHotels()
      setImportStep('review')
    } catch (err: any) {
      setError(err.message || t('importHotel.errors.networkError'))
      setImportStep('input')
    }
  }

  function handlePasteRooms() {
    if (!roomTextContent.trim()) return
    const parsed = parseRoomTextToTypes(roomTextContent)
    console.log('[Room Parser] Input lines:', roomTextContent.split('\n').length, '| Input length:', roomTextContent.length, '| Rooms found:', parsed.length)
    if (parsed.length > 0) console.log('[Room Parser] Rooms:', parsed.map(r => r.name))
    if (parsed.length === 0) {
      setError(t('importHotel.errors.parseRoomsFailed'))
      setSuccessMsg('')
      return
    }
    setError('')
    setSuccessMsg('')
    setFormRoomTypes(parsed)
    setFormStep('rooms')
    setImportStep('review')
    setSuccessMsg(t('importHotel.parsedRooms', { count: parsed.length, names: parsed.map(r => r.name).join(', ') }))
  }

  function generateCredentials(hotelName: string) {
    const slug = hotelName.toLowerCase().replace(/[^a-z0-9]+/g, '').substring(0, 20)
    const randomNum = Math.floor(100 + Math.random() * 900)
    const username = slug ? `${slug}${randomNum}` : `hotel${Date.now()}`
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let password = ''
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return { username, password }
  }

  function populateForm(data: ExtractedData) {
    setForm({
      name: data.name || '',
      city: data.city || '',
      location: data.location || '',
      description: data.description || '',
      address: data.address || '',
      country: data.country || 'Iraq',
      profit_margin_percentage: '0',
      owner_id: '',
      status: 'active',
      property_type: data.property_type || 'hotel',
      phone: data.phone || '',
      contact_person: '',
      currency: 'USD',
      latitude: data.latitude != null ? String(data.latitude) : '',
      longitude: data.longitude != null ? String(data.longitude) : '',
    })
    setFormImages(data.images || [])
    setFormAmenities(data.amenities || [])
    setFormRoomTypes((data as any).room_types || [])
    setFormStep(importType === 'rooms-only' ? 'rooms' : 'basics')

    const creds = generateCredentials(data.name || '')
    setOwnerUsername(creds.username)
    setOwnerPassword(creds.password)
    setOwnerName(data.name ? `${data.name} Manager` : '')
  }

  async function fetchOwners() {
    const { data } = await supabase.from('profiles').select('id, name, email').eq('role', 'hotel_owner')
    setOwners(data || [])
  }

  async function fetchExistingHotels() {
    const { data } = await supabase.from('hotels').select('id, name').order('name')
    setExistingHotels(data || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')

    // Rooms-only mode: just insert room types for selected hotel
    if (importType === 'rooms-only' && selectedHotelId) {
      const roomPayloads = formRoomTypes
        .filter(rt => rt.name && rt.base_price > 0)
        .map(rt => ({
          hotel_id: selectedHotelId,
          name: rt.name,
          description: rt.description || null,
          max_guests: rt.max_guests || 2,
          base_price: rt.base_price,
          amenities: rt.amenities || [],
          images: rt.images || [],
        }))

      if (roomPayloads.length === 0) {
        setSubmitting(false)
        setError(t('importHotel.errors.roomRequired'))
        return
      }

      const { error: roomErr } = await supabase.from('room_types').insert(roomPayloads)
      setSubmitting(false)
      if (roomErr) {
        setError(roomErr.message)
        return
      }
      navigate('/admin/hotels')
      return
    }

    let ownerId = form.owner_id || null

    // Create owner account if requested
    if (createOwnerAccount && ownerUsername && ownerPassword && ownerName) {
      const { data: regResult, error: regError } = await supabase.rpc('register_user', {
        p_username: ownerUsername,
        p_password: ownerPassword,
        p_name: ownerName,
        p_role: 'hotel_owner',
      })

      if (regError) {
        setSubmitting(false)
        setError(t('importHotel.errors.ownerAccountFailed', { message: regError.message }))
        return
      }

      const regData = typeof regResult === 'string' ? JSON.parse(regResult) : regResult
      if (!regData?.success) {
        setSubmitting(false)
        setError(t('importHotel.errors.ownerAccountFailed', { message: regData?.message || t('importHotel.errors.unknownError') }))
        return
      }

      ownerId = regData.user?.id || null

      // Update phone if set on the form
      if (form.phone && ownerId) {
        await supabase.from('profiles').update({ phone: form.phone }).eq('id', ownerId)
      }
    }

    const payload = {
      name: form.name,
      city: form.city,
      location: form.location,
      description: form.description,
      address: form.address,
      country: form.country,
      profit_margin_percentage: parseFloat(form.profit_margin_percentage),
      owner_id: ownerId,
      images: formImages,
      amenities: formAmenities,
      status: form.status,
      property_type: form.property_type,
      phone: form.phone || null,
      contact_person: form.contact_person || null,
      currency: form.currency,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
    }

    const { data: hotelData, error: insertError } = await supabase.from('hotels').insert(payload).select('id').single()

    if (insertError) {
      setSubmitting(false)
      setError(insertError.message)
      return
    }

    // Link owner to hotel via hotel_managers table
    if (ownerId && hotelData?.id) {
      await supabase.from('hotel_managers').insert({
        hotel_id: hotelData.id,
        profile_id: ownerId,
      })
    }

    // Insert room types
    if (hotelData?.id && formRoomTypes.length > 0) {
      const roomPayloads = formRoomTypes
        .filter(rt => rt.name && rt.base_price > 0)
        .map(rt => ({
          hotel_id: hotelData.id,
          name: rt.name,
          description: rt.description || null,
          max_guests: rt.max_guests || 2,
          base_price: rt.base_price,
          amenities: rt.amenities || [],
          images: rt.images || [],
        }))

      if (roomPayloads.length > 0) {
        await supabase.from('room_types').insert(roomPayloads)
      }
    }

    setSubmitting(false)

    if (createOwnerAccount && ownerUsername && ownerPassword) {
      setCreatedCredentials({ username: ownerUsername, password: ownerPassword, name: ownerName })
      setImportStep('success')
    } else {
      navigate('/admin/hotels')
    }
  }

  const steps: { id: FormStep; label: string; icon: React.ReactNode }[] = importType === 'rooms-only'
    ? [{ id: 'rooms', label: t('importHotel.stepRooms', { count: formRoomTypes.length }), icon: <Building2 className="w-4 h-4" /> }]
    : [
        { id: 'basics', label: t('importHotel.stepDetails'), icon: <Building2 className="w-4 h-4" /> },
        { id: 'images', label: t('importHotel.stepPhotos'), icon: <ImageIcon className="w-4 h-4" /> },
        { id: 'amenities', label: t('hotel.amenities'), icon: <Sparkles className="w-4 h-4" /> },
        { id: 'rooms', label: t('importHotel.stepRooms', { count: formRoomTypes.length }), icon: <Building2 className="w-4 h-4" /> },
        { id: 'settings', label: t('common.settings'), icon: <Settings2 className="w-4 h-4" /> },
      ]

  function nextStep() {
    const idx = steps.findIndex(s => s.id === formStep)
    if (idx < steps.length - 1) setFormStep(steps[idx + 1].id)
  }

  function prevStep() {
    const idx = steps.findIndex(s => s.id === formStep)
    if (idx > 0) setFormStep(steps[idx - 1].id)
  }

  if (profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('importHotel.accessDenied')}</p></div>
  }

  // Step 1: URL Input
  if (importStep === 'input') {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate('/admin/hotels')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('importHotel.backToHotels')}
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('importHotel.title')}</h1>
              <p className="text-sm text-gray-500">{t('importHotel.subtitle')}</p>
            </div>
          </div>

          {/* Import Type Toggle */}
          <div className="mt-6 flex rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setImportType('full')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                importType === 'full'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Building2 className="w-4 h-4" />
              {t('importHotel.newHotel')}
            </button>
            <button
              type="button"
              onClick={() => { setImportType('rooms-only'); fetchExistingHotels() }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-l border-gray-200 ${
                importType === 'rooms-only'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              {t('importHotel.roomsOnly')}
            </button>
          </div>

          {importType === 'rooms-only' && (
            <div className="mt-4">
              <label className="text-sm text-gray-600 font-medium">{t('importHotel.selectHotel')} *</label>
              <select
                value={selectedHotelId}
                onChange={e => setSelectedHotelId(e.target.value)}
                className="w-full mt-1.5 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('importHotel.chooseHotel')}</option>
                {existingHotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          )}

          {/* Mode Toggle */}
          <div className="mt-6 flex rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setImportMode('url')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-r border-gray-200 ${
                importMode === 'url'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              {t('importHotel.modeUrl')}
            </button>
            {importType === 'rooms-only' && (
              <button
                type="button"
                onClick={() => setImportMode('paste')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-r border-gray-200 ${
                  importMode === 'paste'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                {t('importHotel.modePaste')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setImportMode('html')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                importMode === 'html'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Code className="w-4 h-4" />
              {t('importHotel.modeHtml')}
            </button>
          </div>

          <div className="mt-6 space-y-5">
            {importMode === 'url' ? (
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('importHotel.propertyUrl')}</label>
                <input
                  type="url"
                  value={bookingUrl}
                  onChange={e => setBookingUrl(e.target.value)}
                  placeholder={t('importHotel.urlPlaceholder')}
                  className="w-full mt-1.5 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  {t('importHotel.urlHelp')}
                </p>
              </div>
            ) : importMode === 'paste' ? (
              <>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-sm text-amber-800 font-medium mb-2">{t('importHotel.pasteHelpTitle')}</p>
                  <ol className="text-xs text-amber-700 space-y-1.5 list-decimal list-inside">
                    <li>{t('importHotel.pasteStep1')}</li>
                    <li><Trans i18nKey="importHotel.pasteStep2" components={{ 1: <strong /> }} /></li>
                    <li>{t('importHotel.pasteStep3')}</li>
                    <li><Trans i18nKey="importHotel.pasteStep4" components={{ 1: <span className="font-mono bg-amber-100 px-1 rounded" /> }} /></li>
                  </ol>
                </div>

                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.roomTableText')} *</label>
                  <textarea
                    value={roomTextContent}
                    onChange={e => setRoomTextContent(e.target.value)}
                    placeholder={t('importHotel.roomTablePlaceholder')}
                    rows={10}
                    className="w-full mt-1.5 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                  {roomTextContent && (
                    <p className="mt-1.5 text-xs text-green-600">
                      {t('importHotel.linesPasted', { count: roomTextContent.split('\n').length })}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-sm text-blue-800 font-medium mb-2">{t('importHotel.htmlHelpTitle')}</p>
                  <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
                    <li>{t('importHotel.htmlStep1')}</li>
                    <li><Trans i18nKey="importHotel.htmlStep2" components={{ 1: <span className="font-mono bg-blue-100 px-1 rounded" />, 3: <span className="font-mono bg-blue-100 px-1 rounded" /> }} /></li>
                    <li><Trans i18nKey="importHotel.htmlStep3" components={{ 1: <span className="font-mono bg-blue-100 px-1 rounded" />, 3: <span className="font-mono bg-blue-100 px-1 rounded" /> }} /></li>
                    <li>{t('importHotel.htmlStep4')}</li>
                  </ol>
                </div>

                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.propertyUrlOptional')}</label>
                  <input
                    type="url"
                    value={bookingUrl}
                    onChange={e => setBookingUrl(e.target.value)}
                    placeholder={t('importHotel.urlPlaceholderShort')}
                    className="w-full mt-1.5 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.pageSourceHtml')} *</label>
                  <textarea
                    value={htmlContent}
                    onChange={e => setHtmlContent(e.target.value)}
                    placeholder={t('importHotel.pageSourcePlaceholder')}
                    rows={8}
                    className="w-full mt-1.5 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-xs resize-none"
                  />
                  {htmlContent && (
                    <p className="mt-1.5 text-xs text-green-600">
                      {t('importHotel.kbPasted', { kb: (htmlContent.length / 1024).toFixed(0) })}
                    </p>
                  )}
                </div>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {successMsg && (
              <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-sm text-emerald-700">{successMsg}</p>
              </div>
            )}

            <button
              onClick={importMode === 'paste' ? handlePasteRooms : handleImport}
              disabled={
                (importMode === 'url' ? !bookingUrl.trim() : importMode === 'paste' ? !roomTextContent.trim() : !htmlContent.trim()) ||
                (importType === 'rooms-only' && !selectedHotelId)
              }
              className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importMode === 'paste' ? t('importHotel.parseRoomTypes') : importType === 'rooms-only' ? t('importHotel.extractRoomTypes') : t('importHotel.importWithAi')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: Loading
  if (importStep === 'success' && createdCredentials) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-50 mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{t('importHotel.successTitle')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('importHotel.successSubtitle')}</p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              {t('importHotel.credentialsTitle')}
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-4 py-3">
                <div>
                  <p className="text-xs text-gray-500">{t('common.name')}</p>
                  <p className="text-sm font-medium text-gray-900">{createdCredentials.name}</p>
                </div>
              </div>

              <div className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-4 py-3">
                <div>
                  <p className="text-xs text-gray-500">{t('common.username')}</p>
                  <p className="text-sm font-mono font-medium text-gray-900">{createdCredentials.username}</p>
                </div>
                <button type="button" onClick={() => navigator.clipboard.writeText(createdCredentials.username)}
                  className="text-gray-400 hover:text-blue-600 transition-colors" title={t('importHotel.copy')}>
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-4 py-3">
                <div>
                  <p className="text-xs text-gray-500">{t('common.password')}</p>
                  <p className="text-sm font-mono font-medium text-gray-900">{createdCredentials.password}</p>
                </div>
                <button type="button" onClick={() => navigator.clipboard.writeText(createdCredentials.password)}
                  className="text-gray-400 hover:text-blue-600 transition-colors" title={t('importHotel.copy')}>
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const text = t('importHotel.credentialsText', { hotel: form.name, username: createdCredentials.username, password: createdCredentials.password })
                navigator.clipboard.writeText(text)
              }}
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Copy className="w-4 h-4" />
              {t('importHotel.copyAllCredentials')}
            </button>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setImportStep('input')
                setCreatedCredentials(null)
                setBookingUrl('')
                setHtmlContent('')
              }}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('importHotel.importAnother')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/hotels')}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              {t('importHotel.goToHotels')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (importStep === 'loading') {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 mb-6">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('importHotel.loadingTitle')}</h2>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            {t('importHotel.loadingText')}
          </p>
          <div className="mt-8 flex justify-center">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Step 3: Review & Edit Form
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={() => { setImportStep('input'); setError('') }}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('importHotel.startOver')}
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {importType === 'rooms-only' ? t('importHotel.reviewRoomsTitle') : t('importHotel.reviewTitle')}
            </h2>
            <p className="text-xs text-gray-500">{t('importHotel.reviewSubtitle')}</p>
          </div>
        </div>

        {debugInfo && (
          <div className="mx-6 mt-4 p-3 bg-gray-100 rounded-lg text-xs font-mono text-gray-700">
            <strong>Debug:</strong> Content: {debugInfo.contentLength} chars | Method: {debugInfo.fetchMethod} | Room hints: {debugInfo.roomHintsFound} | Price hints: {debugInfo.priceHintsFound} | AI rooms: {debugInfo.aiRoomTypesRaw}
            {debugInfo.roomHintSamples?.length > 0 && <div className="mt-1">Samples: {debugInfo.roomHintSamples.join(', ')}</div>}
            {debugInfo.priceHintSamples?.length > 0 && <div>Prices: {debugInfo.priceHintSamples.join(', ')}</div>}
          </div>
        )}

        {/* Step Navigation */}
        <div className="flex border-b border-gray-100 px-6">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setFormStep(step.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                formStep === step.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {step.icon}
              {step.label}
            </button>
          ))}
        </div>

        {/* Form Content */}
        <form ref={formRef} onSubmit={handleSubmit} className="p-6">
          {formStep === 'basics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.hotelName')} *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-gray-600 font-medium">{t('hotel.description')}</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.propertyType')} *</label>
                  <select value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="hotel">{t('importHotel.typeHotel')}</option>
                    <option value="motel">{t('importHotel.typeMotel')}</option>
                    <option value="apartment">{t('importHotel.typeApartment')}</option>
                    <option value="villa">{t('importHotel.typeVilla')}</option>
                    <option value="farm">{t('importHotel.typeFarm')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.city')} *</label>
                  <input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.address')}</label>
                  <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.locationArea')}</label>
                  <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.country')}</label>
                  <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <label className="text-sm text-gray-700 font-medium">{t('importHotel.gpsCoordinates')}</label>
                  <span className="text-xs text-gray-400">{t('importHotel.optional')}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" step="any" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })}
                    placeholder={t('importHotel.latitude')}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" step="any" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })}
                    placeholder={t('importHotel.longitude')}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
          )}

          {formStep === 'images' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">{t('importHotel.photosTitle')}</h3>
                <p className="text-xs text-gray-400 mb-4">
                  {formImages.length > 0
                    ? t('importHotel.photosExtracted', { count: formImages.length })
                    : t('importHotel.photosEmpty')}
                </p>

                {/* Show extracted external image URLs */}
                {formImages.filter(img => img.startsWith('http')).length > 0 && (
                  <div className="mb-4">
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {formImages.filter(img => img.startsWith('http')).slice(0, 12).map((img, idx) => (
                        <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setFormImages(formImages.filter(i => i !== img))}
                            className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                          >
                            x
                          </button>
                          {idx === 0 && (
                            <span className="absolute bottom-1 left-1 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">{t('importHotel.coverBadge')}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {formImages.filter(img => img.startsWith('http')).length > 12 && (
                      <p className="text-xs text-gray-500">
                        {t('importHotel.moreImages', { count: formImages.filter(img => img.startsWith('http')).length - 12 })}
                      </p>
                    )}
                  </div>
                )}

                <ImageUploader
                  images={formImages.filter(img => !img.startsWith('http'))}
                  onChange={(uploaded) => {
                    const external = formImages.filter(img => img.startsWith('http'))
                    setFormImages([...external, ...uploaded])
                  }}
                  folder={form.name ? form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40) : `hotel-${Date.now()}`}
                  maxImages={20}
                />
              </div>
            </div>
          )}

          {formStep === 'amenities' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">{t('importHotel.amenitiesTitle')}</h3>
                <p className="text-xs text-gray-400 mb-4">
                  {formAmenities.length > 0
                    ? t('importHotel.amenitiesDetected', { count: formAmenities.length })
                    : t('importHotel.amenitiesEmpty')}
                </p>
                <AmenityPicker
                  amenities={formAmenities}
                  onChange={setFormAmenities}
                />
              </div>
            </div>
          )}

          {formStep === 'rooms' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">{t('hotel.roomTypes')}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formRoomTypes.length > 0
                      ? t('importHotel.roomsExtracted', { count: formRoomTypes.length })
                      : t('importHotel.roomsNoneDetected')}
                  </p>
                </div>
                <button type="button" onClick={() => setFormRoomTypes([...formRoomTypes, {
                  name: '', description: '', max_guests: 2, base_price: 0, amenities: [], images: []
                }])}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                  {t('importHotel.addRoom')}
                </button>
              </div>

              {formRoomTypes.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
                  {t('importHotel.roomsEmpty')}
                </div>
              )}

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {formRoomTypes.map((room, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase">{t('importHotel.roomNumber', { n: idx + 1 })}</span>
                      <button type="button" onClick={() => {
                        setFormRoomTypes(formRoomTypes.filter((_, i) => i !== idx))
                      }} className="text-xs text-red-500 hover:text-red-700">{t('importHotel.remove')}</button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500">{t('owner.roomName')} *</label>
                        <input value={room.name} onChange={e => {
                          const updated = [...formRoomTypes]
                          updated[idx] = { ...updated[idx], name: e.target.value }
                          setFormRoomTypes(updated)
                        }}
                          placeholder={t('importHotel.roomNamePlaceholder')}
                          className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t('importHotel.pricePerNightLabel')} *</label>
                        <input type="number" step="0.01" value={room.base_price || ''} onChange={e => {
                          const updated = [...formRoomTypes]
                          updated[idx] = { ...updated[idx], base_price: parseFloat(e.target.value) || 0 }
                          setFormRoomTypes(updated)
                        }}
                          placeholder="0.00"
                          className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t('owner.maxGuests')}</label>
                        <input type="number" min="1" max="20" value={room.max_guests} onChange={e => {
                          const updated = [...formRoomTypes]
                          updated[idx] = { ...updated[idx], max_guests: parseInt(e.target.value) || 2 }
                          setFormRoomTypes(updated)
                        }}
                          className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500">{t('hotel.description')}</label>
                        <input value={room.description} onChange={e => {
                          const updated = [...formRoomTypes]
                          updated[idx] = { ...updated[idx], description: e.target.value }
                          setFormRoomTypes(updated)
                        }}
                          placeholder={t('importHotel.roomDescPlaceholder')}
                          className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>

                    {room.amenities.length > 0 && (
                      <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">{t('importHotel.roomAmenities')}</label>
                        <div className="flex flex-wrap gap-1.5">
                          {room.amenities.map((a, ai) => (
                            <span key={ai} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs flex items-center gap-1">
                              {a}
                              <button type="button" onClick={() => {
                                const updated = [...formRoomTypes]
                                updated[idx] = { ...updated[idx], amenities: room.amenities.filter((_, i) => i !== ai) }
                                setFormRoomTypes(updated)
                              }} className="text-gray-400 hover:text-red-500 ml-0.5">&times;</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {formStep === 'settings' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('admin.marginPercentage')} *</label>
                  <input type="number" step="0.01" required value={form.profit_margin_percentage}
                    onChange={e => setForm({ ...form, profit_margin_percentage: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.currency')} *</label>
                  <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="USD">{t('importHotel.currencyUsd')}</option>
                    <option value="IQD">{t('importHotel.currencyIqd')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('importHotel.contactPerson')}</label>
                  <input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('common.phone')}</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('common.status')}</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="active">{t('importHotel.statusActive')}</option>
                    <option value="inactive">{t('importHotel.statusInactive')}</option>
                    <option value="pending">{t('booking.status.pending')}</option>
                  </select>
                </div>
              </div>

              {/* Owner Account Section */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-blue-600" />
                    <h4 className="text-sm font-semibold text-gray-800">{t('importHotel.ownerAccountTitle')}</h4>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createOwnerAccount}
                      onChange={e => setCreateOwnerAccount(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-600">{t('importHotel.createNewAccount')}</span>
                  </label>
                </div>

                {createOwnerAccount ? (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">
                      {t('importHotel.ownerAccountHelp')}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 font-medium">{t('importHotel.displayName')}</label>
                        <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
                          placeholder={t('importHotel.displayNamePlaceholder')}
                          className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">{t('common.username')}</label>
                        <input value={ownerUsername} onChange={e => setOwnerUsername(e.target.value)}
                          placeholder={t('importHotel.usernamePlaceholder')}
                          className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 font-medium">{t('common.password')}</label>
                      <div className="relative mt-1">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={ownerPassword}
                          onChange={e => setOwnerPassword(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-500 font-medium">{t('importHotel.assignExistingOwner')}</label>
                    <select value={form.owner_id} onChange={e => setForm({ ...form, owner_id: e.target.value })}
                      className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">{t('importHotel.noOwnerAssigned')}</option>
                      {owners.map(o => <option key={o.id} value={o.id}>{o.name} ({o.email})</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <div>
            {formStep !== steps[0].id && (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                {t('common.back')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <p className="text-xs text-red-600 mr-2">{error}</p>
            )}
            {formStep !== steps[steps.length - 1].id ? (
              <button
                type="button"
                onClick={nextStep}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                {t('common.next')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => formRef.current?.requestSubmit()}
                disabled={submitting}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting ? t('importHotel.saving') : importType === 'rooms-only' ? t('importHotel.saveRoomTypes') : t('importHotel.saveHotel')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
