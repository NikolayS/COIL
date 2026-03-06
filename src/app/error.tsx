'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('COIL error boundary:', error)
  }, [error])

  return (
    <div style={{ padding: 40, fontFamily: 'monospace', background: '#1a1a1a', color: '#fff', minHeight: '100vh' }}>
      <h2 style={{ color: '#ff6b6b' }}>Something went wrong</h2>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#ccc', marginTop: 16 }}>
        {error.message}
      </pre>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#888', marginTop: 8 }}>
        {error.stack}
      </pre>
      <button
        onClick={reset}
        style={{ marginTop: 20, padding: '8px 16px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 8, cursor: 'pointer' }}
      >
        Try again
      </button>
    </div>
  )
}
