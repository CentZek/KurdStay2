import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { Plus, X, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/locale'

interface Destination {
  id: string
  name: string
  created_at: string
}

export default function AdminDestinations() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.role === 'admin') fetchDestinations()
  }, [profile])

  async function fetchDestinations() {
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase
      .from('destinations')
      .select('*')
      .order('name')
    if (fetchError) setError(t('common.errorOccurred'))
    else setDestinations(data || [])
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (adding || !newName.trim()) return
    setError('')
    setAdding(true)

    const { error: insertError } = await supabase
      .from('destinations')
      .insert({ name: newName.trim() })

    setAdding(false)

    if (insertError) {
      setError(insertError.message.includes('duplicate') ? t('admin.destinationExists') : insertError.message)
      return
    }

    setNewName('')
    fetchDestinations()
  }

  async function handleDelete(id: string, name: string) {
    if (deleting) return
    if (!confirm(t('admin.confirmDeleteDestination', { name }))) return
    setDeleting(true)
    setError('')
    const { error: deleteError } = await supabase.from('destinations').delete().eq('id', id).select('id').single()
    if (deleteError) setError(t('common.errorOccurred'))
    else await fetchDestinations()
    setDeleting(false)
  }

  if (profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('admin.accessDeniedShort')}</p></div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">{t('admin.manageDestinations')}</h1>

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
        <label htmlFor="destination-name" className="text-sm font-medium text-gray-700 mb-2 block">{t('admin.addDestination')}</label>
        <div className="flex gap-3">
          <input
            id="destination-name" type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={t('admin.destinationPlaceholder')}
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={adding || !newName.trim()}
            className="bg-primary-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {t('admin.add')}
          </button>
        </div>
        {error && <div role="alert" className="feedback-message error">{error} <button type="button" onClick={fetchDestinations}>{t('ux.retry')}</button></div>}
      </form>

      {/* List */}
      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : destinations.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">{t('admin.noDestinations')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {destinations.map(dest => (
              <div key={dest.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="font-medium text-gray-900">{dest.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('admin.addedOn', { date: formatDate(dest.created_at) })}
                  </p>
                </div>
                <button
                  disabled={deleting}
                  aria-label={`${t('common.delete')} ${dest.name}`}
                  onClick={() => handleDelete(dest.id, dest.name)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        {t('admin.destinationsNote')}
      </p>
    </div>
  )
}
