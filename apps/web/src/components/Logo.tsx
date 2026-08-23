export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-lockup${compact ? " brand-lockup--compact" : ""}`} translate="no">
      <span className="brand-symbol" aria-hidden="true">
        <svg className="brand-symbol__mark" viewBox="0 0 32 32" focusable="false">
          <path
            className="brand-symbol__route"
            d="M9.25 23.25a10.5 10.5 0 1 1 14.5-3.15"
          />
          <path className="brand-symbol__arrow" d="m20.55 19.05 3.3 1.15.5-3.45" />
          <circle className="brand-symbol__node" cx="9.25" cy="23.25" r="2.35" />
          <circle className="brand-symbol__node-core" cx="9.25" cy="23.25" r="0.75" />
        </svg>
      </span>
      {!compact && (
        <span className="brand-wordmark" aria-hidden="true">
          JobKoI
        </span>
      )}
      <span className="sr-only">JobKoI</span>
    </span>
  );
}
