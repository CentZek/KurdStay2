import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { LANGUAGES, changeLanguage } from '../i18n'
import { normalizeDigits } from '../lib/digits'
import { functionHeaders } from '../lib/session'
import { Phone, ShieldCheck, MessageCircle, ArrowRight, Loader2, ChevronDown } from 'lucide-react'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/phone-verification`

interface CountryCode {
  code: string
  dial: string
  flag: string
  name: string
  placeholder: string
}

const COUNTRY_CODES: CountryCode[] = [
  { code: 'IQ', dial: '+964', flag: '🇮🇶', name: 'Iraq', placeholder: '770 123 4567' },
  { code: 'TR', dial: '+90',  flag: '🇹🇷', name: 'Turkey', placeholder: '532 123 4567' },
  { code: 'IR', dial: '+98',  flag: '🇮🇷', name: 'Iran', placeholder: '912 345 6789' },
  { code: 'JO', dial: '+962', flag: '🇯🇴', name: 'Jordan', placeholder: '79 123 4567' },
  { code: 'SA', dial: '+966', flag: '🇸🇦', name: 'Saudi Arabia', placeholder: '50 123 4567' },
  { code: 'AE', dial: '+971', flag: '🇦🇪', name: 'UAE', placeholder: '50 123 4567' },
  { code: 'KW', dial: '+965', flag: '🇰🇼', name: 'Kuwait', placeholder: '500 12345' },
  { code: 'BH', dial: '+973', flag: '🇧🇭', name: 'Bahrain', placeholder: '3600 1234' },
  { code: 'QA', dial: '+974', flag: '🇶🇦', name: 'Qatar', placeholder: '3312 3456' },
  { code: 'OM', dial: '+968', flag: '🇴🇲', name: 'Oman', placeholder: '9212 3456' },
  { code: 'SY', dial: '+963', flag: '🇸🇾', name: 'Syria', placeholder: '944 567 890' },
  { code: 'LB', dial: '+961', flag: '🇱🇧', name: 'Lebanon', placeholder: '71 123 456' },
  { code: 'EG', dial: '+20',  flag: '🇪🇬', name: 'Egypt', placeholder: '100 123 4567' },
  { code: 'GB', dial: '+44',  flag: '🇬🇧', name: 'UK', placeholder: '7911 123456' },
  { code: 'US', dial: '+1',   flag: '🇺🇸', name: 'USA', placeholder: '201 555 0123' },
  { code: 'DE', dial: '+49',  flag: '🇩🇪', name: 'Germany', placeholder: '151 2345 6789' },
  { code: 'SE', dial: '+46',  flag: '🇸🇪', name: 'Sweden', placeholder: '70 123 4567' },
]

function buildPhone(dial: string, national: string): string {
  const digits = normalizeDigits(national).replace(/\D/g, '').replace(/^0+/, '')
  return `${dial}${digits}`
}

async function callVerification(action: 'send' | 'verify', payload: Record<string, unknown>) {
  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: {
      ...functionHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  })
  let body: any = {}
  try {
    body = await res.json()
  } catch {
    body = {}
  }
  return { ok: res.ok, status: res.status, body }
}

export default function RegisterPage() {
  const { t, i18n } = useTranslation()
  const { signUp, setPhoneVerified } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<'details' | 'verify'>('details')
  const [language, setLanguage] = useState(i18n.language)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nationalPhone, setNationalPhone] = useState('')
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(COUNTRY_CODES[0])
  const [countryOpen, setCountryOpen] = useState(false)
  const [email, setEmail] = useState('')

  const [profileId, setProfileId] = useState('')
  const [fullPhone, setFullPhone] = useState('')
  const [code, setCode] = useState('')
  const [notConfigured, setNotConfigured] = useState(false)

  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleDetails(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const nationalDigits = normalizeDigits(nationalPhone).replace(/\D/g, '').replace(/^0+/, '')
    if (nationalDigits.length < 7) {
      setError(t('register.invalidPhone'))
      return
    }
    setLoading(true)

    const phone = buildPhone(selectedCountry.dial, nationalPhone)
    const { error: signUpError, user } = await signUp({ username, password, name, phone, email: email || undefined, language })

    if (signUpError || !user) {
      setLoading(false)
      setError(signUpError?.message || t('register.registrationFailed'))
      return
    }

    setProfileId(user.id)
    setFullPhone(phone)

    const { status, body } = await callVerification('send', { profile_id: user.id, phone })
    setLoading(false)

    if (body?.code === 'not_configured' || status === 503) {
      setNotConfigured(true)
      setStep('verify')
      return
    }
    if (!body?.success) {
      // Account exists; let them retry sending on the next screen.
      setError(body?.error || t('register.sendCodeFailed'))
      setStep('verify')
      return
    }
    setInfo(t('register.codeSent'))
    setStep('verify')
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    const { body } = await callVerification('verify', { profile_id: profileId, code })
    setLoading(false)
    if (!body?.success) {
      setError(body?.error || t('register.verificationFailed'))
      return
    }
    setPhoneVerified()
    navigate('/profile')
  }

  async function handleResend() {
    setError('')
    setInfo('')
    setLoading(true)
    const { status, body } = await callVerification('send', { profile_id: profileId, phone: fullPhone })
    setLoading(false)
    if (body?.code === 'not_configured' || status === 503) {
      setNotConfigured(true)
      return
    }
    if (!body?.success) {
      setError(body?.error || t('register.resendFailed'))
      return
    }
    setInfo(t('register.codeResent'))
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary-400">
            {step === 'details' ? t('register.title') : t('register.verifyTitle')}
          </h1>
          <p className="mt-2 text-gray-300">
            {step === 'details'
              ? t('register.subtitle')
              : t('register.verifySubtitle', { phone: '\u2066' + fullPhone + '\u2069' })}
          </p>
        </div>

        {step === 'details' ? (
          <form onSubmit={handleDetails} className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('common.language')}</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => { setLanguage(lang.code); changeLanguage(lang.code) }}
                      className={`px-3 py-2.5 border rounded-xl text-sm font-medium transition-colors ${
                        lang.code === language
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('register.fullName')}</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('register.fullNamePlaceholder')}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('common.username')}</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={t('register.usernamePlaceholder')}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('common.password')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('register.passwordPlaceholder')}
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('register.phoneLabel')}</label>
                <div className="mt-1 flex items-stretch relative">
                  <button
                    type="button"
                    onClick={() => setCountryOpen(prev => !prev)}
                    className="inline-flex items-center gap-1 px-3 bg-gray-100 border border-e-0 border-gray-200 rounded-s-xl text-sm text-gray-700 font-medium hover:bg-gray-200 transition-colors whitespace-nowrap"
                  >
                    <span className="text-base leading-none">{selectedCountry.flag}</span>
                    <span dir="ltr">{selectedCountry.dial}</span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </button>
                  {countryOpen && (
                    <div className="absolute top-full start-0 mt-1 w-64 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                      {COUNTRY_CODES.map(c => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => { setSelectedCountry(c); setCountryOpen(false) }}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                            c.code === selectedCountry.code ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <span className="text-base leading-none">{c.flag}</span>
                          <span className="font-medium">{c.name}</span>
                          <span dir="ltr" className="text-gray-400 ms-auto">{c.dial}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    type="tel"
                    required
                    value={nationalPhone}
                    onChange={e => setNationalPhone(e.target.value)}
                    placeholder={selectedCountry.placeholder}
                    className="w-full min-w-0 px-3 py-2.5 border border-gray-200 rounded-e-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">{t('register.phoneHelp')}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('common.email')} <span className="text-gray-400 font-normal">{t('register.optional')}</span></label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4 rtl:rotate-180" />}
              {loading ? t('register.creatingAccount') : t('register.continue')}
            </button>

            <p className="mt-4 text-center text-sm text-gray-600">
              {t('auth.hasAccount')}{' '}
              <Link to="/login" className="text-primary-600 font-medium hover:underline">{t('auth.signIn')}</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
            )}
            {info && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">{info}</div>
            )}

            {notConfigured ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-amber-500" />
                </div>
                <p className="mt-4 text-sm text-gray-600">
                  {t('register.notConfiguredMessage')}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="mt-6 w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors"
                >
                  {t('register.goToProfile')}
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-primary-600" />
                  </div>
                </div>
                <label className="text-sm text-gray-600 font-medium">{t('register.codeLabel')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={e => setCode(normalizeDigits(e.target.value).replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full mt-1 px-3 py-3 border border-gray-200 rounded-xl text-center text-2xl tracking-[0.5em] font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500"
                />

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="mt-6 w-full flex items-center justify-center gap-2 bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {loading ? t('register.verifying') : t('register.confirmNumber')}
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="mt-3 w-full text-sm text-primary-600 font-medium hover:underline disabled:opacity-50"
                >
                  {t('register.resendCode')}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
