import { Logo } from "../components/Logo";
import { AuthCard } from "../components/AuthCard";
import { SiteCompliance } from "../components/SiteCompliance";
import loginJourney from "../assets/auth/login-journey.png";

export function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="JobKoI 品牌插画">
        <img src={loginJourney} alt="" />
        <div className="auth-brand"><Logo /></div>
        <div className="auth-visual-copy">
          <span>下一步，正在发生</span>
          <h1>沿着你的节奏，<br />把每一次机会接住。</h1>
          <p>从准备、投递到复盘，让求职过程变得可见、可控。</p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-mobile-brand"><Logo /></div>
        <AuthCard />
        <SiteCompliance className="auth-site-compliance" compact />
      </section>
    </main>
  );
}
