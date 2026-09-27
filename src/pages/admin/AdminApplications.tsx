import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import PropertyVideo from '../../components/PropertyVideo'
import {
  Home, X, MapPin, Phone, User as UserIcon, CheckCircle2, XCircle, Clock,
  MessagesSquare, MessageCircle, Loader2, Building2,
} from 'lucide-react'

interface Application {
  id: string
  applicant_id: string
  applicant_name: string | null
  applicant_phone: string | null
  property_name: string
  property_type: string
  description: string | null
  city: string
  address: string | null
  location: string | null
  country: string | null
  phone: string | null
  contact_person: string | null
  latitude: number | null
  longitude: number | null
  amenities: string[]
  images: string[]
  video_url?: string | null
  video_poster_url?: string | null
  status: string
  admin_notes: string | null
  hotel_id: string | null
  created_at: string
}

const TABS = ['pending', 'info_requested', 'approved', 'rejected']

function waLink(phone: string | null): string | null {
  if (!phone) return null
  let d = phone.replace(/[^\d]/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = '964' + d.slice(1)
  return `https://wa.me/${d}`
}

export default function AdminApplications() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [selected, setSelected] = useState<Application | null>(null)
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.role === 'admin') fetchApps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function fetchApps() {
    const { data } = await supabase
      .from('accommodation_applications')
      .select('*')
      .order('created_at', { ascending: false })
    setApps(data || [])
    setLoading(false)
  }

  function openDetail(app: Application) {
    setSelected(app)
    setNote(app.admin_notes || '')
    setError('')
  }

  async function approve(app: Application) {
    if (working) return
    setWorking(true)
    setError('')

    const { error: approvalError } = await supabase.rpc('approve_accommodation', {
      p_application: app.id, p_notes: note || null,
    })
    if (approvalError) {
      setWorking(false)
      setError(t('applications.createPropertyError'))
      return
    }

    setWorking(false)
    setSelected(null)
    fetchApps()
  }

  async function setStatus(app: Application, status: 'info_requested' | 'rejected') {
    if (working) return
    if (status === 'info_requested' && !note.trim()) {
      setError(t('applications.noteRequired'))
      return
    }
    setWorking(true)
    setError('')
    await supabase
      .from('accommodation_applications')
      .update({
        status,
        admin_notes: note || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: profile!.id,
      })
      .eq('id', app.id)
    setWorking(false)
    setSelected(null)
    fetchApps()
  }

  if (profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('admin.accessDenied')}</p></div>
  }

  const filtered = apps.filter(a => a.status === tab)
  const counts = TABS.reduce((acc, id) => { acc[id] = apps.filter(a => a.status === id).length; return acc }, {} as Record<string, number>)

  const statusBadge = (status: string) => {
    const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
      pending: { cls: 'bg-amber-50 text-amber-700', icon: <Clock className="w-3.5 h-3.5" />, label: t('applications.status.pending') },
      info_requested: { cls: 'bg-blue-50 text-blue-700', icon: <MessagesSquare className="w-3.5 h-3.5" />, label: t('applications.status.info_requested') },
      approved: { cls: 'bg-green-50 text-green-700', icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: t('applications.status.approved') },
      rejected: { cls: 'bg-red-50 text-red-700', icon: <XCircle className="w-3.5 h-3.5" />, label: t('applications.status.rejected') },
    }
    const m = map[status] || map.pending
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>{m.icon} {m.label}</span>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Home className="w-6 h-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t('applications.title')}</h1>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(id => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === id ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t(`applications.status.${id}`)} {counts[id] ? <span className="ml-1 opacity-80">({counts[id]})</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-500">
          {t('applications.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(app => (
            <button
              key={app.id}
              onClick={() => openDetail(app)}
              className="text-start bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="h-40 bg-gray-100">
                {app.images?.[0] ? (
                  <img src={app.images[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Building2 className="w-8 h-8 text-gray-300" /></div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 truncate">{app.property_name}</h3>
                  {statusBadge(app.status)}
                </div>
                <p className="text-sm text-gray-500 capitalize mt-1">{app.property_type} · {app.city}</p>
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5" /> {app.applicant_name || t('applications.unknown')}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{selected.property_name}</h2>
                {statusBadge(selected.status)}
              </div>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {selected.video_url && selected.video_poster_url && <div className="mb-5"><PropertyVideo key={selected.video_url} value={{ url: selected.video_url, poster: selected.video_poster_url }} title={selected.property_name} /></div>}
              {selected.images?.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {selected.images.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-24 object-cover rounded-lg border border-gray-100" />
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><span className="text-gray-400">{t('applications.type')}</span><p className="text-gray-900 capitalize">{selected.property_type}</p></div>
                <div><span className="text-gray-400">{t('applications.city')}</span><p className="text-gray-900">{selected.city}</p></div>
                <div className="col-span-2"><span className="text-gray-400">{t('applications.address')}</span><p className="text-gray-900">{selected.address || '—'}{selected.location ? `, ${selected.location}` : ''}</p></div>
                {selected.description && <div className="col-span-2"><span className="text-gray-400">{t('hotel.description')}</span><p className="text-gray-900">{selected.description}</p></div>}
                {selected.amenities?.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-gray-400">{t('hotel.amenities')}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selected.amenities.map(a => <span key={a} className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-700 capitalize">{a}</span>)}
                    </div>
                  </div>
                )}
                {(selected.latitude != null && selected.longitude != null) && (
                  <div className="col-span-2 flex items-center gap-1 text-gray-600"><MapPin className="w-4 h-4" /> {selected.latitude}, {selected.longitude}</div>
                )}
              </div>

              <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><UserIcon className="w-4 h-4" /> {t('applications.applicant')}</p>
                <p className="text-sm text-gray-900">{selected.applicant_name || '—'}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm text-gray-600 flex items-center gap-1"><Phone className="w-4 h-4" /> {selected.applicant_phone || selected.phone || t('applications.noNumber')}</span>
                  {waLink(selected.applicant_phone || selected.phone) && (
                    <a
                      href={waLink(selected.applicant_phone || selected.phone)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-green-700 font-medium hover:underline"
                    >
                      <MessageCircle className="w-4 h-4" /> {t('applications.messageWhatsApp')}
                    </a>
                  )}
                </div>
              </div>

              {selected.status !== 'approved' && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">{t('applications.noteLabel')}</label>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder={t('applications.notePlaceholder')}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>
              )}

              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
            </div>

            {selected.status !== 'approved' && (
              <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                <button
                  onClick={() => setStatus(selected, 'rejected')}
                  disabled={working}
                  className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {t('applications.reject')}
                </button>
                <button
                  onClick={() => setStatus(selected, 'info_requested')}
                  disabled={working}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-blue-200 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  <MessagesSquare className="w-4 h-4" /> {t('applications.requestInfo')}
                </button>
                <button
                  onClick={() => approve(selected)}
                  disabled={working}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {t('applications.approvePublish')}
                </button>
              </div>
            )}

            {selected.status === 'approved' && (
              <div className="px-6 py-4 border-t border-gray-100 bg-green-50/50 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> {t('applications.approvedNote')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
