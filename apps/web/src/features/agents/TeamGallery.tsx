import { useState, type CSSProperties } from "react";
import type { ChatAgentProfile } from "@offerflow/contracts";
import type { ChatAgentExpert, ChatAgentName } from "@offerflow/domain";
import { Check } from "lucide-react";
import { TeamCover } from "./TeamCover";
import { ExpertAvatar } from "./skillMeta";

// Resting pose of each card in the fan: a little tilt and lift so the deck looks hand-placed.
const TILTS = [5, -4, 3, -4, 4, -3];
const LIFTS = [6, -4, 4, -6, 3, -5];

/**
 * The teams as a fanned deck of overlapping cards. Hovering (or focusing) a card
 * straightens and enlarges it, slides its neighbours aside and reveals the name,
 * members and an invite button. Clicking the cover opens the team details.
 */
export function TeamGallery({
  agents,
  skills,
  activeTeam,
  onOpen,
  onInvite
}: {
  agents: ChatAgentProfile[];
  skills: ChatAgentExpert[];
  activeTeam?: ChatAgentName;
  onOpen: (team: ChatAgentName) => void;
  onInvite: (team: ChatAgentName) => void;
}) {
  const [hovered, setHovered] = useState<number>();
  const middle = (agents.length - 1) / 2;

  return (
    <section className="team-deck" aria-label="邀请一支团队">
      <div
        className="team-deck__stack"
        data-hovering={hovered !== undefined}
        onMouseLeave={() => setHovered(undefined)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(undefined);
        }}
      >
        {agents.map((agent, index) => {
          const members = agent.defaultSkills.flatMap((id) => skills.filter((skill) => skill.id === id));
          const invited = activeTeam === agent.id;
          const position = hovered === undefined ? undefined : index === hovered ? "self" : index < hovered ? "before" : "after";
          const style = {
            "--deck-x": `${(index - middle) * 78}%`,
            "--deck-y": `${LIFTS[index % LIFTS.length]}px`,
            "--deck-rotate": `${TILTS[index % TILTS.length]}deg`,
            "--deck-z": index + 1
          } as CSSProperties;
          return (
            <article
              key={agent.id}
              className={`team-deck-card${invited ? " is-invited" : ""}`}
              data-position={position}
              style={style}
              onMouseEnter={() => setHovered(index)}
              onFocus={() => setHovered(index)}
            >
              <button
                type="button"
                className="team-deck-card__cover"
                onClick={() => onOpen(agent.id)}
                aria-label={`${agent.name}${invited ? "（已邀请）" : ""}，查看成员`}
              >
                <TeamCover team={agent.id} tagline={agent.tagline} square />
              </button>
              {invited && <span className="team-deck-card__badge"><Check aria-hidden="true" size={11} />已邀请</span>}
              <div className="team-deck-card__details">
                <span className="team-deck-card__name">
                  <strong>{agent.name.replace("团队", "")}</strong>
                  <span className="avatar-stack" aria-label={`${members.length} 位专家`}>
                    {members.slice(0, 4).map((member) => <ExpertAvatar key={member.id} expert={member} />)}
                  </span>
                </span>
                <button
                  type="button"
                  className="team-deck-card__invite"
                  onClick={() => (invited ? onOpen(agent.id) : onInvite(agent.id))}
                >
                  {invited ? "调整" : "邀请"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
