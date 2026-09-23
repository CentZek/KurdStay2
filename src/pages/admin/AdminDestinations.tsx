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
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.role === 'admin') fetchDestinations()
  }, [profile])

  async function fetchDestinations() {
    const { data } = await supabase
      .from('destinations')
      .select('*')
      .order('name')
    setDestinations(data || [])
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
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
    if (!confirm(t('admin.confirmDeleteDestination', { name }))) return
    await supabase.from('destinations').delete().eq('id', id)
    fetchDestinations()
  }

  if (profile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{t('admin.accessDeniedShort')}</p></div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">{t('admin.manageDestinations')}</h1>

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
        <label className="text-sm font-medium text-gray-700 mb-2 block">{t('admin.addDestination')}</label>
        <div className="flex gap-3">
          <input
            type="text"
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
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
