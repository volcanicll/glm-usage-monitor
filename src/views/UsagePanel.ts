import * as vscode from "vscode";
import { QuotaSummary, UsageRange } from "../types/api";
import { getUsageRangeLabel } from "../util/timeWindow";

const CHART_COLORS = [
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

/**
 * 管理详情面板，展示模型占比环形图 + 工具使用柱状图
 */
export class UsagePanel {
  private panel: vscode.WebviewPanel | undefined;
  private currentSummary: QuotaSummary | null = null;
  private currentRange: UsageRange = "today";
  private isLoading = false;
  private isOffline = false;

  constructor(private context: vscode.ExtensionContext) {}

  async show(
    summary: QuotaSummary | null,
    range: UsageRange = "today",
  ): Promise<void> {
    this.currentSummary = summary;
    this.currentRange = range;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      await this.updateContent();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "glmUsagePanel",
      "GLM 使用量",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "refresh":
            vscode.commands.executeCommand("glmUsage.refresh");
            break;
          case "changeRange":
            vscode.commands.executeCommand(
              "glmUsage.changeRange",
              message.range,
            );
            break;
        }
      },
      undefined,
      this.context.subscriptions,
    );

    await this.updateContent();
  }

  async update(
    summary: QuotaSummary,
    range: UsageRange = "today",
  ): Promise<void> {
    this.currentSummary = summary;
    this.currentRange = range;
    this.isLoading = false;
    this.isOffline = summary.isOffline === true;
    if (!this.panel) return;
    await this.updateContent();
  }

  showLoading(): void {
    this.isLoading = true;
    this.isOffline = false;
    if (this.panel) {
      this.panel.webview.html = this.getLoadingHtml();
    }
  }

  showOffline(): void {
    this.isOffline = true;
    this.isLoading = false;
    if (this.panel) {
      this.panel.webview.html = this.getHtml();
    }
  }

  hideOffline(): void {
    this.isOffline = false;
    if (this.panel) {
      this.panel.webview.html = this.getHtml();
    }
  }

  private async updateContent(): Promise<void> {
    if (!this.panel) return;
    this.panel.webview.html = this.getHtml();
  }

  // ── 图表生成 ──────────────────────────────────────

  private generateDonutSvg(
    models: {
      name: string;
      tokens: number;
      color: string;
      percent: number;
    }[],
    centerValue: string,
    centerLabel: string,
  ): string {
    const radius = 68;
    const sw = 18;
    const C = 2 * Math.PI * radius;
    const total = models.reduce((s, m) => s + m.tokens, 0);
    if (total === 0) {
      return `<svg viewBox="0 0 200 200" class="donut-chart">
        <circle cx="100" cy="100" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${sw}" opacity="0.2"/>
        <text x="100" y="96" text-anchor="middle" class="donut-value">--</text>
        <text x="100" y="116" text-anchor="middle" class="donut-label">${centerLabel}</text>
      </svg>`;
    }

    let cumOffset = 0;
    const segments = models
      .filter((m) => m.tokens > 0)
      .map((m) => {
        const arc = (m.tokens / total) * C;
        const s = `<circle cx="100" cy="100" r="${radius}" fill="none"
          stroke="${m.color}" stroke-width="${sw}"
          stroke-dasharray="${arc} ${C - arc}"
          stroke-dashoffset="${-cumOffset}"
          transform="rotate(-90 100 100)"/>`;
        cumOffset += arc;
        return s;
      })
      .join("\n");

    return `<svg viewBox="0 0 200 200" class="donut-chart">
      <circle cx="100" cy="100" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${sw}" opacity="0.12"/>
      ${segments}
      <text x="100" y="96" text-anchor="middle" class="donut-value">${centerValue}</text>
      <text x="100" y="116" text-anchor="middle" class="donut-label">${centerLabel}</text>
    </svg>`;
  }

  // ── HTML 主体 ──────────────────────────────────────

  private getHtml(): string {
    if (!this.currentSummary) {
      return this.getLoadingHtml();
    }

    const summary = this.currentSummary;
    const { tokenUsage, mcpUsage } = summary;
    const tokenPercent = Math.round(tokenUsage.percentage);
    const mcpPercent = Math.round(mcpUsage.percentage);
    const dominantPercent = Math.max(tokenPercent, mcpPercent);
    const tokenRemaining = Math.max(0, tokenUsage.total - tokenUsage.used);
    const mcpRemaining = Math.max(0, mcpUsage.total - mcpUsage.used);

    // 时间
    const tokenResetTime = summary.tokenResetAt
      ? new Date(summary.tokenResetAt).toLocaleString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "--";
    const mcpResetTime = summary.mcpResetAt
      ? new Date(summary.mcpResetAt).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "--";

    // ── 模型数据 ──
    const modelList = [
      ...(summary.modelUsageDetails?.totalUsage?.modelSummaryList ?? []),
    ].sort((a, b) => b.totalTokens - a.totalTokens);
    const donutData = modelList.map((m, i) => ({
      name: m.modelName,
      tokens: m.totalTokens,
      color: CHART_COLORS[i % CHART_COLORS.length],
      percent: summary.consumedTokens
        ? Math.round((m.totalTokens / summary.consumedTokens) * 1000) / 10
        : 0,
    }));

    const totalConsumed = summary.consumedTokens
      ? this.formatTokenCount(summary.consumedTokens)
      : "--";

    const donutSvg = this.generateDonutSvg(
      donutData,
      totalConsumed,
      "Token 使用",
    );

    const legendItems = donutData
      .map(
        (d) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${d.color}"></span>
        <span class="legend-name">${this.escapeHtml(d.name)}</span>
        <span class="legend-value">${this.formatTokenCount(d.tokens)}</span>
        <span class="legend-pct">${d.percent}%</span>
      </div>`,
      )
      .join("");

    // ── 工具数据 ──
    const toolItems = [
      {
        name: "网络搜索",
        count: summary.mcpToolCalls?.totalNetworkSearchCount ?? 0,
        color: CHART_COLORS[2],
      },
      {
        name: "网页阅读",
        count: summary.mcpToolCalls?.totalWebReadMcpCount ?? 0,
        color: CHART_COLORS[3],
      },
      {
        name: "Z 阅读",
        count: summary.mcpToolCalls?.totalZreadMcpCount ?? 0,
        color: CHART_COLORS[4],
      },
      {
        name: "搜索 MCP",
        count: summary.mcpToolCalls?.totalSearchMcpCount ?? 0,
        color: CHART_COLORS[0],
      },
    ];
    const maxTool = Math.max(...toolItems.map((t) => t.count), 1);
    const totalToolCalls = toolItems.reduce((s, t) => s + t.count, 0);

    const toolTags = toolItems
      .map(
        (t) => `
      <div class="tool-tag">
        <span class="tag-dot" style="background:${t.color}"></span>
        ${t.name}
      </div>`,
      )
      .join("");

    const barRows = toolItems
      .map(
        (t) => `
      <div class="bar-row">
        <div class="bar-name">${t.name}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(t.count / maxTool) * 100}%;background:${t.color}"></div>
        </div>
        <div class="bar-count">${t.count}</div>
      </div>`,
      )
      .join("");

    const countCards = toolItems
      .map(
        (t) => `
      <div class="count-card">
        <div class="count-num" style="color:${t.count > 0 ? t.color : "var(--muted)"}">${t.count}</div>
        <div class="count-label">${t.name}</div>
      </div>`,
      )
      .join("");

    // ── 范围 tabs ──
    const ranges: UsageRange[] = ["today", "last7Days", "last30Days"];
    const levelText = summary.level ? summary.level : "";

    // ── 凭证来源 ──
    const sourceLabels: Record<string, string> = {
      claude: "Claude Code",
      env: "环境变量",
      manual: "手动配置",
    };

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GLM Usage</title>
<style>
  :root {
    --accent: #6366f1;
    --green: #10b981;
    --yellow: #f59e0b;
    --red: #ef4444;
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-foreground);
    --card-bg: var(--vscode-editor-inactiveSelectionBackground);
    --panel-bg: var(--vscode-editor-selectionBackground);
    --border: var(--vscode-panel-border, rgba(128,128,128,.25));
    --muted: var(--vscode-descriptionForeground);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:var(--vscode-font-family,sans-serif);
    color:var(--fg);background:var(--bg);
    font-size:12px;line-height:1.5;padding:16px;
    max-height:100vh;overflow-y:auto;
  }

  /* 头部 */
  .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  .title{font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px}
  .level-badge{
    font-size:10px;font-weight:500;padding:2px 8px;border-radius:999px;
    background:var(--vscode-textBlockQuote-background);color:var(--muted);
    vertical-align:middle;
  }
  .header-right{display:flex;align-items:center;gap:8px}
  .tabs{display:flex;gap:2px;background:var(--card-bg);border-radius:8px;padding:3px}
  .tab{padding:5px 12px;border-radius:6px;cursor:pointer;color:var(--muted);font-size:11px;transition:all .15s}
  .tab.active{background:var(--vscode-textBlockQuote-background,var(--panel-bg));color:var(--fg);font-weight:600}
  .tab:hover:not(.active){opacity:.7}
  .refresh-btn{
    border:none;border-radius:6px;padding:5px 14px;cursor:pointer;font-size:11px;
    background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);
  }
  .refresh-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}

  /* 配额摘要条 */
  .quota-bar{
    display:flex;gap:12px;margin-bottom:14px;
    padding:10px 14px;border-radius:10px;background:var(--card-bg);
    border:1px solid var(--border);align-items:center;flex-wrap:wrap;
  }
  .quota-item{display:flex;align-items:center;gap:6px;font-size:11px}
  .quota-dot{width:8px;height:8px;border-radius:50%}
  .quota-dot.token{background:#6366f1}
  .quota-dot.mcp{background:#f59e0b}
  .quota-pct{font-weight:700;font-size:13px}
  .quota-meta{color:var(--muted)}
  .offline-badge{
    margin-left:auto;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:600;
    background:rgba(245,158,11,.15);color:#d97706;
  }

  /* 主网格 */
  .main-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .card{
    background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:16px;
    display:flex;flex-direction:column;
  }
  .card-title{font-size:13px;font-weight:600;margin-bottom:12px}

  /* 环形图 */
  .chart-area{display:flex;justify-content:center;margin-bottom:14px}
  .donut-chart{width:180px;height:180px}
  .donut-value{
    font-size:22px;font-weight:700;fill:var(--fg);
    font-family:var(--vscode-font-family,sans-serif);
  }
  .donut-label{
    font-size:11px;fill:var(--muted);
    font-family:var(--vscode-font-family,sans-serif);
  }

  /* 图例 */
  .legend{display:flex;flex-direction:column;gap:6px}
  .legend-item{display:grid;grid-template-columns:8px 1fr auto auto;gap:6px;align-items:center;font-size:11px}
  .legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .legend-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .legend-value{color:var(--muted);text-align:right;white-space:nowrap}
  .legend-pct{font-weight:600;text-align:right;min-width:36px}

  /* 工具标签 */
  .tool-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
  .tool-tag{
    display:flex;align-items:center;gap:4px;
    padding:3px 10px;border-radius:999px;font-size:11px;font-weight:500;
    background:var(--panel-bg);
  }
  .tag-dot{width:6px;height:6px;border-radius:50%}

  /* 柱状图 */
  .bar-chart{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
  .bar-row{display:grid;grid-template-columns:64px 1fr 36px;gap:8px;align-items:center}
  .bar-name{font-size:11px;color:var(--muted);white-space:nowrap}
  .bar-track{height:18px;border-radius:4px;background:var(--panel-bg);overflow:hidden}
  .bar-fill{height:100%;border-radius:4px;min-width:2px;transition:width .3s}
  .bar-count{font-size:13px;font-weight:700;text-align:right}

  /* 计数卡片 */
  .count-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  .count-card{
    text-align:center;padding:10px 6px;border-radius:8px;background:var(--panel-bg);
  }
  .count-num{font-size:20px;font-weight:700}
  .count-label{font-size:10px;color:var(--muted);margin-top:2px}

  /* 页脚 */
  .footer{
    margin-top:14px;padding-top:10px;border-top:1px solid var(--border);
    display:flex;justify-content:space-between;align-items:center;
    color:var(--muted);font-size:11px;
  }

  @media(max-width:600px){
    .main-grid{grid-template-columns:1fr}
    .quota-bar{flex-direction:column;align-items:flex-start;gap:6px}
  }

  /* 折线图 */
  .trend-card{
    background:var(--card-bg);border:1px solid var(--border);border-radius:12px;
    padding:16px;margin-top:14px;
  }
  .trend-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  .trend-title{font-size:13px;font-weight:600}
  .trend-legend{display:flex;gap:12px;flex-wrap:wrap}
  .trend-legend-item{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--muted)}
  .trend-legend-dot{width:8px;height:3px;border-radius:1px}
  .trend-svg{width:100%;height:auto;display:block}
  .trend-svg text{font-family:var(--vscode-font-family,sans-serif)}
</style>
</head>
<body>

<div class="header">
  <div class="title">GLM 套餐${levelText ? ` <span class="level-badge">${this.escapeHtml(levelText)}</span>` : ""}</div>
  <div class="header-right">
    <div class="tabs">
      ${ranges.map((r) => `<div class="tab ${r === this.currentRange ? "active" : ""}" onclick="changeRange('${r}')">${getUsageRangeLabel(r)}</div>`).join("")}
    </div>
    <button class="refresh-btn" onclick="refresh()">刷新</button>
  </div>
</div>

<div class="quota-bar">
  <div class="quota-item">
    <span class="quota-dot token"></span>
    Token <span class="quota-pct" style="color:${this.getProgressColor(tokenPercent)}">${tokenPercent}%</span>
    <span class="quota-meta">剩余 ${tokenRemaining.toLocaleString("zh-CN")} · 重置 ${tokenResetTime}</span>
  </div>
  <div class="quota-item">
    <span class="quota-dot mcp"></span>
    MCP <span class="quota-pct" style="color:${this.getProgressColor(mcpPercent)}">${mcpPercent}%</span>
    <span class="quota-meta">剩余 ${mcpRemaining.toLocaleString("zh-CN")} · 重置 ${mcpResetTime}</span>
  </div>
  ${this.isOffline ? '<span class="offline-badge">⚡ 离线缓存</span>' : ""}
</div>

<div class="main-grid">
  <div class="card">
    <div class="card-title">模型使用占比</div>
    <div class="chart-area">${donutSvg}</div>
    <div class="legend">${legendItems || '<div style="color:var(--muted)">暂无模型数据</div>'}</div>
  </div>

  <div class="card">
    <div class="card-title">工具使用统计</div>
    <div class="tool-tags">${toolTags}</div>
    <div class="bar-chart">${barRows}</div>
    <div class="count-grid">${countCards}</div>
  </div>
</div>

${this.generateLineChartSection(summary)}

<div class="footer">
  <span>${this.getRefreshInfoHtml(summary)}</span>
  <span>${summary.credentialSource ? `来源：${sourceLabels[summary.credentialSource] || summary.credentialSource}` : ""}</span>
</div>

<script>
  const vscode = acquireVsCodeApi();
  function refresh(){vscode.postMessage({type:'refresh'})}
  function changeRange(r){vscode.postMessage({type:'changeRange',range:r})}
</script>
</body>
</html>`;
  }

  // ── 加载态 ──

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8">
<style>
  body{margin:0;padding:18px;font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}
  .skeleton{height:76px;border-radius:12px;margin-bottom:10px;background:var(--vscode-textBlockQuote-background);animation:pulse 1.4s ease-in-out infinite}
  .skeleton.small{height:42px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .loading-text{margin-top:14px;text-align:center;color:var(--vscode-descriptionForeground);font-size:12px}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
</style>
</head>
<body>
  <div class="skeleton small"></div>
  <div class="skeleton"></div>
  <div class="grid"><div class="skeleton"></div><div class="skeleton"></div></div>
  <div class="loading-text">正在加载 GLM 使用量数据...</div>
</body>
</html>`;
  }

  // ── 折线图 ──

  private generateLineChartSection(summary: QuotaSummary): string {
    const ts = summary.modelTimeSeries;
    if (!ts || ts.xTime.length === 0) return "";

    const { xTime, totalTokensUsage, models, granularity } = ts;
    const W = 600,
      padL = 52,
      padR = 16,
      padT = 12;
    const dense = xTime.length > 30;
    const padB = dense ? 56 : 36;
    const H = 200 + (dense ? 20 : 0);
    const cw = W - padL - padR;
    const ch = H - padT - padB;

    // Y 轴最大值
    const maxVal = Math.max(...totalTokensUsage, ...models.flatMap((m) => m.tokensUsage), 1);
    const niceMax = this.niceNum(maxVal);

    const yScale = (v: number) => padT + ch - (v / niceMax) * ch;
    const xStep = xTime.length > 1 ? cw / (xTime.length - 1) : cw;

    // X 轴标签：最多显示 8 个，自动计算间隔
    const maxLabels = 8;
    const labelStep = Math.max(1, Math.ceil(xTime.length / maxLabels));

    // Y 轴刻度
    const yTicks = 4;
    let yAxisSvg = "";
    for (let i = 0; i <= yTicks; i++) {
      const v = (niceMax / yTicks) * i;
      const y = yScale(v);
      yAxisSvg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
      yAxisSvg += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" fill="var(--muted)" font-size="9">${this.formatTokenCount(v)}</text>`;
    }

    // X 轴标签：密集时旋转避免重叠
    const tickExtra = dense ? 20 : 16;
    let xAxisSvg = "";
    for (let i = 0; i < xTime.length; i += labelStep) {
      const x = padL + i * xStep;
      const raw =
        granularity === "hourly"
          ? xTime[i].replace(/^.*(\d{2})-(\d{2}) (\d{2}:\d{2})$/, "$2/$3").replace(/^.*(\d{2}:\d{2})$/, "$1")
          : xTime[i].replace(/^\d{4}-/, "");
      if (dense) {
        xAxisSvg += `<text x="0" y="0" text-anchor="end" fill="var(--muted)" font-size="9" transform="translate(${x},${H - padB + 10}) rotate(-40)">${raw}</text>`;
      } else {
        const textY = H - padB + tickExtra;
        xAxisSvg += `<text x="${x}" y="${textY}" text-anchor="middle" fill="var(--muted)" font-size="9">${raw}</text>`;
      }
    }

    // 每个模型一条线
    const lines = models
      .filter((m) => m.totalTokens > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .map((m, idx) => {
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        const points = m.tokensUsage
          .map((v, i) => {
            const x = padL + i * xStep;
            const y = yScale(v);
            return `${x},${y}`;
          })
          .join(" ");
        return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
      })
      .join("\n");

    // 图例
    const legendItems = models
      .filter((m) => m.totalTokens > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .map((m, idx) => {
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        return `<span class="trend-legend-item"><span class="trend-legend-dot" style="background:${color}"></span>${this.escapeHtml(m.modelName)}</span>`;
      })
      .join("");

    const svg = `<svg viewBox="0 0 ${W} ${H}" class="trend-svg" preserveAspectRatio="xMidYMid meet">
      ${yAxisSvg}
      ${xAxisSvg}
      ${lines}
    </svg>`;

    return `<div class="trend-card">
      <div class="trend-header">
        <div class="trend-title">Token 用量趋势</div>
        <div class="trend-legend">${legendItems}</div>
      </div>
      ${svg}
    </div>`;
  }

  private niceNum(val: number): number {
    if (val <= 0) return 1;
    const exp = Math.floor(Math.log10(val));
    const frac = val / Math.pow(10, exp);
    let nice: number;
    if (frac <= 1.5) nice = 1.5;
    else if (frac <= 2) nice = 2;
    else if (frac <= 3) nice = 3;
    else if (frac <= 5) nice = 5;
    else if (frac <= 7) nice = 7;
    else nice = 10;
    return nice * Math.pow(10, exp);
  }

  // ── 工具方法 ──

  private getRefreshInfoHtml(summary: QuotaSummary): string {
    const parts: string[] = [];
    if (this.isOffline) parts.push("⚡ 离线模式");
    if (summary.lastRefreshTime) {
      const ago = Math.floor(
        (Date.now() - new Date(summary.lastRefreshTime).getTime()) / 60000,
      );
      parts.push(ago < 1 ? "刚刚更新" : ago < 60 ? `${ago} 分钟前更新` : `更新于 ${new Date(summary.lastRefreshTime).toLocaleString("zh-CN", { hour12: false })}`);
    }
    if (summary.nextRefreshTime) {
      const until = Math.floor(
        (new Date(summary.nextRefreshTime).getTime() - Date.now()) / 60000,
      );
      if (until > 0) parts.push(`${until} 分钟后刷新`);
    }
    return parts.length > 0
      ? parts.join(" · ")
      : `更新于 ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
  }

  private getProgressColor(pct: number): string {
    if (pct >= 95) return "#d05d5d";
    if (pct >= 80) return "#d9a441";
    return "#10b981";
  }

  private formatTokenCount(v: number): string {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toString();
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }
}
