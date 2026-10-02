import type { ChatMessage } from './chat'

export const statusLabel = (message: ChatMessage) =>
  !message.fromMe ? undefined : message.status === 'sending' ? (navigator.onLine ? 'Sending' : 'Waiting for connection') : 'Sent'

export const timeLabel = (seconds: number, now = Date.now() / 1000) => {
  const minutes = Math.floor((now - seconds) / 60)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`
  return new Date(seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
