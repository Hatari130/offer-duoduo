import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "../app/AuthContext";

type Mode = "login" | "register" | "reset";

interface AuthCardProps {
  autoFocus?: boolean;
  headingId?: string;
  idPrefix?: string;
  loginHeading?: string;
  prompt?: string;
  onSuccess?: () => void;
}

export function AuthCard({
  autoFocus = false,
  headingId,
  idPrefix = "auth-page",
  loginHeading = "继续你的求职航程",
  prompt,
  onSuccess
}: AuthCardProps) {
  const {
    login,
    register,
    enterDemo,
    capabilities,
    sendRegistrationEmailCode,
    verifyRegistrationEmailCode,
    sendPasswordResetEmailCode,
    resetPassword
  } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const emailCodeRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const errorId = `${idPrefix}-error`;
  const emailCodeStatusId = `${idPrefix}-email-code-status`;

  const isEmailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const requiresEmailCode = mode !== "login" && capabilities?.emailVerificationEnabled;

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setTimeout(() => setCodeCooldown((current) => Math.max(0, current - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [codeCooldown]);

  const sendEmailCode = async () => {
    setError("");
    setNotice("");
    if (!isEmailValid) {
      setError("请输入有效的邮箱地址");
      emailRef.current?.focus();
      return;
    }
    setCodeBusy(true);
    try {
      const result = mode === "reset"
        ? await sendPasswordResetEmailCode(email.trim())
        : await sendRegistrationEmailCode(email.trim());
      setCodeSent(true);
      setCodeCooldown(result.retryAfterSeconds);
      if (mode === "reset") setNotice("如果该邮箱已注册，验证码已发送。请在 5 分钟内完成重置。");
      window.requestAnimationFrame(() => emailCodeRef.current?.focus());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法发送验证码，请稍后重试");
    } finally {
      setCodeBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (mode === "register" && !displayName.trim()) {
      setError("请输入你的称呼");
      nameRef.current?.focus();
      return;
    }
    if (!isEmailValid) {
      setError("请输入有效的邮箱地址");
      emailRef.current?.focus();
      return;
    }
    if (mode === "reset" && !/^\d{6}$/.test(emailCode)) {
      setError("请输入邮件中的 6 位验证码");
      emailCodeRef.current?.focus();
      return;
    }
    if (!password || (mode !== "login" && password.length < 8)) {
      setError(mode === "login" ? "请输入密码" : "新密码至少需要 8 个字符");
      passwordRef.current?.focus();
      return;
    }
    if (mode === "register" && capabilities?.emailVerificationEnabled && !/^\d{6}$/.test(emailCode)) {
      setError("请输入邮件中的 6 位验证码");
      emailCodeRef.current?.focus();
      return;
    }
    if (mode === "register" && !acceptPrivacy) {
      setError("请先阅读并同意隐私政策与用户协议");
      consentRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") await login({ email: email.trim(), password });
      else if (mode === "register") {
        const token = capabilities?.emailVerificationEnabled
          ? verificationToken || (await verifyRegistrationEmailCode(email.trim(), emailCode)).verificationToken
          : undefined;
        if (token) setVerificationToken(token);
        await register({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          acceptPrivacy,
          emailVerificationToken: token
        });
      } else {
        if (password !== confirmPassword) {
          setError("两次输入的新密码不一致");
          confirmPasswordRef.current?.focus();
          return;
        }
        await resetPassword({ email: email.trim(), password, code: emailCode });
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setEmailCode("");
        setVerificationToken("");
        setCodeSent(false);
        setNotice("密码已更新。为保护账号安全，所有设备均已退出，请使用新密码登录。");
        return;
      }
      onSuccess?.();
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
      onSuccess?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法进入体验账号");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`auth-card auth-card--${mode}${requiresEmailCode ? " auth-card--verification" : ""}`}>
      <div className="auth-card-orbit" aria-hidden="true"><i /><i /><i /></div>
      <header>
        <span className="auth-eyebrow">欢迎来到 JobKoI</span>
        <h2 id={headingId}>{mode === "login" ? loginHeading : mode === "register" ? "建立你的求职工作台" : "重设密码"}</h2>
        <p>{mode === "login" ? (prompt || "登录后同步对话、机会与投递记录。") : mode === "register" ? "创建账号，在 Web 与浏览器插件之间同步进度。" : "验证注册邮箱后设置新密码，完成后所有设备都会退出。"}</p>
      </header>

      {mode !== "reset" && <div className="auth-mode" aria-label="账号操作">
        <button type="button" aria-pressed={mode === "login"} onClick={() => { setMode("login"); setError(""); }}>登录</button>
        {capabilities?.registrationMode !== "closed" && (
          <button type="button" aria-pressed={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>创建账号</button>
        )}
      </div>}

      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="auth-form-fields">
          {mode === "register" && (
            <label>
              <span>你的称呼</span>
              <input
                ref={nameRef}
                name="name"
                autoComplete="name"
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                aria-invalid={Boolean(error && !displayName.trim())}
                aria-describedby={error ? errorId : undefined}
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
              autoFocus={autoFocus}
              spellCheck={false}
              maxLength={254}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailCode("");
                setVerificationToken("");
                setCodeSent(false);
                setCodeCooldown(0);
                setNotice("");
              }}
              aria-invalid={Boolean(error && !/^\S+@\S+\.\S+$/.test(email.trim()))}
              aria-describedby={error ? errorId : undefined}
              placeholder="name@example.com"
            />
          </label>
          {requiresEmailCode && (
            <div className="auth-code-field">
              <label htmlFor={`${idPrefix}-email-code`}>邮箱验证码</label>
              <div className="auth-code-row">
                <input
                  ref={emailCodeRef}
                  id={`${idPrefix}-email-code`}
                  name="email-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={emailCode}
                  onChange={(event) => {
                    setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setVerificationToken("");
                  }}
                  aria-invalid={Boolean(error && !/^\d{6}$/.test(emailCode))}
                  aria-describedby={`${emailCodeStatusId}${error ? ` ${errorId}` : ""}`}
                  placeholder="6 位验证码"
                />
                <button type="button" onClick={() => void sendEmailCode()} disabled={codeBusy || codeCooldown > 0}>
                  {codeBusy ? "正在发送" : codeCooldown > 0 ? `${codeCooldown} 秒后重发` : codeSent ? "重新发送" : "发送验证码"}
                </button>
              </div>
              <div id={emailCodeStatusId} className="auth-code-status" role="status">
                {codeSent && mode === "register" ? "验证码已发送，5 分钟内有效。" : ""}
              </div>
            </div>
          )}
          <label>
            <span>{mode === "reset" ? "新密码" : "密码"}</span>
            <span className="password-field">
              <input
                ref={passwordRef}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                maxLength={256}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error && (!password || (mode !== "login" && password.length < 8)))}
                aria-describedby={error ? errorId : undefined}
                placeholder={mode === "login" ? "输入你的密码" : "至少 8 个字符"}
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

          {mode === "login" && capabilities?.emailVerificationEnabled && <button className="auth-forgot-password" type="button" onClick={() => { setMode("reset"); setPassword(""); setConfirmPassword(""); setEmailCode(""); setVerificationToken(""); setCodeSent(false); setCodeCooldown(0); setError(""); setNotice(""); }}>忘记密码？</button>}

          {mode === "reset" && <label>
            <span>确认新密码</span>
            <input
              ref={confirmPasswordRef}
              name="confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              maxLength={256}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={Boolean(error && password !== confirmPassword)}
              aria-describedby={error ? errorId : undefined}
              placeholder="再次输入新密码"
            />
          </label>}

          {mode === "reset" && <button className="auth-back-to-login" type="button" onClick={() => { setMode("login"); setError(""); setNotice(""); }}>返回登录</button>}

          {mode === "register" && (
            <label className="auth-consent">
              <input
                ref={consentRef}
                type="checkbox"
                checked={acceptPrivacy}
                onChange={(event) => setAcceptPrivacy(event.target.checked)}
                aria-invalid={Boolean(error && !acceptPrivacy)}
                aria-describedby={error ? errorId : undefined}
              />
              <span>我已阅读并同意<a href="/privacy" target="_blank" rel="noreferrer">隐私政策</a>与<a href="/terms" target="_blank" rel="noreferrer">用户协议</a></span>
            </label>
          )}
        </div>

        <div className="auth-form-actions">
          <div id={errorId} className="auth-error" role={error ? "alert" : undefined} aria-live="polite">
            {error}
          </div>
          <div className="auth-notice" role="status" aria-live="polite">{notice}</div>

          <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : null}
            <span>{mode === "login" ? "登录工作台" : mode === "register" ? "创建账号" : "重设密码"}</span>
            {!busy && <ArrowRight aria-hidden="true" size={18} />}
          </button>
        </div>
      </form>

      {mode === "login" && capabilities?.demoEnabled && <><div className="auth-divider"><span>或</span></div>
        <button className="auth-demo" type="button" onClick={useDemo} disabled={busy}>进入体验账号</button></>}
      <footer><ShieldCheck aria-hidden="true" size={14} />会话保存在安全 Cookie 中，密码不会明文存储</footer>
    </div>
  );
}
