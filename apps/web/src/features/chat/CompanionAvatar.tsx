import { DEFAULT_CHAT_COMPANION } from "@offerflow/domain";
import { UserAvatar } from "../../components/UserAvatar";

interface CompanionAvatarProps {
  className?: string;
  size?: "small" | "medium" | "large";
  showPresence?: boolean;
  decorative?: boolean;
}

export function CompanionAvatar({
  className = "",
  size = "medium",
  showPresence = false,
  decorative = false
}: CompanionAvatarProps) {
  return (
    <span
      className={`companion-avatar companion-avatar--${size}${className ? ` ${className}` : ""}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${DEFAULT_CHAT_COMPANION.name}，${DEFAULT_CHAT_COMPANION.role}`}
      aria-hidden={decorative ? "true" : undefined}
    >
      <UserAvatar avatarKey={DEFAULT_CHAT_COMPANION.avatarKey} />
      {showPresence && <i className="companion-avatar__presence" aria-hidden="true" />}
    </span>
  );
}
