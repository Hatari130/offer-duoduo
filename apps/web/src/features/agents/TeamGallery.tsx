import type { ChatAgentProfile } from "@offerflow/contracts";
import type { ChatAgentExpert, ChatAgentName } from "@offerflow/domain";
import { Check } from "lucide-react";
import { TeamCover } from "./TeamCover";
import { ExpertAvatar } from "./skillMeta";

/** One card per team: cover, name, members. Details and the invite button live in the team dialog. */
export function TeamGallery({
  agents,
  skills,
  activeTeam,
  onOpen
}: {
  agents: ChatAgentProfile[];
  skills: ChatAgentExpert[];
  activeTeam?: ChatAgentName;
  onOpen: (team: ChatAgentName) => void;
}) {
  return (
    <section className="team-gallery" aria-labelledby="team-gallery-title">
      <h2 id="team-gallery-title">邀请一支团队</h2>
      <div className="team-gallery__grid">
        {agents.map((agent) => {
          const members = agent.defaultSkills.flatMap((id) => skills.filter((skill) => skill.id === id));
          const invited = activeTeam === agent.id;
          return (
            <button
              type="button"
              key={agent.id}
              className={`team-card${invited ? " is-invited" : ""}`}
              onClick={() => onOpen(agent.id)}
              aria-label={`${agent.name}${invited ? "（已邀请）" : ""}，查看成员并邀请`}
            >
              <TeamCover team={agent.id} tagline={agent.tagline} />
              {invited && <span className="team-card__badge"><Check aria-hidden="true" size={12} />已邀请</span>}
              <span className="team-card__footer">
                <strong>{agent.name.replace("团队", "")}</strong>
                <span className="avatar-stack" aria-hidden="true">
                  {members.slice(0, 3).map((member) => <ExpertAvatar key={member.id} expert={member} />)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
