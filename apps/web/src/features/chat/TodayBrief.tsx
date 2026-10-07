import { ExpertPortrait } from "../agents/ExpertPortrait";
import { briefCards, type BriefAction } from "./briefCards";
import type { JobApplication } from "@offerflow/domain";

export type { BriefAction };

export function TodayBrief({ applications, onAction }: { applications: JobApplication[]; onAction: (action: BriefAction) => void }) {
  const now = new Date();
  const cards = briefCards(applications, now);
  return (
    <section className="today-brief" aria-labelledby="today-brief-title">
      <h2 id="today-brief-title">
        今天
        <small>{now.getMonth() + 1} 月 {now.getDate()} 日 · 根据你的投递整理</small>
        <span className="today-brief__tag">实验</span>
      </h2>
      <div className="today-brief__grid">
        {cards.map((card, index) => (
          <button
            type="button"
            key={card.id}
            className="today-brief__card"
            style={{ animationDelay: `${300 + index * 70}ms` }}
            onClick={() => onAction(card.action)}
          >
            <span className="today-brief__label">
              {card.portrait
                ? <span className="today-brief__face"><ExpertPortrait id={card.portrait} /></span>
                : <span className="today-brief__dot" aria-hidden="true" />}
              {card.label}
            </span>
            <strong>{card.title}</strong>
            <span className="today-brief__detail">{card.detail}</span>
            <span className="today-brief__cta">{card.cta}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
