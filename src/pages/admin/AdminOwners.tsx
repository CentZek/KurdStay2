import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Plus, X, Phone, User, Building2, Pencil, UserPlus } from 'lucide-react'

interface Owner {
  id: string
  name: string
  username: string
  phone: string | null
  created_at: string
}

interface Hotel {
  id: string
  name: string
  city: string
  currency: string
  phone: string | null
  contact_person: string | null
}

interface HotelManager {
  id: string
  hotel_id: string
  profile_id: string
}

export default function AdminOwners() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [owners, setOwners] = useState<Owner[]>([])
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [hotelManagers, setHotelManagers] = useState<HotelManager[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreateOwner, setShowCreateOwner] = useState(false)
  const [showEditOwner, setShowEditOwner] = useState<Owner | null>(null)
  const [showAssignModal, setShowAssignModal] = useState<Hotel | null>(null)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  const [createForm, setCreateForm] = useState({ name: '', username: '', password: '', phone: '' })
  const [editForm, setEditForm] = useState({ name: '', username: '', password: '', phone: '' })

  useEffect(() => {
    if (profile?.role === 'admin') fetchData()
  }, [profile])

  async function fetchData() {
    const [ownersRes, hotelsRes, managersRes] = await Promise.all([
      supabase.from('profiles').select('id, name, username, phone, created_at').eq('role', 'hotel_owner').order('created_at', { ascending: false }),
      supabase.from('hotels').select('id, name, city, currency, phone, contact_person').order('name'),
      supabase.from('hotel_managers').select('id, hotel_id, profile_id'),
    ])
    setOwners(ownersRes.data || [])
    setHotels(hotelsRes.data || [])
    setHotelManagers(managersRes.data || [])
    setLoading(false)
  }

  function getHotelManagers(hotelId: string) {
    const managerLinks = hotelManagers.filter(hm => hm.hotel_id === hotelId)
    return managerLinks.map(link => owners.find(o => o.id === link.profile_id)).filter(Boolean) as Owner[]
  }

  async function createOwnerAccount(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)

    const { data, error } = await supabase.rpc('register_user', {
      p_username: createForm.username,
      p_password: createForm.password,
      p_name: createForm.name,
      p_role: 'hotel_owner',
    })

    if (error) { setFormError(error.message); setFormLoading(false); return }

    const result = typeof data === 'string' ? JSON.parse(data) : data
    if (!result.success) { setFormError(result.message); setFormLoading(false); return }

    if (createForm.phone) {
      await supabase.from('profiles').update({ phone: createForm.phone }).eq('id', result.user.id)
    }

    setFormLoading(false)
    setShowCreateOwner(false)
    setCreateForm({ name: '', username: '', password: '', phone: '' })
    fetchData()
  }

  async function updateOwner(e: React.FormEvent) {
    e.preventDefault()
    if (!showEditOwner) return
    setFormError('')
    setFormSuccess('')
    setFormLoading(true)

    try {
      const { data, error } = await supabase.rpc('update_user_credentials', {
        p_user_id: showEditOwner.id,
        p_username: editForm.username,
        p_name: editForm.name,
        p_phone: editForm.phone || null,
        p_password: editForm.password || null,
      })

      if (error) { setFormError(error.message); setFormLoading(false); return }

      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (result && !result.success) { setFormError(result.message || t('admin.managers.updateFailed')); setFormLoading(false); return }

      setFormSuccess(t('admin.managers.updated'))
      setFormLoading(false)
      fetchData()
      setTimeout(() => { setShowEditOwner(null); setFormSuccess('') }, 1000)
    } catch (err: any) {
      setFormError(err?.message || t('admin.managers.unexpectedError'))
      setFormLoading(false)
    }
  }

  async function assignManager(hotelId: string, profileId: string) {
    setFormLoading(true)
    await supabase.from('hotel_managers').insert({ hotel_id: hotelId, profile_id: profileId })
    await supabase.from('hotels').update({ owner_id: profileId }).eq('id', hotelId)
    await fetchData()
    setFormLoading(false)
  }

  async function removeManager(hotelId: string, profileId: string) {
    setFormLoading(true)
    await supabase.from('hotel_managers').delete().eq('hotel_id', hotelId).eq('profile_id', profileId)
    const remaining = hotelManagers.filter(hm => hm.hotel_id === hotelId && hm.profile_id !== profileId)
    if (remaining.length > 0) {
      await supabase.from('hotels').update({ owner_id: remaining[0].profile_id }).eq('id', hotelId)
    } else {
      await supabase.from('hotels').update({ owner_id: null }).eq('id', hotelId)
    }
    await fetchData()
    setFormLoading(false)
  }

  if (profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('admin.accessDenied')}</p></div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('admin.managers.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('admin.managers.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreateOwner(true)}
          className="bg-primary-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('admin.managers.newAccount')}
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : (
        <div className="space-y-10">
          {/* Section: All Manager Accounts */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-primary-600" />
              {t('admin.managers.managerAccounts', { count: owners.length })}
            </h2>
            {owners.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                <UserPlus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">{t('admin.managers.noManagers')}</p>
                <p className="text-sm text-gray-400 mt-1">{t('admin.managers.noManagersHelp')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {owners.map(owner => {
                  const assignedHotels = hotels.filter(h => hotelManagers.some(hm => hm.hotel_id === h.id && hm.profile_id === owner.id))
                  return (
                    <div key={owner.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-gray-300 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-50 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-primary-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm">{owner.name}</h3>
                            <p className="text-xs text-gray-500">@{owner.username}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => { setShowEditOwner(owner); setEditForm({ name: owner.name, username: owner.username, password: '', phone: owner.phone || '' }); setFormError(''); setFormSuccess('') }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Credentials */}
                      <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{t('admin.managers.usernameLabel')}</span>
                          <span className="text-xs font-mono font-medium text-gray-800">{owner.username}</span>
                        </div>
                        {owner.phone && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">{t('admin.managers.phoneLabel')}</span>
                            <span className="text-xs font-medium text-gray-800">{owner.phone}</span>
                          </div>
                        )}
                      </div>

                      {/* Assigned Hotels */}
                      {assignedHotels.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{t('admin.managers.manages')}</p>
                          {assignedHotels.map(h => (
                            <div key={h.id} className="flex items-center gap-2 text-xs text-gray-600">
                              <Building2 className="w-3 h-3 text-gray-400" />
                              <span>{h.name}</span>
                              <span className="text-gray-400">({h.city})</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5">{t('admin.managers.notAssigned')}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Section: Hotels & Their Managers */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary-600" />
              {t('admin.managers.hotelsManagers')}
            </h2>
            <div className="space-y-3">
              {hotels.map(hotel => {
                const managers = getHotelManagers(hotel.id)
                return (
                  <div key={hotel.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{hotel.name}</h3>
                          <p className="text-xs text-gray-500">{hotel.city} &middot; {hotel.currency}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowAssignModal(hotel)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 text-xs font-medium hover:bg-primary-100 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {t('admin.managers.assignManager')}
                      </button>
                    </div>

                    {managers.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {managers.map(mgr => (
                          <div key={mgr.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                            <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center">
                              <User className="w-3 h-3 text-primary-600" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-gray-900">{mgr.name}</span>
                              <span className="text-[10px] text-gray-500">@{mgr.username}</span>
                            </div>

                            <button
                              onClick={() => removeManager(hotel.id, mgr.id)}
                              className="ms-1 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                              title={t('admin.managers.removeManagerTitle')}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 inline-block">
                        {t('admin.managers.noManagerYet')}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {/* Create Account Modal */}
      {showCreateOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 m-4 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">{t('admin.managers.createTitle')}</h2>
              <button onClick={() => { setShowCreateOwner(false); setFormError('') }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {formError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{formError}</div>}

            <form onSubmit={createOwnerAccount} className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('admin.managers.managerName')} *</label>
                <input type="text" required value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder={t('admin.managers.managerNamePlaceholder')} className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('common.username')} *</label>
                <input type="text" required value={createForm.username} onChange={e => setCreateForm({ ...createForm, username: e.target.value })} placeholder={t('admin.managers.usernamePlaceholder')} className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('common.password')} *</label>
                <input type="text" required minLength={6} value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} placeholder={t('admin.managers.passwordPlaceholder')} className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <p className="text-xs text-gray-400 mt-1">{t('admin.managers.passwordHelp')}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('admin.managers.phoneNumber')}</label>
                <input type="tel" value={createForm.phone} onChange={e => setCreateForm({ ...createForm, phone: e.target.value })} placeholder={t('admin.managers.phonePlaceholder')} className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <button type="submit" disabled={formLoading} className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50">
                {formLoading ? t('admin.managers.creating') : t('home.createAccount')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Owner Modal */}
      {showEditOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 m-4 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">{t('admin.managers.editTitle')}</h2>
              <button onClick={() => { setShowEditOwner(null); setFormError(''); setFormSuccess('') }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {formError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{formError}</div>}
            {formSuccess && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">{formSuccess}</div>}

            <form onSubmit={updateOwner} className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('common.name')} *</label>
                <input type="text" required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('common.username')} *</label>
                <input type="text" required value={editForm.username} onChange={e => setEditForm({ ...editForm, username: e.target.value })} className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('admin.managers.newPassword')}</label>
                <p className="text-xs text-gray-400 mb-1">{t('admin.managers.newPasswordHelp')}</p>
                <input type="text" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder={t('admin.managers.newPasswordPlaceholder')} minLength={editForm.password ? 6 : undefined} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">{t('admin.managers.phoneNumber')}</label>
                <input type="tel" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder={t('admin.managers.phonePlaceholder')} className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <button type="submit" disabled={formLoading} className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50">
                {formLoading ? t('admin.managers.saving') : t('admin.managers.saveChanges')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Assign Manager Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 m-4 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.managers.assignManager')}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{showAssignModal.name}</p>
              </div>
              <button onClick={() => setShowAssignModal(null)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {owners.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">{t('admin.managers.assignEmpty')}</p>
              ) : (
                owners.map(owner => {
                  const isAssigned = hotelManagers.some(hm => hm.hotel_id === showAssignModal.id && hm.profile_id === owner.id)
                  return (
                    <div key={owner.id} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${isAssigned ? 'bg-primary-50 border-primary-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isAssigned ? 'bg-primary-100' : 'bg-gray-200'}`}>
                          <User className={`w-4 h-4 ${isAssigned ? 'text-primary-600' : 'text-gray-500'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{owner.name}</p>
                          <p className="text-xs text-gray-500">@{owner.username}</p>
                        </div>
                      </div>
                      {isAssigned ? (
                        <button
                          onClick={() => removeManager(showAssignModal.id, owner.id)}
                          disabled={formLoading}
                          className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          {t('admin.managers.remove')}
                        </button>
                      ) : (
                        <button
                          onClick={() => assignManager(showAssignModal.id, owner.id)}
                          disabled={formLoading}
                          className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
                        >
                          {t('admin.managers.assign')}
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
