export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-lockup${compact ? " brand-lockup--compact" : ""}`} translate="no">
      <span className="brand-symbol" aria-hidden="true">
        <svg className="brand-symbol__mark" viewBox="0 0 36 32" focusable="false">
          <path
            className="brand-symbol__orbit brand-symbol__orbit--back"
            d="M4.5 18.9c5.3 5.4 14.2 5.2 21.4-.45 2.4-1.9 4.2-4.2 5.35-6.55"
          />
          <path
            className="brand-symbol__orbit brand-symbol__orbit--front"
            d="M5.2 20.3c6.65 2.65 14.25.8 19.5-4.3 2.3-2.25 3.85-4.9 4.55-7.55"
          />
          <path className="brand-symbol__arrow" d="m25.8 8.65 4.05-.9-.35 4.15" />
          <circle className="brand-symbol__sun" cx="6.4" cy="11.35" r="3.15" />
          <circle className="brand-symbol__sun-core" cx="5.65" cy="10.55" r="1.05" />
          <circle className="brand-symbol__spark" cx="30.7" cy="21.2" r="1.3" />
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
