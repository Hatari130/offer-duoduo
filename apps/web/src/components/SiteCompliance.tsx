type SiteComplianceProps = {
  className?: string;
  compact?: boolean;
};

export function SiteCompliance({ className = "", compact = false }: SiteComplianceProps) {
  return (
    <div className={`site-compliance${compact ? " site-compliance--compact" : ""}${className ? ` ${className}` : ""}`}>
      <span className="site-compliance__copyright">© 2026 JobKoI</span>
      <nav className="site-compliance__links" aria-label="法律与支持">
        <a href="https://github.com/Hatari130/offer-duoduo/issues" target="_blank" rel="noreferrer">反馈建议</a>
        <a href="/privacy">隐私政策</a>
        <a href="/terms">用户协议</a>
      </nav>
      <a
        className="site-compliance__record"
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noreferrer"
        aria-label="前往工业和信息化部政务服务平台查询备案信息：苏ICP备2026061861号"
      >
        苏ICP备2026061861号
      </a>
    </div>
  );
}
