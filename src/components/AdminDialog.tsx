import { useEffect, useRef, type ReactNode } from 'react'

/** Native modal semantics provide focus containment and an inert background. */
export default function AdminDialog({ title, onClose, busy = false, className = '', children }: {
  title: string
  onClose: () => void
  busy?: boolean
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const actions = useRef({ busy, onClose })
  actions.current = { busy, onClose }
  const native = typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function'
  useEffect(() => {
    const dialog = ref.current!
    const previousFocus = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0)
    const keepFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) (focusable()[0] || dialog).focus()
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!actions.current.busy) actions.current.onClose()
      }
      if (event.key === 'Tab') {
        const elements = focusable(), first = elements[0], last = elements[elements.length - 1]
        if (!first) { event.preventDefault(); dialog.focus() }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    if (native) dialog.showModal()
    else {
      dialog.setAttribute('open', '')
      ;(focusable()[0] || dialog).focus()
      document.addEventListener('focusin', keepFocus)
      document.addEventListener('keydown', handleKey)
    }
    return () => {
      document.removeEventListener('focusin', keepFocus)
      document.removeEventListener('keydown', handleKey)
      if (native) dialog.close()
      else dialog.removeAttribute('open')
      document.body.style.overflow = overflow
      previousFocus?.focus()
    }
  }, [])
  return <>{!native && <div className="admin-dialog-backdrop" aria-hidden="true" />}
    <dialog ref={ref} role="dialog" aria-modal="true" tabIndex={-1} aria-label={title} aria-busy={busy} className={`admin-dialog ${native ? '' : 'admin-dialog-fallback'} ${className}`}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    {children}
  </dialog></>
}
