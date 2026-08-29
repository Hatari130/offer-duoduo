import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  LockKeyhole,
  MonitorSmartphone,
  MousePointerClick,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target
} from "lucide-react";
import { Logo } from "../components/Logo";

type BrowserKey = "edge" | "chrome" | "browser360";

interface BrowserGuide {
  key: BrowserKey;
  label: string;
  shortLabel: string;
  address: string;
  note: string;
}

interface ExtensionRelease {
  version: string;
  downloadUrl: string;
  chromeWebStoreUrl: string;
  storeStatus: "pending" | "published";
}

const DEFAULT_RELEASE: ExtensionRelease = {
  version: "0.1.2",
  downloadUrl: "/downloads/jobkoi-browser-extension-0.1.2.zip",
  chromeWebStoreUrl: import.meta.env.VITE_CHROME_WEB_STORE_URL?.trim() || "",
  storeStatus: import.meta.env.VITE_CHROME_WEB_STORE_URL?.trim() ? "published" : "pending"
};

const browsers: BrowserGuide[] = [
  {
    key: "chrome",
    label: "Google Chrome",
    shortLabel: "Chrome",
    address: "chrome://extensions",
    note: "适用于已经安装 Chrome，并可使用开发者模式的用户。"
  },
  {
    key: "edge",
    label: "Microsoft Edge",
    shortLabel: "Edge",
    address: "edge://extensions",
    note: "Windows 电脑推荐使用，兼容性与安装体验更稳定。"
  },
  {
    key: "browser360",
    label: "360 浏览器",
    shortLabel: "360",
    address: "",
    note: "适用于支持 Chromium 扩展的 360 浏览器版本。"
  }
];

const trustItems = [
  { icon: MousePointerClick, title: "按需读取", copy: "仅在你点击插件时处理当前页面" },
  { icon: ShieldCheck, title: "不会代投", copy: "填写完成后，始终由你检查并提交" },
  { icon: LockKeyhole, title: "数据可控", copy: "本地优先保存，云同步可随时断开" },
  { icon: RefreshCw, title: "持续更新", copy: "适配规则与插件版本持续维护" }
];

