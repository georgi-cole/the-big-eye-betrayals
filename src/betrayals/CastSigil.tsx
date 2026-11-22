type Sigil = 'banished' | 'night' | 'betrayer' | 'loyal' | 'immunity' | 'public' | 'shield-night'

export function CastSigil({ kind }: { kind: Sigil }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {kind === 'banished' && (
        <>
          <path className="cast-sigil__fill" d="M14 37V22a10 10 0 0 1 20 0v15z" />
          <path d="M10 38V22a14 14 0 0 1 28 0v15M15 37V22a9 9 0 0 1 18 0v15" />
          <path d="M16 21c3-2 5-4 8-4v16l-8 4m5-11v2M9 37h29m-25 4h22" />
          <path className="cast-sigil__accent" d="M20 41c2-3 5-6 9-8" />
        </>
      )}
      {kind === 'night' && (
        <>
          <path
            className="cast-sigil__fill"
            d="M9 19h26a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V22a3 3 0 0 1 3-3Z"
          />
          <path d="M27 19H9a3 3 0 0 0-3 3v13a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3V23M8 21l11 8m7 0 10-7M9 35l8-5m18 5-8-5" />
          <circle className="cast-sigil__wax" cx="22" cy="31" r="3.7" />
          <path
            className="cast-sigil__accent"
            d="M28 19c-1 3-2 5-4 7 3-1 6-2 9-5l4-4-4-4-5 6Zm3-8 8 8m-4-5 5-6m-1-1 3 3"
          />
        </>
      )}
      {kind === 'loyal' && (
        <>
          <path
            className="cast-sigil__accent"
            d="M24 7c2 8 10 11 10 20a10 10 0 0 1-20 0c0-5 3-8 5-13l2 8c2-4 3-9 3-15Z"
          />
          <path d="M24 25c1 3 5 6 5 9a5 5 0 0 1-10 0c0-3 2-6 5-9Z" />
        </>
      )}
      {kind === 'betrayer' && (
        <>
          <path
            className="cast-sigil__fill"
            d="M8 36c4-5 4-19 16-29 12 10 12 24 16 29-5 4-11 6-16 6s-11-2-16-6Z"
          />
          <path d="M8 36c4-5 4-19 16-29 12 10 12 24 16 29-5 4-11 6-16 6s-11-2-16-6Zm7-9c2-6 5-10 9-12 4 2 7 6 9 12-2 5-5 8-9 9-4-1-7-4-9-9Z" />
          <path className="cast-sigil__accent" d="M20 27l2 1m4 0 2-1" />
        </>
      )}
      {(kind === 'public' || kind === 'shield-night') && (
        <>
          <path d="M24 7c5 3 10 5 15 5v9c0 9-6 16-15 20-9-4-15-11-15-20v-9c5 0 10-2 15-5Z" />
          {kind === 'public' ? (
            <path
              className="cast-sigil__accent"
              d="M24 14c0 7-3 10-10 10 7 0 10 3 10 10 0-7 3-10 10-10-7 0-10-3-10-10Z"
            />
          ) : (
            <path className="cast-sigil__accent" d="M26 15a9 9 0 1 0 7 14 9 9 0 0 1-7-14Z" />
          )}
        </>
      )}
      {kind === 'immunity' && (
        <>
          <path d="M13 33c0-8-3-13-4-17 5 2 9 8 11 5 1-2 1-6 4-10 3 4 3 8 4 10 2 3 6-3 11-5-1 4-4 9-4 17H13Zm1 5h20" />
          <path className="cast-sigil__accent" d="M24 25c1 2 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4Z" />
        </>
      )}
    </svg>
  )
}
