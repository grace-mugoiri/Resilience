/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Base URL of the Resilience API, for example http://localhost:8000. */
  readonly VITE_API_BASE?: string
  /** Hex public key that signs the client configuration (PLATFORM_PUBKEY in the backend .env). */
  readonly VITE_PLATFORM_PUBKEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
}
