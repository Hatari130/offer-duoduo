import type { ChatAgentProfile } from "@offerflow/contracts";
import type { ChatAgentExpert, ChatAgentName } from "@offerflow/domain";
import { Check, Info, UserPlus } from "lucide-react";
import { TeamCover } from "./TeamCover";
import { ExpertAvatar } from "./skillMeta";

export function TeamGallery({
  agents,
  skills,
  activeTeam,
  onInvite,
  onDetail
}: {
  agents: ChatAgentProfile[];
  skills: ChatAgentExpert[];
  activeTeam?: ChatAgentName;
  onInvite: (team: ChatAgentName) => void;
  onDetail: (team: ChatAgentName) => void;
}) {
  return (
    <section className="team-gallery" aria-labelledby="team-gallery-title">
      <header>
        <h2 id="team-gallery-title">邀请一支团队</h2>
        <p>每支团队由一位主教练和几位专家组成，可以在技能市场里增减成员。</p>
      </header>
      <div className="team-gallery__grid">
        {agents.map((agent) => {
          const members = agent.defaultSkills.flatMap((id) => skills.filter((skill) => skill.id === id));
          const invited = activeTeam === agent.id;
          return (
            <article key={agent.id} className={`team-card${invited ? " is-invited" : ""}`}>
              <TeamCover team={agent.id} tagline={agent.tagline} />
              <div className="team-card__body">
                <h3>{agent.name}</h3>
                <p>{agent.description}</p>
                <div className="team-card__members" aria-label={`${members.length} 位专家`}>
                  <span className="avatar-stack">
                    {members.map((member) => <ExpertAvatar key={member.id} expert={member} />)}
                  </span>
                  <small>{members.map((member) => member.name).join("、")}</small>
                </div>
                <div className="team-card__actions">
                  <button type="button" className="team-card__detail" onClick={() => onDetail(agent.id)}>
                    <Info aria-hidden="true" size={14} />详情
                  </button>
                  <button type="button" className="team-card__invite" onClick={() => onInvite(agent.id)} aria-pressed={invited}>
                    {invited ? <Check aria-hidden="true" size={14} /> : <UserPlus aria-hidden="true" size={14} />}
                    {invited ? "已邀请" : "邀请团队"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
