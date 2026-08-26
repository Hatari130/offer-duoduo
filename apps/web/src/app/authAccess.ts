export function loginReasonForPath(pathname: string): string | undefined {
  if (/^\/app\/chat\/.+/.test(pathname)) return "登录后才能打开并继续历史对话。";
  if (pathname.startsWith("/app/applications")) return "登录后即可添加并管理你的投递记录。";
  if (pathname.startsWith("/app/resumes")) return "登录后即可创建、保存和管理你的简历。";
  if (pathname.startsWith("/app/settings")) return "登录后即可管理账号与设备同步。";
  if (pathname.startsWith("/app/upgrade")) return "登录后即可查看和管理会员方案。";
  if (pathname.startsWith("/extension/connect")) return "登录后即可连接浏览器插件。";
  return undefined;
}
