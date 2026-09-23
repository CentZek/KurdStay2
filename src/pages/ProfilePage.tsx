import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  User, ShieldCheck, ShieldAlert, IdCard, Upload, Loader2, CheckCircle2, MessageCircle,
  Home, Plus, Clock, XCircle, MessagesSquare,
} from 'lucide-react'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/phone-verification`
const ID_CARD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/id-card`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface ProfileFields {
  name: string
  phone: string
  email: string
  date_of_birth: string
  gender: string
  nationality: string
  id_number: string
  address: string
  city: string
  id_card_url: string
}

const EMPTY: ProfileFields = {
  name: '', phone: '', email: '', date_of_birth: '', gender: '',
  nationality: '', id_number: '', address: '', city: '', id_card_url: '',
}

async function callVerification(action: 'send' | 'verify', payload: Record<string, unknown>) {
  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  let body: any = {}
  try { body = await res.json() } catch { body = {} }
  return { ok: res.ok, status: res.status, body }
}

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fields, setFields] = useState<ProfileFields>(EMPTY)
  const [verified, setVerified] = useState(false)
  const [idCardPreview, setIdCardPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Inline phone verification
  const [applications, setApplications] = useState<any[]>([])

  const [showCode, setShowCode] = useState(false)
  const [code, setCode] = useState('')
  const [verifyMsg, setVerifyMsg] = useState('')
  const [verifyErr, setVerifyErr] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('name, phone, email, date_of_birth, gender, nationality, id_number, address, city, id_card_url, phone_verified')
        .eq('id', user.id)
        .maybeSingle()
      if (data) {
        setFields({
          name: data.name || '', phone: data.phone || '', email: data.email || '',
          date_of_birth: data.date_of_birth || '', gender: data.gender || '',
          nationality: data.nationality || '', id_number: data.id_number || '',
          address: data.address || '', city: data.city || '', id_card_url: data.id_card_url || '',
        })
        setVerified(!!data.phone_verified)
        if (data.id_card_url) {
          try {
            const res = await fetch(`${ID_CARD_URL}?action=view`, {
              headers: { 'x-user-id': user.id },
            })
            if (res.ok) {
              const body = await res.json()
              if (body.signed_url) setIdCardPreview(body.signed_url)
            }
          } catch { /* ignore */ }
        }
      }
      const { data: apps } = await supabase
        .from('accommodation_applications')
        .select('id, property_name, property_type, city, status, admin_notes, images, created_at')
        .eq('applicant_id', user.id)
        .order('created_at', { ascending: false })
      setApplications(apps || [])
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  function update(key: keyof ProfileFields, value: string) {
    setFields(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        name: fields.name,
        email: fields.email || null,
        date_of_birth: fields.date_of_birth || null,
        gender: fields.gender || null,
        nationality: fields.nationality || null,
        id_number: fields.id_number || null,
        address: fields.address || null,
        city: fields.city || null,
      })
      .eq('id', user.id)
    setSaving(false)
    if (updateError) {
      setError(t('profile.saveError'))
      return
    }
    setSaved(true)
    refreshProfile()
  }

  async function handleIdUpload(file: File) {
    if (!user) return
    setUploading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${ID_CARD_URL}?action=upload`, {
        method: 'POST',
        headers: { 'x-user-id': user.id },
        body: formData,
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || t('profile.idCard.uploadTypeError'))
        setUploading(false)
        return
      }
      if (body.signed_url) setIdCardPreview(body.signed_url)
      if (body.path) setFields(prev => ({ ...prev, id_card_url: body.path }))
    } catch {
      setError(t('profile.idCard.uploadError'))
    }
    setUploading(false)
  }

  async function sendCode() {
    if (!user) return
    setVerifyErr('')
    setVerifyMsg('')
    setVerifyLoading(true)
    const { status, body } = await callVerification('send', { profile_id: user.id, phone: fields.phone })
    setVerifyLoading(false)
    if (body?.code === 'not_configured' || status === 503) {
      setVerifyErr(t('profile.whatsapp.notConfigured'))
      return
    }
    if (!body?.success) {
      setVerifyErr(body?.error || t('profile.whatsapp.sendError'))
      return
    }
    setShowCode(true)
    setVerifyMsg(t('profile.whatsapp.codeSent'))
  }

  async function submitCode() {
    if (!user) return
    setVerifyErr('')
    setVerifyLoading(true)
    const { body } = await callVerification('verify', { profile_id: user.id, code })
    setVerifyLoading(false)
    if (!body?.success) {
      setVerifyErr(body?.error || t('profile.whatsapp.verifyFailed'))
      return
    }
    setVerified(true)
    setShowCode(false)
    setCode('')
    refreshProfile()
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    )
  }

  const inputClass = 'w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-primary-500/20 ring-1 ring-primary-500/40 flex items-center justify-center">
          <User className="w-6 h-6 text-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-primary-400">{t('profile.title')}</h1>
          <p className="text-gray-300 text-sm">{t('profile.subtitle')}</p>
        </div>
      </div>

      {/* Phone verification status */}
      <div className={`rounded-2xl border p-5 mb-6 ${verified ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-start gap-3">
          {verified ? <ShieldCheck className="w-6 h-6 text-green-600 shrink-0" /> : <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />}
          <div className="flex-1">
            <p className={`font-semibold ${verified ? 'text-green-800' : 'text-amber-800'}`}>
              {verified ? t('profile.whatsapp.confirmedTitle') : t('profile.whatsapp.confirmTitle')}
            </p>
            <p className={`text-sm ${verified ? 'text-green-700' : 'text-amber-700'}`}>
              {fields.phone || t('profile.whatsapp.noNumber')}
              {!verified && t('profile.whatsapp.confirmHint')}
            </p>

            {!verified && (
              <div className="mt-3">
                {verifyErr && <div className="mb-2 text-sm text-red-700">{verifyErr}</div>}
                {verifyMsg && <div className="mb-2 text-sm text-green-700">{verifyMsg}</div>}
                {!showCode ? (
                  <button
                    onClick={sendCode}
                    disabled={verifyLoading || !fields.phone}
                    className="inline-flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
                  >
                    {verifyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                    {t('profile.whatsapp.sendCode')}
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="w-32 px-3 py-2 border border-amber-300 rounded-xl text-center tracking-[0.3em] font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      onClick={submitCode}
                      disabled={verifyLoading || code.length !== 6}
                      className="inline-flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
                    >
                      {verifyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      {t('common.confirm')}
                    </button>
                    <button onClick={sendCode} disabled={verifyLoading} className="text-sm text-amber-700 font-medium hover:underline">
                      {t('profile.whatsapp.resend')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* My accommodations */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Home className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('profile.accommodations.title')}</h2>
          </div>
          <button
            onClick={() => navigate('/add-accommodation')}
            className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('profile.accommodations.add')}
          </button>
        </div>

        {applications.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t('profile.accommodations.empty')}
          </p>
        ) : (
          <div className="space-y-3">
            {applications.map(app => {
              const statusMeta: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
                pending: { label: t('profile.accommodations.status.pending'), cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Clock className="w-3.5 h-3.5" /> },
                info_requested: { label: t('profile.accommodations.status.infoRequested'), cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: <MessagesSquare className="w-3.5 h-3.5" /> },
                approved: { label: t('profile.accommodations.status.approved'), cls: 'bg-green-50 text-green-700 border-green-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                rejected: { label: t('profile.accommodations.status.rejected'), cls: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle className="w-3.5 h-3.5" /> },
              }
              const meta = statusMeta[app.status] || statusMeta.pending
              return (
                <div key={app.id} className="flex gap-3 border border-gray-100 rounded-xl p-3">
                  {app.images?.[0] ? (
                    <img src={app.images[0]} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Home className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 truncate">{app.property_name}</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
                        {meta.icon} {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 capitalize">{app.property_type} · {app.city}</p>
                    {app.admin_notes && (
                      <div className="mt-2 text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-lg p-2">
                        <span className="font-medium">{t('profile.accommodations.adminNote')}</span> {app.admin_notes}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('profile.details.title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-sm text-gray-600 font-medium">{t('profile.details.fullName')}</label>
            <input type="text" required value={fields.name} onChange={e => update('name', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-sm text-gray-600 font-medium">{t('common.email')}</label>
            <input type="email" value={fields.email} onChange={e => update('email', e.target.value)} placeholder={t('profile.details.optional')} className={inputClass} />
          </div>
          <div>
            <label className="text-sm text-gray-600 font-medium">{t('profile.details.dateOfBirth')}</label>
            <input type="date" value={fields.date_of_birth} onChange={e => update('date_of_birth', e.target.value)} className={`${inputClass} min-w-0 max-w-full box-border appearance-none`} />
          </div>
          <div>
            <label className="text-sm text-gray-600 font-medium">{t('profile.details.gender')}</label>
            <select value={fields.gender} onChange={e => update('gender', e.target.value)} className={inputClass}>
              <option value="">{t('profile.details.genderUnspecified')}</option>
              <option value="male">{t('profile.details.genderMale')}</option>
              <option value="female">{t('profile.details.genderFemale')}</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600 font-medium">{t('profile.details.nationality')}</label>
            <input type="text" value={fields.nationality} onChange={e => update('nationality', e.target.value)} placeholder={t('profile.details.nationalityPlaceholder')} className={inputClass} />
          </div>
          <div>
            <label className="text-sm text-gray-600 font-medium">{t('profile.details.idNumber')}</label>
            <input type="text" value={fields.id_number} onChange={e => update('id_number', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-sm text-gray-600 font-medium">{t('profile.details.city')}</label>
            <input type="text" value={fields.city} onChange={e => update('city', e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-gray-600 font-medium">{t('profile.details.address')}</label>
            <input type="text" value={fields.address} onChange={e => update('address', e.target.value)} className={inputClass} />
          </div>
        </div>

        {/* ID card upload */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <IdCard className="w-5 h-5 text-primary-600" /> {t('profile.idCard.title')}
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            {t('profile.idCard.description')}
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleIdUpload(e.target.files[0])}
          />

          {idCardPreview ? (
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <img src={idCardPreview} alt={t('profile.idCard.alt')} className="w-full sm:w-64 h-40 object-cover rounded-xl border border-gray-200" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {t('profile.idCard.replace')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-primary-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <div className="flex flex-col items-center gap-2">
                {uploading ? <Loader2 className="w-6 h-6 text-primary-500 animate-spin" /> : <Upload className="w-6 h-6 text-primary-500" />}
                <span className="text-sm font-medium text-gray-700">{uploading ? t('profile.idCard.uploading') : t('profile.idCard.upload')}</span>
                <span className="text-xs text-gray-400">{t('profile.idCard.hint')}</span>
              </div>
            </button>
          )}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('profile.save')}
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-green-700 font-medium">
              <CheckCircle2 className="w-4 h-4" /> {t('profile.saved')}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
