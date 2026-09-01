import { useEffect, useState } from 'react'

export default function ConnectivityBanner() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (online) return null

  return (
    <div className="connectivity-banner" role="status" aria-live="polite">
      <span aria-hidden="true">↯</span>
      <div>
        <strong>You’re offline.</strong>
        <span>Project PenPal can reopen its app shell, but account data and sending letters require a connection.</span>
      </div>
    </div>
  )
}
