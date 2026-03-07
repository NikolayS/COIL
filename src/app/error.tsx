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

  const isStaleBundle = error.message?.includes('Server Action') ||
    error.message?.includes('Failed to fetch') ||
    error.message?.includes('ChunkLoadError') ||
    error.message?.includes('Loading chunk')

  return (
    <div style={{ padding: 40, fontFamily: 'monospace', background: 'var(--bg, #1a1a18)', color: 'var(--text, #e8e0d0)', minHeight: '100vh' }}>
      <h2 style={{ color: 'var(--gold, #c9a84c)', fontSize: 20, marginBottom: 12 }}>
        {isStaleBundle ? 'New version available' : 'Something went wrong'}
      </h2>

      {isStaleBundle ? (
        <p style={{ fontSize: 14, color: 'var(--text-muted, #a09880)', marginBottom: 20 }}>
          A new version was deployed while the page was open. Reload to get the latest.
        </p>
      ) : (
        <>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: '#999', marginTop: 12, marginBottom: 8 }}>
            {error.message}
          </pre>
          {error.digest && (
            <p style={{ fontSize: 11, color: '#666' }}>Digest: {error.digest}</p>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <button
          onClick={reset}
          style={{ padding: '10px 20px', background: 'var(--bg-card, #222)', color: 'var(--text, #e8e0d0)', border: '1px solid var(--border, #333)', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '10px 20px', background: 'var(--gold, #c9a84c)', color: 'var(--bg, #1a1a18)', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
        >
          Reload page
        </button>
      </div>
    </div>
  )
}
