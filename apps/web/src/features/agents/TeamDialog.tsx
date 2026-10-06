import type { ChatAgentProfile } from "@offerflow/contracts";
import type { ChatAgentExpert } from "@offerflow/domain";
import { AtSign, Minus, Plus, RotateCcw, UserPlus } from "lucide-react";
import { Modal } from "./Modal";
import { TeamCover } from "./TeamCover";
import { ExpertAvatar } from "./skillMeta";

/**
 * Team details. For the invited team members can be removed, mentioned or added
 * from the market; for other teams it is a read-only preview with an invite button.
 */
export function TeamDialog({
  team,
  members,
  invited,
  locked,
  onClose,
  onInvite,
  onRemove,
  onReset,
  onMention,
  onOpenMarket
}: {
  team?: ChatAgentProfile;
  members: ChatAgentExpert[];
  invited: boolean;
  /** The conversation already belongs to another team, so this one cannot be invited here. */
  locked: boolean;
  onClose: () => void;
  onInvite: () => void;
  onRemove: (skillId: string) => void;
  onReset: () => void;
  onMention: (expert: ChatAgentExpert) => void;
  onOpenMarket: () => void;
}) {
  return (
    <Modal open={Boolean(team)} onClose={onClose} labelledBy="team-dialog-title" className="team-dialog">
      {team && (
        <>
          <TeamCover team={team.id} tagline={team.tagline} />
          <div className="team-dialog__body">
            <h2 id="team-dialog-title">{team.name}</h2>
            <p>{team.description}</p>
            <h3>
              团队成员
              <span>主教练小鲤 + {members.length} 位专家</span>
            </h3>
            <ul className="team-members">
              {members.map((member) => (
                <li key={member.id}>
                  <ExpertAvatar expert={member} size="large" />
                  <div>
                    <strong>{member.name}</strong>
                    <small>{member.role}</small>
                    <p>{member.summary}</p>
                  </div>
                  {invited && (
                    <span className="team-members__actions">
                      <button type="button" aria-label={`在输入框里点名 ${member.name}`} onClick={() => onMention(member)}>
                        <AtSign aria-hidden="true" size={14} />
                      </button>
                      <button type="button" aria-label={`把 ${member.name} 移出团队`} onClick={() => onRemove(member.id)}>
                        <Minus aria-hidden="true" size={14} />
                      </button>
                    </span>
                  )}
                </li>
              ))}
              {!members.length && <li className="team-members__empty">现在只有主教练小鲤。可以去技能市场请专家加入。</li>}
            </ul>
            <footer>
              {invited ? (
                <>
                  <button type="button" className="team-dialog__secondary" onClick={onReset}>
                    <RotateCcw aria-hidden="true" size={14} />恢复默认成员
                  </button>
                  <button type="button" className="team-dialog__primary" onClick={onOpenMarket}>
                    <Plus aria-hidden="true" size={14} />去技能市场添加
                  </button>
                </>
              ) : (
                <button type="button" className="team-dialog__primary" onClick={onInvite} disabled={locked}>
                  <UserPlus aria-hidden="true" size={14} />{locked ? "这段对话已有团队，请开始新对话" : "邀请这支团队"}
                </button>
              )}
            </footer>
          </div>
        </>
      )}
    </Modal>
  );
}
