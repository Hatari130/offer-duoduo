import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { Logo } from "../components/Logo";
import { useAuth } from "../app/AuthContext";
import { navigate } from "../app/router";
import loginJourney from "../assets/auth/login-journey.png";

type Mode = "login" | "register";

export function LoginPage() {
  const { login, register, enterDemo } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && !displayName.trim()) {
      setError("请输入你的称呼");
      nameRef.current?.focus();
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("请输入有效的邮箱地址");
      emailRef.current?.focus();
      return;
    }
    if (!password || (mode === "register" && password.length < 8)) {
      setError(mode === "register" ? "密码至少需要 8 个字符" : "请输入密码");
      passwordRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") await login({ email: email.trim(), password });
      else await register({ email: email.trim(), password, displayName: displayName.trim() });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法登录，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const useDemo = async () => {
    setBusy(true);
    setError("");
    try {
      await enterDemo();
      navigate("/app/chat");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法进入体验账号");
    } finally {
      setBusy(false);
    }
  };

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
        <div className="auth-card">
          <div className="auth-card-orbit" aria-hidden="true"><i /><i /><i /></div>
          <header>
            <span className="auth-eyebrow">欢迎来到 JobKoI</span>
            <h2>{mode === "login" ? "继续你的求职航程" : "建立你的求职工作台"}</h2>
            <p>{mode === "login" ? "登录后同步对话、机会与投递记录。" : "创建账号，在 Web 与浏览器插件之间同步进度。"}</p>
          </header>

          <div className="auth-mode" aria-label="账号操作">
            <button type="button" aria-pressed={mode === "login"} onClick={() => { setMode("login"); setError(""); }}>登录</button>
            <button type="button" aria-pressed={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>创建账号</button>
          </div>

          <form className="auth-form" onSubmit={submit} noValidate>
            {mode === "register" && (
              <label>
                <span>你的称呼</span>
                <input
                  ref={nameRef}
                  name="name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  aria-invalid={Boolean(error && !displayName.trim())}
                  placeholder="例如：知夏"
                />
              </label>
            )}
            <label>
              <span>邮箱</span>
              <input
                ref={emailRef}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
            </label>
            <label>
              <span>密码</span>
              <span className="password-field">
                <input
                  ref={passwordRef}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "至少 8 个字符" : "输入你的密码"}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                </button>
              </span>
            </label>

            <div className="auth-error" role={error ? "alert" : undefined} aria-live="polite">
              {error}
            </div>

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : null}
              <span>{mode === "login" ? "登录工作台" : "创建账号"}</span>
              {!busy && <ArrowRight aria-hidden="true" size={18} />}
            </button>
          </form>

          <div className="auth-divider"><span>或</span></div>
          <button className="auth-demo" type="button" onClick={useDemo} disabled={busy}>
            进入体验账号
          </button>
          <footer><ShieldCheck aria-hidden="true" size={14} />登录信息只用于 JobKoI 数据同步</footer>
        </div>
      </section>
    </main>
  );
}
