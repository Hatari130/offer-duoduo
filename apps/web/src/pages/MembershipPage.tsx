import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Crown,
  Database,
  MessagesSquare,
  Route,
  ShieldCheck,
  X,
  Zap
} from "lucide-react";
import { navigate } from "../app/router";
import { Logo } from "../components/Logo";

interface MembershipPlan {
  id: string;
  name: string;
  eyebrow: string;
  price: string;
  unit: string;
  description: string;
  action: string;
  featured?: boolean;
  badge?: string;
  features: readonly string[];
}

const plans: readonly MembershipPlan[] = [
  {
    id: "trial",
    name: "3 天 Pro 试用",
    eyebrow: "先体验，再决定",
    price: "5",
    unit: "/ 3 天",
    description: "用三天完整体验核心求职能力。",
    action: "开始 3 天试用",
    features: ["50 次求职助手对话", "10 次简历与岗位分析", "知识库检索与参考来源", "插件与网页自动同步"]
  },
  {
    id: "monthly",
    name: "Pro 月度会员",
    eyebrow: "适合集中求职期",
    price: "19.9",
    unit: "/ 月",
    description: "覆盖投递、面试到 Offer 的完整周期。",
    action: "开通月度会员",
    featured: true,
    badge: "最多人选择",
    features: ["每月 300 次求职助手对话", "每月 30 次简历深度优化", "个人求职知识库", "校招信息优先提醒", "多设备实时同步"]
  },
  {
    id: "yearly",
    name: "Pro 年度会员",
    eyebrow: "长期准备更划算",
    price: "99.9",
    unit: "/ 年",
    description: "从校招准备到入职，全程持续陪伴。",
    action: "开通年度会员",
    badge: "约 ¥8.33 / 月",
    features: ["包含全部月度会员权益", "全年 1,200 次求职助手对话", "不限次数建立求职档案", "优先体验新功能", "年度求职复盘报告"]
  }
];

const capabilityHighlights = [
  { icon: MessagesSquare, title: "持续深聊", description: "围绕同一份经历继续追问，不必每次从头说明。" },
  { icon: Database, title: "个人知识库", description: "结合你的简历、岗位和投递记录给出建议。" },
  { icon: ShieldCheck, title: "可靠同步", description: "插件与网页使用同一账号，数据自动对齐。" }
] as const;

export function MembershipPage() {
  const [notice, setNotice] = useState("");

  const choosePlan = (name: string) => {
    setNotice(`已选择“${name}”。当前为前端预览，支付能力将在下一阶段接入。`);
  };

  return (
    <main className="membership-page" id="main-content">
      <header className="membership-topbar">
        <button type="button" aria-label="返回求职助手" onClick={() => navigate("/app/chat")}>
          <ArrowLeft aria-hidden="true" size={19} />
        </button>
        <Logo compact />
        <button type="button" aria-label="关闭会员页面" onClick={() => navigate("/app/chat")}>
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <section className="membership-content" aria-labelledby="membership-title">
        <div className="membership-hero">
          <span><Route aria-hidden="true" size={15} />JobKoI Pro</span>
          <h1 id="membership-title" tabIndex={-1}>升级，给求职每一步更多确定性</h1>
          <p>从岗位分析、简历优化到投递管理，让你的准备更连贯、更有依据。</p>
        </div>

        <section className="membership-capabilities" aria-label="会员核心能力">
          {capabilityHighlights.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title}>
                <span><Icon aria-hidden="true" size={18} /></span>
                <div><strong>{item.title}</strong><small>{item.description}</small></div>
              </article>
            );
          })}
        </section>

        <section className="pricing-grid" aria-label="会员方案">
          {plans.map((plan) => (
            <article className={`pricing-card${plan.featured ? " is-featured" : ""}`} key={plan.id}>
              <div className="pricing-card-topline">
                <span>{plan.eyebrow}</span>
                {plan.badge && <em>{plan.badge}</em>}
              </div>
              <div className="pricing-plan-title">
                {plan.featured ? <Crown aria-hidden="true" size={20} /> : <Zap aria-hidden="true" size={20} />}
                <h2>{plan.name}</h2>
              </div>
              <p>{plan.description}</p>
              <div className="pricing-price"><small>¥</small><strong>{plan.price}</strong><span>{plan.unit}</span></div>
              <button type="button" onClick={() => choosePlan(plan.name)}>{plan.action}</button>
              <div className="pricing-divider" />
              <span className="pricing-includes">方案包含</span>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}><Check aria-hidden="true" size={15} /><span>{feature}</span></li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <div className="membership-notice" role="status" aria-live="polite">{notice}</div>
        <footer className="membership-footer">
          <span>方案页面为前端预览，暂不会产生扣款。</span>
          <button type="button" onClick={() => navigate("/app/chat")}>返回求职助手</button>
        </footer>
      </section>
    </main>
  );
}
