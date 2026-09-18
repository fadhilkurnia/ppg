/**
 * Global Scroll Lock Manager
 *
 * Uses reference counting so multiple or nested modals, or transitions between
 * modals, never leave document.body.style.overflow stuck as 'hidden'.
 * Also compensates for scrollbar width to prevent layout shift on modals.
 */

let lockCount = 0
let originalPaddingRight = ''

export function lockScroll() {
  if (typeof document === 'undefined') return
  lockCount++
  if (lockCount === 1) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    originalPaddingRight = document.body.style.paddingRight
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    document.body.style.overflow = 'hidden'
  }
}

export function unlockScroll() {
  if (typeof document === 'undefined') return
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = ''
    document.body.style.paddingRight = originalPaddingRight || ''
  }
}

export function forceUnlockScroll() {
  lockCount = 0
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
    document.body.style.paddingRight = originalPaddingRight || ''
  }
}
