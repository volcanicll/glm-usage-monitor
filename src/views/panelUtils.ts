/**
 * GLM Usage 面板的纯函数工具集（无副作用、可独立测试）。
 * 不依赖 vscode API，便于单元测试。
 */

/** 图表配色（从 UsagePanel 迁移，保持视觉连续） */
export const CHART_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#84cc16",
];

/** Token 数量简写：1.2K / 3.4M / 1.1B */
export function formatTokenCount(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toString();
}

/** 配额百分比对应的语义色：绿（充足）/ 黄（紧张）/ 红（危急） */
export function getProgressColor(pct: number): string {
  if (pct >= 95) return "#d05d5d";
  if (pct >= 80) return "#d9a441";
  return "#10b981";
}

/** HTML 转义，防止用户输入（模型名等）注入 webview */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 计算相对时间描述（用于配额重置、刷新时间）。
 * 仅处理「未来」场景的友好描述；过去返回"已过期"；无效返回"--"。
 */
export function getRelativeTime(
  targetIso: string,
  now: Date = new Date(),
): string {
  if (!targetIso) return "--";
  const target = new Date(targetIso);
  if (isNaN(target.getTime())) return "--";

  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return "已过期";

  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} 分钟后`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时后`;
  const days = Math.floor(hours / 24);
  return `${days} 天后`;
}

/** 卡片标题内联 SVG 图标（14×14，stroke 用 currentColor 自适应主题） */
export function getIcon(
  name: "quota" | "donut" | "tool" | "trend",
): string {
  const common =
    'width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  switch (name) {
    case "quota":
      return `<svg ${common}><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 2v10l8 4"/></svg>`;
    case "donut":
      return `<svg ${common}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>`;
    case "tool":
      return `<svg ${common}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.8-2.8z"/></svg>`;
    case "trend":
      return `<svg ${common}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>`;
    default:
      throw new Error(`unknown icon: ${name}`);
  }
}
