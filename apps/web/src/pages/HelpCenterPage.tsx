import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CircleHelp,
  FileText,
  MessageCircleMore,
  Newspaper,
  Puzzle,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { applyColorTheme, persistColorTheme, type ColorTheme } from "../app/theme";
import { Logo } from "../components/Logo";
import { SiteCompliance } from "../components/SiteCompliance";
import { ThemeToggle } from "../components/ThemeToggle";

const helpSections = [
  { id: "about", label: "认识 JobKoI" },
  { id: "start", label: "开始使用" },
  { id: "features", label: "核心功能" },
  { id: "questions", label: "常见问题" },
  { id: "privacy", label: "数据与隐私" },
  { id: "feedback", label: "反馈与共建" }
];

const featureGuides = [
  {
    icon: MessageCircleMore,
    title: "求职陪跑",
    description: "把目标岗位、当前进度或卡住的问题告诉小鲤鱼，获得规划、简历表达、面试准备和岗位分析建议。",
    tip: "选择个人材料后，回答会更贴近你的经历；重要招聘信息仍应以企业官方公告为准。",
    href: "/app/chat",
    action: "开始一段求职对话"
  },
  {
    icon: Newspaper,
    title: "校招信息速递",
    description: "按关键词、城市、行业、届别和开放状态筛选公开校招信息，快速判断哪些机会值得继续了解。",
    tip: "截止日期和招聘状态可能发生变化，投递前请在企业招聘官网再次确认。",
    href: "/app/opportunities",
    action: "查看校招机会"
  },
  {
    icon: Building2,
    title: "公司投递直达",
    description: "按公司类型浏览招聘入口，查看近期开放状态，并直接前往企业官方招聘页面。",
    tip: "如果入口失效或状态不准确，可以从页面右上角提交反馈。",
    href: "/app/companies",
    action: "查找公司招聘入口"
  },
  {
    icon: FileText,
    title: "简历中心",
    description: "直接制作字段化通用简历，并集中管理为不同岗位生成的定制版本。",
    tip: "网页和插件共享姓名、教育、经历与项目字段；定岗修改后请核对事实、时间和成果表述。",
    href: "/app/resumes",
    action: "打开简历中心"
  },
  {
    icon: BriefcaseBusiness,
    title: "个人投递管理",
    description: "手动添加或从插件同步岗位，记录投递阶段、时间、地点、岗位描述、备注和面试问答。",
    tip: "及时更新阶段，后续复盘时会更容易看清自己的求职节奏。",
    href: "/app/applications",
    action: "管理投递进度"
  },
  {
    icon: Puzzle,
    title: "浏览器插件",
    description: "在招聘页面识别岗位和表单字段，用你选择的资料辅助填写，并把投递进度同步回工作台。",
    tip: "JobKoI 不会替你点击最终提交。请在提交前逐项检查填写内容。",
    href: "/browser-extension",
    action: "了解浏览器插件"
  }
];

