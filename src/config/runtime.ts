const HEX_PUBLIC_KEY = /^[0-9a-f]{64}$/

const apiBase = (import.meta.env.VITE_API_BASE || 'http://localhost:8000').replace(/\/+$/, '')
const platformPublicKey = (import.meta.env.VITE_PLATFORM_PUBKEY || '').trim().toLowerCase()

export const runtimeConfig = Object.freeze({
  apiBase,
  platformPublicKey,
})

export const requirePlatformPublicKey = (): string => {
  if (!HEX_PUBLIC_KEY.test(runtimeConfig.platformPublicKey)) {
    throw new Error(
      'VITE_PLATFORM_PUBKEY must be the 64-character hexadecimal PLATFORM_PUBKEY from the backend',
    )
  }
  return runtimeConfig.platformPublicKey
}
