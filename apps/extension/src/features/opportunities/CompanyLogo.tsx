import type { CSSProperties } from "react";
import { fallbackMark, resolveBrand } from "./companyBrands";

export { resolveBrand } from "./companyBrands";

export default function CompanyLogo({ company }: { company: string }) {
  const brand = resolveBrand(company);
  const color = `#${brand?.icon?.hex || brand?.hex || "405247"}`;
  const style = { "--company-brand": color } as CSSProperties;

  return (
    <span
      className={`opportunity-company-logo ${brand ? "opportunity-company-logo--brand" : "opportunity-company-logo--fallback"}`}
      style={style}
      aria-hidden="true"
    >
      {brand?.icon ? (
        <svg viewBox="0 0 24 24" role="presentation">
          <path d={brand.icon.path} />
        </svg>
      ) : (
        <strong className={(brand?.wordmark || "").length > 2 ? "compact" : ""}>
          {brand?.wordmark || fallbackMark(company)}
        </strong>
      )}
    </span>
  );
}
