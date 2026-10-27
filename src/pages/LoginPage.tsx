import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)

    try {
      const { error } = await signIn(username, password)
      if (error) {
        setError(error.message || t('auth.loginFailed'))
        return
      }
      navigate('/')
    } catch {
      setError(t('auth.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-300">{t('common.appTitle')}</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">{t('auth.loginTitle')}</h1>
          <p className="mt-3 leading-7 text-gray-300">{t('auth.loginSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} aria-busy={loading} className="bg-white rounded-3xl border border-white/60 p-6 sm:p-8 shadow-2xl">
          {error && (
            <div role="alert" className="feedback-message error mb-5">
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label htmlFor="login-username" className="text-sm text-gray-700 font-medium">{t('common.username')}</label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={t('auth.usernamePlaceholder')}
                className="w-full mt-2 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="text-sm text-gray-700 font-medium">{t('common.password')}</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                className="w-full mt-2 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-7 w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('auth.signIn')}
          </button>

          <p className="mt-5 text-center text-sm text-gray-600">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-primary-700 font-medium hover:underline">
              {t('auth.signUp')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
