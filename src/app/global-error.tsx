'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isStaleBundle = error.message?.includes('Server Action') ||
    error.message?.includes('Failed to fetch') ||
    error.message?.includes('ChunkLoadError') ||
    error.message?.includes('Loading chunk')

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: '"JetBrains Mono", monospace', background: '#1a1a18', color: '#e8e0d0', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 420, padding: '40px 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#c9a84c', marginBottom: 8 }}>COIL</h1>

          {isStaleBundle ? (
            <>
              <p style={{ fontSize: 14, color: '#a09880', marginBottom: 20 }}>
                New version deployed — your browser loaded stale files.
              </p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '12px 24px', background: '#c9a84c', color: '#1a1a18', border: 'none',
                  borderRadius: 16, fontSize: 14, fontFamily: 'inherit', fontWeight: 600,
                  cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase',
                }}
              >
                Reload
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, color: '#a09880', marginBottom: 12 }}>
                Something broke. Sorry about that.
              </p>
              <pre style={{
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, color: '#888',
                background: '#111', padding: 16, borderRadius: 12, textAlign: 'left',
                maxHeight: 200, overflow: 'auto', marginBottom: 20,
              }}>
                {error.message}
                {error.digest ? `\n\nDigest: ${error.digest}` : ''}
              </pre>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={reset}
                  style={{
                    padding: '10px 20px', background: '#333', color: '#e8e0d0', border: '1px solid #555',
                    borderRadius: 12, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  Try again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  style={{
                    padding: '10px 20px', background: '#c9a84c', color: '#1a1a18', border: 'none',
                    borderRadius: 12, fontSize: 13, fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Reload page
                </button>
              </div>
            </>
          )}

          <p style={{ fontSize: 10, color: '#555', marginTop: 24 }}>
            {process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'}
          </p>
        </div>
      </body>
    </html>
  )
}
