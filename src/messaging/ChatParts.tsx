import { useState } from 'react'
import './messaging.css'

/** Asks for the 4-digit PIN. The key stays locked until she enters it on this screen. */
export function PinUnlock({ title, text, unlock }: { title: string; text: string; unlock: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await unlock(pin)
    } catch {
      setError('That PIN didn’t work. Try again.')
      setPin('')
      setBusy(false)
    }
  }
  return <form className="chat-unlock" onSubmit={(event) => { event.preventDefault(); if (pin.length === 4 && !busy) void submit() }}>
    <strong>{title}</strong>
    <p>{text}</p>
    <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" autoComplete="current-password" aria-label="Your 4-digit PIN" placeholder="••••" autoFocus />
    {error && <small role="alert">{error}</small>}
    <button type="submit" disabled={pin.length !== 4 || busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
  </form>
}

export function ChatNotice({ children, action }: React.PropsWithChildren<{ action?: { label: string; run: () => void } }>) {
  return <div className="chat-state" role="status"><p>{children}</p>{action && <button type="button" onClick={action.run}>{action.label}</button>}</div>
}