export function HelpCenterPage() {
  const [theme, setTheme] = useState<ColorTheme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light"
  );

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    applyColorTheme(nextTheme);
    persistColorTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <div className="help-center-page">
      <a className="skip-link" href="#help-content">跳到帮助内容</a>
      <header className="help-center-header">
        <div className="help-center-header__inner">
          <a className="help-center-logo" href="/app/chat" aria-label="返回 JobKoI 求职工作台">
            <Logo />
            <span className="help-center-logo__label">帮助中心</span>
          </a>
          <nav className="help-center-header__nav" aria-label="帮助中心导航">
            <a className="help-center-back" href="/app/chat"><ArrowLeft aria-hidden="true" size={16} />返回工作台</a>
            <a href="/privacy">隐私政策</a>
            <a href="/terms">用户协议</a>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </nav>
        </div>
      </header>

      <main className="help-center-layout" id="help-content">
        <article className="help-center-article">
          <header className="help-center-hero">
            <span className="help-center-eyebrow"><CircleHelp aria-hidden="true" size={16} />使用指南</span>
            <h1 tabIndex={-1}>JobKoI 帮助中心</h1>
            <p>从找机会、准备材料到记录投递，这里帮你快速找到下一步。遇到问题，也可以直接参与共建。</p>
            <div className="help-center-meta"><span>最后更新：2026年9月2日</span><span>约 6 分钟读完</span></div>
          </header>

          <details className="help-mobile-toc">
            <summary>查看本页目录</summary>
            <nav aria-label="本页目录">
              {helpSections.map((section, index) => <a href={`#${section.id}`} key={section.id}><span>{String(index + 1).padStart(2, "0")}</span>{section.label}</a>)}
            </nav>
          </details>

          <section className="help-section" id="about">
            <span className="help-section-number">01</span>
            <h2>认识 JobKoI</h2>
            <p>JobKoI 是一个围绕求职全流程搭建的工作台。它把分散在招聘网站、聊天记录、简历文件和表格里的信息放到同一条路径上，让你知道正在做什么、接下来该做什么。</p>
            <div className="help-callout">
              <Sparkles aria-hidden="true" size={19} />
              <p><strong>小鲤鱼负责陪你推进，不替你做最终决定。</strong> AI 建议、招聘状态和截止日期都可能不完整，请结合个人情况并以企业官方信息为准。</p>
            </div>
          </section>

          <section className="help-section" id="start">
            <span className="help-section-number">02</span>
            <h2>开始使用</h2>
            <ol className="help-steps">
              <li><span>1</span><div><h3>先浏览公开信息</h3><p>未登录时可以体验求职陪跑、查看校招信息和公司招聘入口。</p></div></li>
              <li><span>2</span><div><h3>登录并完善资料</h3><p>登录后可以保存对话、简历和投递记录，并在同一账号下继续使用。</p></div></li>
              <li><span>3</span><div><h3>从一个具体问题开始</h3><p>例如“帮我制定秋招时间表”“分析这个岗位的准备重点”或“整理我最近的投递进度”。</p></div></li>
            </ol>
          </section>

          <section className="help-section" id="features">
            <span className="help-section-number">03</span>
            <h2>核心功能</h2>
            <div className="help-feature-list">
              {featureGuides.map((feature) => {
                const Icon = feature.icon;
                return (
                  <section className="help-feature" key={feature.title}>
                    <span className="help-feature__icon"><Icon aria-hidden="true" size={20} strokeWidth={1.8} /></span>
                    <div>
                      <h3>{feature.title}</h3>
                      <p>{feature.description}</p>
                      <small>{feature.tip}</small>
                      <a href={feature.href}>
                        {feature.action}<ArrowUpRight aria-hidden="true" size={15} />
                      </a>
                    </div>
                  </section>
                );
              })}
            </div>
          </section>

          <section className="help-section" id="questions">
            <span className="help-section-number">04</span>
            <h2>常见问题</h2>
            <div className="help-faq-list">
              <details>
                <summary>求职陪跑长时间没有回复怎么办？</summary>
                <p>先确认网络连接正常，并等待当前回答完成。仍无响应时刷新页面后重新发送；如果反复发生，请提交反馈并写明时间和问题内容。</p>
              </details>
              <details>
                <summary>校招状态或截止时间与官网不一致怎么办？</summary>
                <p>JobKoI 聚合公开招聘信息，更新可能晚于企业官网。请以企业官方招聘页面为准，并通过“共建反馈”告诉我们需要修正的公司和岗位。</p>
              </details>
              <details>
                <summary>为什么简历中心里没有我的普通简历？</summary>
                <p>现在可以在简历中心直接点击“制作新简历”，从空白字段开始录入；已连接的浏览器插件下次同步后也会出现这份通用简历。</p>
              </details>
              <details>
                <summary>插件识别或辅助填写不准确怎么办？</summary>
                <p>不同招聘系统的字段结构会变化。请不要直接提交，先修正无法确认的字段，再反馈招聘网站、页面链接和具体字段，方便我们适配。</p>
              </details>
              <details>
                <summary>怎样退出其他设备或导出个人数据？</summary>
                <p>前往“设置与设备同步”，可以一次退出其他浏览器和插件，也可以导出账号、投递、对话、简历和面试记录副本。</p>
              </details>
            </div>
          </section>

          <section className="help-section" id="privacy">
            <span className="help-section-number">05</span>
            <h2>数据与隐私</h2>
            <div className="help-privacy-grid">
              <div><ShieldCheck aria-hidden="true" size={20} /><h3>由你确认</h3><p>插件只辅助识别和填写，不会替你点击最终提交。</p></div>
              <div><Puzzle aria-hidden="true" size={20} /><h3>本地优先</h3><p>插件资料与设置优先保存在本地，登录并连接后才进行同账号同步。</p></div>
              <div><FileText aria-hidden="true" size={20} /><h3>可以管理</h3><p>你可以在设置中导出数据、退出其他设备或永久删除账号。</p></div>
            </div>
            <p className="help-legal-note">想了解数据类型、使用目的和保存方式，请阅读 <a href="/privacy">JobKoI 隐私政策</a>。</p>
          </section>

          <section className="help-section help-section--feedback" id="feedback">
            <span className="help-section-number">06</span>
            <div>
              <h2>反馈与共建</h2>
              <p>JobKoI 仍在持续完善。功能不顺手、信息不准确，或者你希望增加新的能力，都可以告诉我们。具体的场景和截图会帮助我们更快定位。</p>
            </div>
            <a href="/app/chat">返回求职工作台<MessageCircleMore aria-hidden="true" size={17} /></a>
          </section>
        </article>

        <aside className="help-toc-card">
          <p>本页目录</p>
          <nav aria-label="本页目录">
            {helpSections.map((section, index) => (
              <a href={`#${section.id}`} key={section.id}><span>{String(index + 1).padStart(2, "0")}</span>{section.label}</a>
            ))}
          </nav>
          <div className="help-toc-card__note"><MessageCircleMore aria-hidden="true" size={16} /><span>没找到答案？回到工作台打开“共建反馈”。</span></div>
        </aside>
      </main>

      <SiteCompliance className="help-site-compliance" showFeedback={false} />
    </div>
  );
}
