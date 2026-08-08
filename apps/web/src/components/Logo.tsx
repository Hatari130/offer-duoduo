import { Orbit } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-lockup${compact ? " brand-lockup--compact" : ""}`} translate="no">
      <span className="brand-symbol" aria-hidden="true">
        <Orbit size={compact ? 17 : 20} strokeWidth={2.2} />
        <i />
      </span>
      {!compact && (
        <span className="brand-wordmark">
          Offer<span>Flow</span>
        </span>
      )}
      <span className="sr-only">OfferFlow</span>
    </span>
  );
}
