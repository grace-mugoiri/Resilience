import { accountVault } from './vault'
import { organizationVault } from '../organization/organizationVault'

let installed = false
let inactivityTimer: number | undefined
// True while the page is being left on purpose (a link or location change). Browsers also report
// the page as hidden while it unloads, and that must not be mistaken for switching away.
let leaving = false

const isProtectedRoute = () =>
  ['/app', '/counselor', '/organization'].some((prefix) =>
    window.location.pathname.startsWith(prefix),
  )

const armInactivityTimer = () => {
  if (!isProtectedRoute()) return
  if (inactivityTimer) window.clearTimeout(inactivityTimer)
  const minutes = Number(localStorage.getItem('auto-exit-minutes') || 2)
  inactivityTimer = window.setTimeout(() => safeExit(), minutes * 60_000)
}

export const safeExit = () => {
  accountVault.lock()
  organizationVault.lock()
  window.location.replace('/')
}

export const clearPrivateDeviceData = async () => {
  await Promise.all([accountVault.clear(), organizationVault.clear()])
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
      if (target?.textContent?.trim().endsWith('Exit')) {
        accountVault.lock()
        organizationVault.lock()
      }
    },
    true,
  )
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !leaving && isProtectedRoute()) safeExit()
  })
  window.addEventListener('pagehide', () => {
    leaving = true
    accountVault.lock()
    organizationVault.lock()
  })
  // A page restored from the back/forward cache is live again.
  window.addEventListener('pageshow', () => {
    leaving = false
  })
  armInactivityTimer()
}
