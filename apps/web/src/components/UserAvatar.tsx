import { isAvatarKey, type AvatarKey } from "@offerflow/contracts";

export const avatarOptions: ReadonlyArray<{ key: AvatarKey; label: string }> = [
  { key: "sprout", label: "芽芽" },
  { key: "sunny", label: "暖阳" },
  { key: "peach", label: "桃桃" },
  { key: "cloud", label: "云朵" },
  { key: "berry", label: "莓莓" },
  { key: "acorn", label: "果果" },
  { key: "mint", label: "薄荷" },
  { key: "coral", label: "珊瑚" }
];

interface UserAvatarProps {
  avatarKey?: AvatarKey;
  className?: string;
  label?: string;
}

function AvatarArtwork({ avatarKey }: { avatarKey: AvatarKey }) {
  switch (avatarKey) {
    case "sunny":
      return (
        <>
          <path className="user-avatar__shape" d="M31 5c5 0 6.3 8.5 10.5 10.5S53.2 14.7 56 19s-4.8 9.3-3.7 14.6 7.4 8.1 4.4 12.3-3.1 4.3-10.8 2.1-15 5.2S26 61.2 21.4 58.7s-1.8-10.5-5.6-14.4S4.9 40.5 5.4 35s8.6-6.4 10.9-11.2S16.8 12 22 10.8 27 5 31 5Z" />
          <path className="user-avatar__detail" d="M20 17c2.5-2.8 6-3.5 9.1-1.9" />
          <circle className="user-avatar__ink" cx="25" cy="30" r="2.4" />
          <circle className="user-avatar__ink" cx="39" cy="30" r="2.4" />
          <path className="user-avatar__face" d="M23 39c2.7 4.3 12.4 5 17.2-.4" />
        </>
      );
    case "peach":
      return (
        <>
          <path className="user-avatar__shape" d="M35.5 7.5c10.3.7 19 9.3 19 20.7 0 15.8-11.6 28-27.4 28C14.8 56.2 7 49.6 7 39.8c0-8.4 6.2-13.1 13.3-17.2 7.3-4.2 8.4-15.5 15.2-15.1Z" />
          <path className="user-avatar__detail" d="M35.5 8c-1 5.5 1.8 9.5 7.3 11.5" />
          <circle className="user-avatar__ink" cx="25" cy="34" r="2.4" />
          <path className="user-avatar__face" d="M36 32.5c2.3 1.6 4.3 1.6 6.4 0M24 42.5c4.5 4.2 11.2 4.2 16-.2" />
        </>
      );
    case "cloud":
      return (
        <>
          <path className="user-avatar__shape" d="M15.8 51.5C8.8 49.8 5 45.3 5 39.6c0-6.1 4.3-10.4 10.5-11.4.5-8 6-13.7 13.7-13.7 5.2 0 9.6 2.8 12 7 1.6-.8 3.4-1.2 5.3-1.2 6.8 0 12.5 5.4 12.5 12.2 0 4.7-2.7 8.8-6.8 10.8-.7 6.7-5.5 11.2-12.3 11.2-4.2 0-7-1.7-9.6-4.4-3.9 2.5-9.4 2.6-14.5 1.4Z" />
          <circle className="user-avatar__ink" cx="25" cy="34" r="2.4" />
          <circle className="user-avatar__ink" cx="39" cy="34" r="2.4" />
          <path className="user-avatar__face" d="M23.5 42c4.8 3.6 11.6 3.6 16.5-.2" />
          <path className="user-avatar__detail" d="M17 26c1.6-3.1 4-5 7.4-5.7" />
        </>
      );
    case "berry":
      return (
        <>
          <path className="user-avatar__shape" d="M32 15c13.8 0 24.5 8.6 24.5 21.3S46.8 57 32.1 57 7.5 49.2 7.5 36.3 18.2 15 32 15Z" />
          <path className="user-avatar__cap" d="M29.8 17.2c-5.9-4.7-4.5-9.4-1.9-11 2.9-1.8 5.4 3.4 6 6.1 2.4-3.7 7.4-5.5 9.2-2.5 1.6 2.8-3.1 6.3-7.1 8" />
          <circle className="user-avatar__ink" cx="24.5" cy="34" r="2.4" />
          <circle className="user-avatar__ink" cx="39.5" cy="34" r="2.4" />
          <path className="user-avatar__face" d="M24 43c4.8 3.8 11.7 3.8 16.3 0" />
        </>
      );
    case "acorn":
      return (
        <>
          <path className="user-avatar__shape" d="M14.5 29.2C15.8 19 23 13 32 13s16.2 6 17.5 16.2c1.5 11.7-5 24.8-17.5 28.5-12.5-3.7-19-16.8-17.5-28.5Z" />
          <path className="user-avatar__cap" d="M12 27.5c1.6-12.3 8.8-19 20-19s18.4 6.7 20 19c-12.4-3.2-27.6-3.2-40 0Z" />
          <path className="user-avatar__detail" d="M22 18.5l4.2 5m10.3-7.5 4.4 5.3" />
          <circle className="user-avatar__ink" cx="25" cy="36" r="2.4" />
          <circle className="user-avatar__ink" cx="39" cy="36" r="2.4" />
          <path className="user-avatar__face" d="M23.5 45c4.5 3.3 12 3.3 16.8-.2" />
        </>
      );
    case "mint":
      return (
        <>
          <path className="user-avatar__shape" d="M31.7 7c6.5 0 7.5 9.9 12 12.4 4.4 2.4 13.6-1.1 15 5.2 1.4 6.2-8 9.6-10.5 14.3-2.4 4.8.8 13.5-5.2 16.1-5.8 2.5-11-5-16.9-5S20.2 58.8 16.8 54c-3.4-4.8 2.6-12.3.3-17.2-2.2-4.7-12-7-10-13.2 1.8-5.9 11-1.8 15.5-4.2C27.1 17 25.2 7 31.7 7Z" />
          <path className="user-avatar__detail" d="M18 22c2.7-2 5.4-2.8 8.2-2.3" />
          <circle className="user-avatar__ink" cx="25" cy="33" r="2.4" />
          <circle className="user-avatar__ink" cx="39" cy="33" r="2.4" />
          <path className="user-avatar__face" d="M23.5 42c4.7 4.1 12.3 4.1 17 0" />
        </>
      );
    case "coral":
      return (
        <>
          <path className="user-avatar__shape" d="M32 10c5.2 0 7 8 11.4 10.3 4.7 2.5 12.7-1.2 15 3.8 2.2 4.8-5.3 9.3-5.4 14.5-.1 5.3 7.1 10.2 3.4 14.4-3.7 4.1-10.6-1.2-15.9.2C35.5 54 31.7 61 27 58.1c-4.6-2.8-1.8-10.6-5.2-14.6-3.2-3.9-11.6-2.5-12.9-7.7-1.4-5.3 6.6-8.1 8.8-12.6C20 18.8 18.5 10 24 9.2c2.7-.4 5.2 2.2 8 4.6V10Z" />
          <circle className="user-avatar__ink" cx="25" cy="34" r="2.4" />
          <path className="user-avatar__face" d="M37 32c2.4 1.9 4.6 1.9 6.8 0M23.5 43c4.4 3.8 11.7 3.9 16.7.1" />
          <path className="user-avatar__detail" d="M20 18.5c2.6-1.6 5.4-1.6 8 0" />
        </>
      );
    case "sprout":
    default:
      return (
        <>
          <path className="user-avatar__shape" d="M32 13c14.4 0 25 8.6 25 21.5S47.4 57 32 57 7 48.2 7 34.5 17.6 13 32 13Z" />
          <path className="user-avatar__cap" d="M31.8 15.5C26.5 10.3 27.9 5.3 30.7 4c3.2-1.5 5.2 4 4.8 8 2.8-2.7 7.6-3.6 8.7-.7 1.1 3.2-4.7 5.8-9.5 6.2" />
          <circle className="user-avatar__ink" cx="24.5" cy="34" r="2.4" />
          <circle className="user-avatar__ink" cx="39.5" cy="34" r="2.4" />
          <path className="user-avatar__face" d="M23 42c5.1 4.5 12.8 4.5 18 0" />
        </>
      );
  }
}

export function UserAvatar({ avatarKey, className = "", label }: UserAvatarProps) {
  const resolvedKey = isAvatarKey(avatarKey) ? avatarKey : "sprout";
  return (
    <span
      className={`user-avatar user-avatar--${resolvedKey}${className ? ` ${className}` : ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <svg viewBox="0 0 64 64" focusable="false" aria-hidden="true">
        <AvatarArtwork avatarKey={resolvedKey} />
      </svg>
    </span>
  );
}
