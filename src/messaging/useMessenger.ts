import { useCallback, useEffect, useRef, useState } from 'react'
import { accountVault } from '../security/vault'
import { accountIdentity, ChatSetupError, guestIdentity, Messenger, type ChatIdentity, type ChatMessage, type Role } from './chat'

export type ChatState =
  | { kind: 'starting' }
  | { kind: 'no-account' }
  | { kind: 'locked'; nickname: string }
  | { kind: 'connecting' }
  | { kind: 'ready'; identity: ChatIdentity }
  | { kind: 'error'; message: string }

/**
 * Connects the chat for this screen. A guest gets a throwaway key straight away. An account has to
 * be unlocked with the PIN first: the key is only ever held in memory, and every screen in the app
 * is a fresh page load.
 */
export function useMessenger(role: Role, guest: boolean) {
  const [state, setState] = useState<ChatState>({ kind: 'starting' })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const messenger = useRef<Messenger | null>(null)
  const [live, setLive] = useState<Messenger | null>(null)

  const connect = useCallback(async (identity: ChatIdentity) => {
    setState({ kind: 'connecting' })
    try {
      messenger.current?.stop()
      messenger.current = await Messenger.connect(identity, role, setMessages)
      setLive(messenger.current)
      setState({ kind: 'ready', identity })
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof ChatSetupError ? error.message : 'We couldn’t connect to the messaging service. Check your connection and try again.',
      })
    }
  }, [role])

  const start = useCallback(async () => {
    if (guest) return connect(guestIdentity())
    const identity = await accountIdentity()
    if (identity) return connect(identity)
    const summary = await accountVault.summary()
    setState(summary ? { kind: 'locked', nickname: summary.nickname } : { kind: 'no-account' })
  }, [connect, guest])

  useEffect(() => {
    // Starting the chat talks to IndexedDB and the network; the state updates come from there.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start()
    return () => {
      messenger.current?.stop()
      messenger.current = null
    }
  }, [start])

  /** Throws on a wrong PIN so the prompt can say so. */
  const unlock = useCallback(async (pin: string) => {
    await accountVault.unlock(pin)
    const identity = await accountIdentity()
    if (identity) await connect(identity)
  }, [connect])

  return { state, messages, messenger: live, unlock, retry: start }
}
