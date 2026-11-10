// sfs_webapp.html keeps a fixed scale on phones (Tum, 2026-11-11). The viewport tag says
// user-scalable=no and CSS allows only scrolling gestures (touch-action: pan-x pan-y), but iPhone
// Safari ignores user-scalable=no, so its pinch gestures are also cancelled here. Only at phone
// width (≤ 760 px, the bottom-bar layout): Safari on a Mac sends the same gesture events for a
// trackpad pinch, and desktop zoom stays allowed.
const PHONE = '(max-width: 760px)'

export function lockZoom(target: Pick<Document, 'addEventListener'> = document, isPhone = () => window.matchMedia(PHONE).matches) {
  const stop = (e: Event) => {
    if (isPhone()) e.preventDefault()
  }
  // Safari's own pinch events.
  target.addEventListener('gesturestart', stop, { passive: false })
  target.addEventListener('gesturechange', stop, { passive: false })
  target.addEventListener('gestureend', stop, { passive: false })
  // Any two-finger move (a pinch) in browsers without gesture events.
  target.addEventListener(
    'touchmove',
    (e) => {
      if ((e as TouchEvent).touches && (e as TouchEvent).touches.length > 1) stop(e)
    },
    { passive: false },
  )
}
