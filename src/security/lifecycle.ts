import { accountVault } from './vault'

let installed = false
let inactivityTimer: number | undefined

const armInactivityTimer = () => {
  if (!window.location.pathname.startsWith('/app')) return
  if (inactivityTimer) window.clearTimeout(inactivityTimer)
  const minutes = Number(localStorage.getItem('auto-exit-minutes') || 2)
  inactivityTimer = window.setTimeout(() => safeExit(), minutes * 60_000)
}

export const safeExit = () => {
  accountVault.lock()
  window.location.replace('/')
}

export const clearPrivateDeviceData = async () => {
  await accountVault.clear()
  localStorage.clear()
  sessionStorage.clear()
}

export const installSafetyLifecycle = () => {
  if (installed) return
  installed = true
  document.addEventListener('pointerdown', armInactivityTimer, { passive: true })
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest('button, a') : null
      if (target?.textContent?.trim().endsWith('Exit')) accountVault.lock()
    },
    true,
  )
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.location.pathname.startsWith('/app')) safeExit()
  })
  window.addEventListener('pagehide', () => accountVault.lock())
  armInactivityTimer()
}

