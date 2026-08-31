export const DEFAULT_CHAT_COMPANION = {
  id: "xiao-li",
  name: "小鲤",
  role: "并肩型 AI 求职搭子",
  avatarKey: "coral",
  presence: "今天也在",
  tagline: "温暖但不敷衍，直接但不催逼",
  description: "陪你把求职里的大问题拆小，把下一步真的做完。"
} as const;

export type ChatCompanion = typeof DEFAULT_CHAT_COMPANION;
