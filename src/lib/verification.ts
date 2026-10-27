export type VerificationAction = 'send' | 'verify'

export interface VerificationResult {
  ok: boolean
  status: number
  body: Record<string, any>
  error: string | null
}

interface VerificationOptions {
  url: string
  headers: Record<string, string>
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export async function callPhoneVerification(
  action: VerificationAction,
  payload: Record<string, unknown>,
  { url, headers, timeoutMs = 15000, fetchImpl = fetch }: VerificationOptions,
): Promise<VerificationResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    })
    let body: Record<string, any> = {}
    let parseError: string | null = null
    try {
      body = await response.json()
    } catch {
      parseError = 'The verification service returned an unreadable response. Please try again.'
    }
    return {
      ok: response.ok,
      status: response.status,
      body,
      error: parseError || (!response.ok && !body?.error ? `The verification service returned HTTP ${response.status}. Please try again.` : null),
    }
  } catch (error) {
    const timedOut = controller.signal.aborted
    const message = error instanceof Error ? error.message : ''
    return {
      ok: false,
      status: 0,
      body: {},
      error: timedOut
        ? 'The verification service took too long to respond. Please try again.'
        : message || 'The verification service could not be reached. Please try again.',
    }
  } finally {
    clearTimeout(timeout)
  }
}