function detectBrowser(): BrowserKey {
  if (typeof navigator === "undefined") return "edge";
  const ua = navigator.userAgent;
  if (/Edg\//i.test(ua)) return "edge";
  if (/Chrome\//i.test(ua)) return "chrome";
  return "edge";
}

function BrandRouteGraphic() {
  return (
    <svg className="extension-route-graphic" viewBox="0 0 1120 360" aria-hidden="true">
      <path d="M46 280C180 282 185 100 334 100s128 170 287 170 188-202 451-202" />
      <circle cx="46" cy="280" r="7" />
      <circle cx="334" cy="100" r="7" />
      <circle cx="621" cy="270" r="7" />
      <circle cx="1072" cy="68" r="7" />
    </svg>
  );
}

function HeroProductDemo() {
  return (
    <div className="extension-product-demo" aria-hidden="true">
      <div className="extension-demo-browser">
        <div className="extension-demo-browser__bar">
          <span /><span /><span />
          <div>careers.example.com/apply/product-manager</div>
          <i>⋮</i>
        </div>
        <div className="extension-demo-browser__body">
          <div className="extension-demo-form">
            <div className="extension-demo-form__heading">
              <span className="extension-demo-company-mark">M</span>
              <span><strong>产品经理 · 校园招聘</strong><small>上海 · 产品与设计</small></span>
            </div>
            <div className="extension-demo-field is-complete"><span>姓名</span><b>林知夏</b><Check size={15} /></div>
            <div className="extension-demo-field is-complete"><span>手机号码</span><b>138 ···· 2026</b><Check size={15} /></div>
            <div className="extension-demo-field is-complete"><span>最高学历</span><b>硕士研究生</b><Check size={15} /></div>
            <div className="extension-demo-form__columns">
              <div className="extension-demo-field is-complete"><span>毕业时间</span><b>2027 年</b></div>
              <div className="extension-demo-field is-review"><span>意向城市</span><b>等待确认</b></div>
            </div>
            <div className="extension-demo-field is-area"><span>项目经历</span><b>负责校园招聘数据分析平台的需求调研与原型设计…</b></div>
          </div>
        </div>
      </div>

      <div className="extension-demo-panel">
        <header>
          <span className="extension-demo-panel__logo"><Puzzle size={17} /></span>
          <span><strong>JobKoI 网申助手</strong><small>已识别当前招聘页面</small></span>
          <i className="extension-demo-panel__status" />
        </header>
        <div className="extension-demo-job">
          <span>当前岗位</span>
          <strong>产品经理</strong>
          <small>Mira 科技 · 上海</small>
        </div>
        <div className="extension-demo-progress">
          <div><span>填写进度</span><b>24 / 26</b></div>
          <i><span /></i>
        </div>
        <ul>
          <li><CheckCircle2 size={15} /><span>基础信息</span><b>8 项</b></li>
          <li><CheckCircle2 size={15} /><span>教育与项目</span><b>16 项</b></li>
          <li className="is-pending"><Target size={15} /><span>需要你确认</span><b>2 项</b></li>
        </ul>
        <div className="extension-demo-action"><Sparkles size={15} />检查并继续填写</div>
      </div>

      <div className="extension-demo-chip extension-demo-chip--detect"><Target size={15} />岗位已识别</div>
      <div className="extension-demo-chip extension-demo-chip--sync"><Cloud size={15} />已同步到投递看板</div>
    </div>
  );
}

function CaptureVisual() {
  return (
    <div className="extension-feature-visual extension-capture-visual" aria-hidden="true">
      <div className="extension-capture-source">
        <div className="extension-mini-browser-bar"><i /><i /><i /><span>careers.example.com</span></div>
        <div className="extension-job-page">
          <span className="extension-demo-company-mark">M</span>
          <strong>AI 产品经理</strong>
          <small>上海 · 校园招聘 · 2027 届</small>
          <div><span>产品规划</span><span>用户研究</span><span>数据分析</span></div>
        </div>
      </div>
      <div className="extension-capture-route"><span /><ArrowRight size={18} /></div>
      <div className="extension-capture-card">
        <small>岗位已保存</small>
        <strong>AI 产品经理</strong>
        <span>Mira 科技 · 上海</span>
        <div><b>准备投递</b><em>今天</em></div>
      </div>
    </div>
  );
}

function AutofillVisual() {
  const fields = ["姓名", "手机号", "邮箱", "学校", "专业", "项目经历"];
  return (
    <div className="extension-feature-visual extension-autofill-visual" aria-hidden="true">
      <div className="extension-autofill-toolbar">
        <span><Sparkles size={16} />智能填写中</span><b>92%</b>
      </div>
      <div className="extension-autofill-grid">
        {fields.map((field, index) => (
          <div key={field} className={index === fields.length - 1 ? "is-wide" : ""}>
            <span>{field}</span>
            <i style={{ "--field-delay": `${index * 90}ms` } as CSSProperties}><Check size={13} /></i>
          </div>
        ))}
      </div>
      <div className="extension-autofill-review"><ShieldCheck size={17} /><span><strong>填写完成</strong><small>提交前请检查 2 个待确认项</small></span></div>
    </div>
  );
}

function SyncVisual() {
  return (
    <div className="extension-feature-visual extension-sync-visual" aria-hidden="true">
      <div className="extension-sync-device extension-sync-device--browser">
        <div className="extension-mini-browser-bar"><i /><i /><i /><span>JobKoI 插件</span></div>
        <strong>产品经理</strong><small>刚刚保存</small>
      </div>
      <div className="extension-sync-orbit"><Cloud size={25} /><i /><i /></div>
      <div className="extension-sync-device extension-sync-device--workspace">
        <header><Logo compact /><span>投递看板</span></header>
        <div><i /><span><strong>产品经理</strong><small>Mira 科技</small></span><b>准备投递</b></div>
        <div><i /><span><strong>策略产品实习生</strong><small>北斗智联</small></span><b>面试</b></div>
      </div>
    </div>
  );
}

function BrowserMark({ browser }: { browser: BrowserKey }) {
  return <span className={`extension-browser-mark is-${browser}`} aria-hidden="true">{browser === "browser360" ? "360" : browser.slice(0, 1).toUpperCase()}</span>;
}

function StoreButton({ release, className = "" }: { release: ExtensionRelease; className?: string }) {
  const classes = `extension-button extension-store-button ${className}`.trim();
  if (!release.chromeWebStoreUrl) {
    return (
      <button className={classes} type="button" disabled aria-describedby="extension-store-status">
        <BrowserMark browser="chrome" />
        前往商店
        <span className="extension-store-button__badge">审核中</span>
      </button>
    );
  }
  return (
    <a className={classes} href={release.chromeWebStoreUrl} target="_blank" rel="noreferrer">
      <BrowserMark browser="chrome" />
      前往商店
      <ExternalLink size={15} aria-hidden="true" />
    </a>
  );
}

export function BrowserExtensionPage() {
  const [activeBrowser, setActiveBrowser] = useState<BrowserKey>(detectBrowser);
  const [release, setRelease] = useState<ExtensionRelease>(DEFAULT_RELEASE);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = browsers.find((browser) => browser.key === activeBrowser) ?? browsers[0];

  useEffect(() => {
    document.documentElement.dataset.extensionLanding = "true";
    return () => {
      delete document.documentElement.dataset.extensionLanding;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/extension-release.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("extension release metadata unavailable");
        return response.json() as Promise<Partial<ExtensionRelease>>;
      })
      .then((value) => {
        if (!active) return;
        const chromeWebStoreUrl = value.chromeWebStoreUrl?.trim() || DEFAULT_RELEASE.chromeWebStoreUrl;
        setRelease({
          version: value.version?.trim() || DEFAULT_RELEASE.version,
          downloadUrl: value.downloadUrl?.trim() || DEFAULT_RELEASE.downloadUrl,
          chromeWebStoreUrl,
          storeStatus: chromeWebStoreUrl ? "published" : "pending"
        });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + browsers.length) % browsers.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % browsers.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = browsers.length - 1;
    setActiveBrowser(browsers[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="extension-landing">
      <a className="extension-skip-link" href="#extension-main">跳到主要内容</a>
      <header className="extension-header">
        <a href="/app/chat" className="extension-header__brand" aria-label="返回 JobKoI 工作台"><Logo /></a>
        <nav aria-label="插件页面导航">
          <a href="#features">核心能力</a>
          <a href="#privacy">隐私说明</a>
          <a href="#install">安装教程</a>
        </nav>
        <a className="extension-header__action" href="#install">获取插件<ArrowRight size={15} aria-hidden="true" /></a>
      </header>

      <main id="extension-main">
        <section className="extension-hero" aria-labelledby="extension-hero-title">
          <BrandRouteGraphic />
          <div className="extension-hero__glow extension-hero__glow--one" />
          <div className="extension-hero__glow extension-hero__glow--two" />
          <div className="extension-hero__copy">
            <p className="extension-eyebrow"><Puzzle size={15} aria-hidden="true" />JobKoI 浏览器插件 <span>免费</span></p>
            <h1 id="extension-hero-title">一次填写，<br /><em>投递不再重复</em></h1>
            <p className="extension-hero__lede">智能识别招聘官网表单，用你的 JobKoI 简历一键补全。岗位和投递进度自动回到工作台，所有内容都由你确认后再提交。</p>
            <div className="extension-hero__actions">
              <StoreButton release={release} className="extension-button--primary" />
              <a className="extension-button extension-button--secondary" href={release.downloadUrl} download><Download size={17} aria-hidden="true" />立即下载<ArrowRight size={16} aria-hidden="true" /></a>
            </div>
            <p className="extension-store-status" id="extension-store-status" role="status">
              {release.storeStatus === "published"
                ? "推荐从 Chrome 商店安装，后续版本将自动更新。"
                : `Chrome 商店不公开版本正在审核；现在可下载 v${release.version} 手动安装包。`}
            </p>
            <div className="extension-browser-support" aria-label="支持的浏览器">
              {browsers.map((browser) => <span key={browser.key}><BrowserMark browser={browser.key} />{browser.shortLabel}</span>)}
              <small>Windows · Chromium 内核浏览器</small>
            </div>
          </div>
          <div className="extension-hero__visual">
            <HeroProductDemo />
          </div>
          <div className="extension-hero__trust">
            <span><CheckCircle2 size={15} />不会自动提交</span>
            <span><CheckCircle2 size={15} />填写结果可检查</span>
            <span><CheckCircle2 size={15} />本地优先保存</span>
          </div>
        </section>

        <section className="extension-feature-intro" id="features" aria-labelledby="features-title">
          <p className="extension-section-kicker">从看到岗位，到管理进度</p>
          <h2 id="features-title">让每一次网申，都沿着同一条路径前进</h2>
          <p>插件负责当前招聘页面，工作台负责长期求职进度。两端连接起来，你就不必在不同网站之间重复整理信息。</p>
        </section>

        <section className="extension-feature-row">
          <div className="extension-feature-row__copy">
            <span className="extension-feature-number">01</span>
            <p className="extension-section-kicker">岗位识别</p>
            <h2>打开招聘页面，岗位已经替你整理好了</h2>
            <p>自动提取公司、职位、工作地点和来源链接，一键加入投递看板，不再依赖截图、收藏夹和零散表格。</p>
            <ul>
              <li><Check size={15} />保存岗位关键信息</li>
              <li><Check size={15} />保留原始申请链接</li>
              <li><Check size={15} />自动生成下一步行动</li>
            </ul>
          </div>
          <CaptureVisual />
        </section>

        <section className="extension-feature-row extension-feature-row--reverse">
          <div className="extension-feature-row__copy">
            <span className="extension-feature-number">02</span>
            <p className="extension-section-kicker">智能填写</p>
            <h2>简历只维护一次，网申表单一键补全</h2>
            <p>识别常见招聘系统的字段结构，调用你选择的简历与个人资料进行填写。无法确认的内容会明确标记，交给你决定。</p>
            <ul>
              <li><Check size={15} />支持重复教育与项目经历</li>
              <li><Check size={15} />填写后逐项回读验证</li>
              <li><Check size={15} />提交动作始终由你完成</li>
            </ul>
          </div>
          <AutofillVisual />
        </section>

        <section className="extension-feature-row">
          <div className="extension-feature-row__copy">
            <span className="extension-feature-number">03</span>
            <p className="extension-section-kicker">云端同步</p>
            <h2>插件保存的进度，回到你的求职工作台</h2>
            <p>岗位、投递阶段和事件记录增量同步。断网时照常使用，重新联网后自动补传，在其他设备继续跟进。</p>
            <ul>
              <li><Check size={15} />本地优先，离线可用</li>
              <li><Check size={15} />增量同步减少等待</li>
              <li><Check size={15} />版本冲突不会静默覆盖</li>
            </ul>
          </div>
          <SyncVisual />
        </section>

        <section className="extension-trust" id="privacy" aria-labelledby="privacy-title">
          <div className="extension-trust__heading">
            <p className="extension-section-kicker">你的资料，由你掌控</p>
            <h2 id="privacy-title">工具应该节省时间，不应该制造新的不安</h2>
          </div>
          <div className="extension-trust__grid">
            {trustItems.map((item) => {
              const Icon = item.icon;
              return <article key={item.title}><Icon size={21} aria-hidden="true" /><h3>{item.title}</h3><p>{item.copy}</p></article>;
            })}
          </div>
        </section>

        <section className="extension-install" id="install" aria-labelledby="install-title">
          <div className="extension-install__heading">
            <p className="extension-section-kicker">商店安装或立即下载</p>
            <h2 id="install-title">选择适合你的安装方式</h2>
            <p>Chrome 商店版安装一次即可自动更新；ZIP 是商店审核期间及其他 Chromium 浏览器的手动安装备用包。</p>
          </div>

          <div className="extension-install__browser-tabs" role="tablist" aria-label="选择浏览器">
            {browsers.map((browser, index) => (
              <button
                key={browser.key}
                ref={(node) => { tabRefs.current[index] = node; }}
                type="button"
                role="tab"
                id={`browser-tab-${browser.key}`}
                aria-selected={browser.key === activeBrowser}
                aria-controls="browser-install-panel"
                tabIndex={browser.key === activeBrowser ? 0 : -1}
                className={browser.key === activeBrowser ? "is-active" : ""}
                onClick={() => setActiveBrowser(browser.key)}
                onKeyDown={(event) => moveTabFocus(event, index)}
              >
                <BrowserMark browser={browser.key} />
                <span>{browser.label}</span>
                {browser.key === detectBrowser() && <em>当前浏览器</em>}
              </button>
            ))}
          </div>

          <div
            className="extension-install__panel"
            id="browser-install-panel"
            role="tabpanel"
            aria-labelledby={`browser-tab-${selected.key}`}
            tabIndex={0}
          >
            <ol>
              <li><span>1</span><div><strong>下载并解压安装包</strong><p>下载浏览器通用版 ZIP，解压到一个不会随意移动的文件夹。</p></div></li>
              <li><span>2</span><div><strong>打开扩展管理页面</strong><p>{selected.address ? <>在地址栏输入 <code>{selected.address}</code>，打开右上角“开发者模式”。</> : <>打开浏览器菜单，进入“扩展管理”，然后开启开发者模式。</>}</p></div></li>
              <li><span>3</span><div><strong>加载并固定 JobKoI</strong><p>点击“加载已解压的扩展”，选择刚才的文件夹，再将插件固定到工具栏。</p></div></li>
            </ol>

            <aside className="extension-install__download">
              <BrowserMark browser={selected.key} />
              <div><small>{selected.label} 安装包</small><strong>JobKoI 浏览器插件</strong><p>{selected.note}</p></div>
              <dl><div><dt>版本</dt><dd>v{release.version}</dd></div><div><dt>系统</dt><dd>Windows</dd></div><div><dt>费用</dt><dd>免费</dd></div></dl>
              <div className="extension-install__actions">
                <StoreButton release={release} className="extension-button--primary" />
                <a className="extension-button extension-button--secondary" href={release.downloadUrl} download><Download size={17} aria-hidden="true" />立即下载 ZIP</a>
              </div>
              <small className="extension-install__help">安装后打开任意招聘页面，点击工具栏中的 JobKoI 图标即可使用。</small>
            </aside>
          </div>
        </section>

        <section className="extension-final-cta" aria-labelledby="final-cta-title">
          <BrandRouteGraphic />
          <div>
            <p className="extension-section-kicker">下一份申请，从容一点</p>
            <h2 id="final-cta-title">把重复填写交给 JobKoI，<br />把时间留给真正重要的准备</h2>
            <div>
              <StoreButton release={release} className="extension-button--light" />
              <a className="extension-button extension-final-cta__download" href={release.downloadUrl} download><Download size={17} aria-hidden="true" />立即下载</a>
              <a className="extension-final-cta__workspace" href="/app/chat">返回求职工作台<ExternalLink size={15} /></a>
            </div>
          </div>
          <div className="extension-final-cta__device" aria-hidden="true"><MonitorSmartphone size={31} /><span><i /><i /><i /></span><b>24 项已填写</b></div>
        </section>
      </main>

      <footer className="extension-footer">
        <a href="/app/chat" aria-label="返回 JobKoI 工作台"><Logo /></a>
        <p>让求职信息沿着清晰的路径流动。</p>
        <nav aria-label="页脚导航"><a href="#privacy">隐私说明</a><a href="#install">安装教程</a><a href="/app/chat">返回工作台</a></nav>
        <small>© 2026 JobKoI</small>
      </footer>
    </div>
  );
}
