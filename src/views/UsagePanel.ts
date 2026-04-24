import * as vscode from "vscode";
import { QuotaSummary, UsageRange } from "../types/api";
import { getUsageRangeLabel } from "../util/timeWindow";

/**
 * Manages the GLM Usage webview panel with charts and dashboard
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
    // 从 summary 中读取离线状态
    this.isOffline = summary.isOffline === true;

    if (!this.panel) {
      return;
    }

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
    if (!this.panel) {
      return;
    }
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    if (!this.currentSummary) {
      return this.getLoadingHtml();
    }

    const summary = this.currentSummary;
    const { tokenUsage, mcpUsage } = summary;
    const modelUsage = summary.modelUsageDetails?.totalUsage;
    const toolUsage = summary.toolUsageDetails?.totalUsage;
    const tokenPercent = Math.round(tokenUsage.percentage);
    const mcpPercent = Math.round(mcpUsage.percentage);
    const dominantPercent = Math.max(tokenPercent, mcpPercent);
    const tokenRemaining = Math.max(0, tokenUsage.total - tokenUsage.used);
    const mcpRemaining = Math.max(0, mcpUsage.total - mcpUsage.used);
    const totalToolCalls =
      (summary.mcpToolCalls?.totalNetworkSearchCount ?? 0) +
      (summary.mcpToolCalls?.totalWebReadMcpCount ?? 0) +
      (summary.mcpToolCalls?.totalZreadMcpCount ?? 0) +
      (summary.mcpToolCalls?.totalSearchMcpCount ?? 0);

    const tokenResetTime = summary.tokenResetAt
      ? new Date(summary.tokenResetAt).toLocaleString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "未知";

    const mcpResetTime = summary.mcpResetAt
      ? new Date(summary.mcpResetAt).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "未知";

    const sourceLabels: Record<string, string> = {
      claude: "Claude Code 配置",
      env: "环境变量",
      manual: "手动配置",
    };

    const topModel = [...(modelUsage?.modelSummaryList ?? [])]
      .sort((a, b) => b.totalTokens - a.totalTokens)[0];
    const toolRankingSource =
      toolUsage?.toolSummaryList && toolUsage.toolSummaryList.length > 0
        ? toolUsage.toolSummaryList.map((item) => ({
            title: item.toolName,
            value: item.totalUsageCount,
            detail: item.toolCode,
          }))
        : (toolUsage?.toolDetails ?? []).map((item) => ({
            title: item.modelName,
            value: item.totalUsageCount,
            detail: "toolDetails",
          }));
    const topTool = [...toolRankingSource].sort((a, b) => b.value - a.value)[0];

    const summaryStats = [
      {
        label: "Token 配额",
        value: `${tokenPercent}%`,
        note: `剩余 ${tokenRemaining.toLocaleString("zh-CN")}`,
      },
      {
        label: "MCP 配额",
        value: `${mcpPercent}%`,
        note: `剩余 ${mcpRemaining.toLocaleString("zh-CN")}`,
      },
      {
        label: "模型调用",
        value: modelUsage?.totalModelCallCount?.toLocaleString("zh-CN") ?? "--",
        note:
          summary.consumedTokens !== undefined
            ? `${this.formatTokenCount(summary.consumedTokens)} tokens`
            : "暂无数据",
      },
      {
        label: "工具调用",
        value: totalToolCalls.toLocaleString("zh-CN"),
        note: topTool ? `${this.escapeHtml(topTool.title)} 最活跃` : "暂无数据",
      },
    ];

    const modelRankingRows =
      modelUsage?.modelSummaryList && modelUsage.modelSummaryList.length > 0
        ? modelUsage.modelSummaryList
            .map((item, index) =>
              this.renderBreakdownRow({
                rank: index + 1,
                title: item.modelName,
                value: this.formatTokenCount(item.totalTokens),
                detail: `${item.totalTokens.toLocaleString("zh-CN")} tokens`,
                percent: this.getPercent(item.totalTokens, summary.consumedTokens),
              }),
            )
            .join("")
        : `<div class="empty-state">当前时间范围内暂无模型明细数据。</div>`;

    const toolRankingRows =
      toolRankingSource.length > 0
        ? toolRankingSource
            .map((item, index) =>
              this.renderBreakdownRow({
                rank: index + 1,
                title: item.title,
                value: `${item.value.toLocaleString("zh-CN")} 次`,
                detail: item.detail,
                percent: this.getPercent(item.value, totalToolCalls),
              }),
            )
            .join("")
        : `<div class="empty-state">当前时间范围内暂无工具明细数据。</div>`;

    const ranges: UsageRange[] = ["today", "last7Days", "last30Days"];

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GLM Usage Monitor</title>
  <style>
    :root {
      --accent: #0f766e;
      --accent-soft: rgba(15, 118, 110, 0.12);
      --accent-strong: #115e59;
      --green: #10b981;
      --yellow: #f59e0b;
      --red: #ef4444;
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --card-bg: color-mix(in srgb, var(--vscode-editor-inactiveSelectionBackground) 80%, transparent);
      --panel-bg: color-mix(in srgb, var(--vscode-editor-selectionBackground) 42%, transparent);
      --border: var(--vscode-panel-border, #e0e0e0);
      --muted: var(--vscode-descriptionForeground);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 14px;
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--fg);
      background: var(--bg);
      font-size: 12px;
      line-height: 1.45;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .title {
      font-size: 16px;
      font-weight: 700;
    }
    .refresh-btn {
      border: none;
      border-radius: 8px;
      padding: 5px 12px;
      cursor: pointer;
      font-size: 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .refresh-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 10px;
      padding: 4px;
      border-radius: 10px;
      background: var(--card-bg);
    }
    .tab {
      flex: 1;
      padding: 7px 10px;
      border-radius: 8px;
      text-align: center;
      cursor: pointer;
      color: var(--muted);
    }
    .tab.active {
      background: var(--vscode-textBlockQuote-background, #e8f4fd);
      color: var(--fg);
      font-weight: 600;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 10px;
    }
    .hero-card {
      border-color: ${this.getProgressColor(dominantPercent)};
      background: linear-gradient(
        180deg,
        color-mix(in srgb, ${this.getProgressColor(dominantPercent)} 10%, var(--card-bg)),
        var(--card-bg)
      );
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 10px;
    }
    .eyebrow {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent-strong);
      margin-bottom: 4px;
    }
    .hero-title {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.2;
    }
    .hero-subtitle {
      margin-top: 4px;
      color: var(--muted);
      max-width: 480px;
    }
    .badge-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: var(--accent-soft);
      color: var(--accent-strong);
      white-space: nowrap;
    }
    .pill.offline-badge {
      background: rgba(245, 158, 11, 0.15);
      color: #d97706;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .stat-card {
      border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      border-radius: 10px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.03);
    }
    .stat-label {
      color: var(--muted);
      margin-bottom: 6px;
    }
    .stat-value {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.2;
      word-break: break-word;
    }
    .stat-note {
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
    }
    .section-subtitle {
      margin-top: 2px;
      font-size: 11px;
      color: var(--muted);
    }
    .quota-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .quota-card {
      background: var(--panel-bg);
      border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
      border-radius: 10px;
      padding: 12px;
    }
    .quota-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 8px;
    }
    .quota-name {
      font-size: 12px;
      font-weight: 600;
    }
    .quota-value {
      font-size: 18px;
      font-weight: 700;
    }
    .progress {
      height: 5px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--vscode-progressBar-background);
    }
    .progress-fill {
      height: 100%;
      border-radius: inherit;
    }
    .quota-meta {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 6px;
      color: var(--muted);
      font-size: 11px;
    }
    .module-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      align-items: start;
    }
    .module-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      min-width: 0;
    }
    .mini-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }
    .mini-stat {
      background: var(--panel-bg);
      border-radius: 10px;
      padding: 10px;
    }
    .mini-stat-label {
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .mini-stat-value {
      font-size: 16px;
      font-weight: 700;
      word-break: break-word;
    }
    .mini-stat-note {
      margin-top: 4px;
      color: var(--muted);
      font-size: 10px;
    }
    .divider {
      height: 1px;
      margin: 10px 0;
      background: color-mix(in srgb, var(--border) 85%, transparent);
    }
    .tool-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }
    .tool-item {
      padding: 10px;
      border-radius: 10px;
      background: var(--panel-bg);
    }
    .tool-label {
      color: var(--muted);
      margin-bottom: 4px;
    }
    .tool-value {
      font-size: 18px;
      font-weight: 700;
    }
    .tool-note {
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
    }
    .ranking-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ranking-row {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      padding: 10px;
      border-radius: 10px;
      background: var(--panel-bg);
    }
    .rank-badge {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: var(--accent-strong);
      background: var(--accent-soft);
    }
    .ranking-title {
      font-size: 13px;
      font-weight: 600;
      word-break: break-word;
    }
    .ranking-detail {
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
    }
    .mini-bar {
      height: 5px;
      margin-top: 7px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--vscode-progressBar-background);
    }
    .mini-bar-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--accent), #d97706);
    }
    .ranking-value {
      min-width: 84px;
      text-align: right;
    }
    .ranking-number {
      font-size: 13px;
      font-weight: 700;
    }
    .ranking-percent {
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
    }
    .empty-state {
      padding: 8px 0 2px;
      color: var(--muted);
    }
    .credential-source {
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--vscode-textBlockQuote-background);
      text-align: center;
      color: var(--muted);
      font-size: 11px;
    }
    .footer {
      margin-top: 8px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--muted);
      font-size: 11px;
    }
    @media (max-width: 720px) {
      .stats-grid,
      .quota-grid,
      .module-grid,
      .mini-stats,
      .tool-grid {
        grid-template-columns: 1fr;
      }
      .hero-top {
        flex-direction: column;
      }
      .ranking-row {
        grid-template-columns: 30px minmax(0, 1fr);
      }
      .ranking-value {
        min-width: 0;
        text-align: left;
        grid-column: 2;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">GLM 使用量监控</div>
    <button class="refresh-btn" onclick="refresh()">刷新</button>
  </div>

  <div class="tabs">
    ${ranges
      .map(
        (range) => `
      <div class="tab ${range === this.currentRange ? "active" : ""}" onclick="changeRange('${range}')">
        ${getUsageRangeLabel(range)}
      </div>`,
      )
      .join("")}
  </div>

  <div class="card hero-card">
    <div class="hero-top">
      <div>
        <div class="eyebrow">核心监控</div>
        <div class="hero-title">GLM 配额与调用总览</div>
        <div class="hero-subtitle">配额、模型、工具</div>
      </div>
      <div class="badge-row">
        <span class="pill">${getUsageRangeLabel(this.currentRange)}</span>
        <span class="pill">${this.getHealthLabel(dominantPercent)}</span>
        ${this.isOffline ? '<span class="pill offline-badge">⚡ 离线缓存</span>' : ""}
      </div>
    </div>
    <div class="stats-grid">
      ${summaryStats
        .map(
          (item) => `
        <div class="stat-card">
          <div class="stat-label">${item.label}</div>
          <div class="stat-value">${item.value}</div>
          <div class="stat-note">${item.note}</div>
        </div>`,
        )
        .join("")}
    </div>
  </div>

  <div class="card">
    <div class="section-header">
      <div>
        <div class="section-title">配额状态</div>
        <div class="section-subtitle">Token / MCP</div>
      </div>
      <span class="pill">${this.getHealthLabel(dominantPercent)}</span>
    </div>
    <div class="quota-grid">
      ${this.renderQuotaCard("Token 配额", tokenPercent, tokenUsage.used, tokenRemaining, tokenResetTime)}
      ${this.renderQuotaCard("MCP 配额", mcpPercent, mcpUsage.used, mcpRemaining, mcpResetTime)}
    </div>
  </div>

  <div class="module-grid">
    <div class="module-card">
      <div class="section-header">
        <div>
          <div class="section-title">模型统计</div>
          <div class="section-subtitle">调用与消耗</div>
        </div>
        <span class="pill">${modelUsage?.modelSummaryList?.length ?? 0} 个模型</span>
      </div>
      <div class="mini-stats">
        <div class="mini-stat">
          <div class="mini-stat-label">总调用</div>
          <div class="mini-stat-value">${modelUsage?.totalModelCallCount?.toLocaleString("zh-CN") ?? "--"}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">总 Token</div>
          <div class="mini-stat-value">${summary.consumedTokens !== undefined ? this.formatTokenCount(summary.consumedTokens) : "--"}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">主力模型</div>
          <div class="mini-stat-value">${topModel ? this.escapeHtml(topModel.modelName) : "--"}</div>
          <div class="mini-stat-note">${topModel ? this.formatPercent(topModel.totalTokens, summary.consumedTokens) : ""}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="ranking-list">
        ${modelRankingRows}
      </div>
    </div>

    <div class="module-card">
      <div class="section-header">
        <div>
          <div class="section-title">工具统计</div>
          <div class="section-subtitle">调用分布</div>
        </div>
        <span class="pill">${totalToolCalls.toLocaleString("zh-CN")} 次</span>
      </div>
      <div class="tool-grid">
        ${this.renderToolKpi("网络搜索", summary.mcpToolCalls?.totalNetworkSearchCount ?? 0, "联网检索")}
        ${this.renderToolKpi("网页阅读", summary.mcpToolCalls?.totalWebReadMcpCount ?? 0, "网页解析")}
        ${this.renderToolKpi("Z阅读", summary.mcpToolCalls?.totalZreadMcpCount ?? 0, "文档处理")}
        ${this.renderToolKpi("搜索 MCP", summary.mcpToolCalls?.totalSearchMcpCount ?? 0, "高级搜索")}
      </div>
      <div class="divider"></div>
      <div class="section-header">
        <div>
          <div class="section-title">工具排行</div>
          <div class="section-subtitle">按次数排序</div>
        </div>
        <span class="pill">${topTool ? this.escapeHtml(topTool.title) : "暂无明细"}</span>
      </div>
      <div class="ranking-list">
        ${toolRankingRows}
      </div>
    </div>
  </div>

  ${
    summary.credentialSource
      ? `<div class="credential-source">凭证来源：${sourceLabels[summary.credentialSource] || summary.credentialSource}</div>`
      : ""
  }

  <div class="footer">
    ${this.getRefreshInfoHtml(summary)}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function refresh() {
      vscode.postMessage({ type: 'refresh' });
    }

    function changeRange(range) {
      vscode.postMessage({ type: 'changeRange', range: range });
    }
  </script>
</body>
</html>`;
  }

  private renderQuotaCard(
    label: string,
    percentage: number,
    used: number,
    remaining: number,
    resetTime: string,
  ): string {
    return `
      <div class="quota-card">
        <div class="quota-top">
          <div class="quota-name">${label}</div>
          <div class="quota-value">${percentage}%</div>
        </div>
        <div class="progress">
          <div class="progress-fill" style="width: ${percentage}%; background: ${this.getProgressColor(percentage)}"></div>
        </div>
        <div class="quota-meta">
          <span>已用 ${used.toLocaleString("zh-CN")}</span>
          <span>剩余 ${remaining.toLocaleString("zh-CN")}</span>
        </div>
        <div class="quota-meta">
          <span>重置</span>
          <span>${resetTime}</span>
        </div>
      </div>`;
  }

  private renderToolKpi(label: string, value: number, note: string): string {
    return `
      <div class="tool-item">
        <div class="tool-label">${label}</div>
        <div class="tool-value">${value.toLocaleString("zh-CN")}</div>
        <div class="tool-note">${note}</div>
      </div>`;
  }

  private renderBreakdownRow(item: {
    rank: number;
    title: string;
    value: string;
    detail: string;
    percent: number;
  }): string {
    return `
      <div class="ranking-row">
        <div class="rank-badge">${item.rank}</div>
        <div>
          <div class="ranking-title">${this.escapeHtml(item.title)}</div>
          <div class="ranking-detail">${this.escapeHtml(item.detail)}</div>
          <div class="mini-bar">
            <div class="mini-bar-fill" style="width: ${Math.max(4, item.percent)}%"></div>
          </div>
        </div>
        <div class="ranking-value">
          <div class="ranking-number">${item.value}</div>
          <div class="ranking-percent">${item.percent}%</div>
        </div>
      </div>`;
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 0;
      padding: 18px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .skeleton {
      height: 76px;
      border-radius: 12px;
      margin-bottom: 10px;
      background: var(--vscode-textBlockQuote-background);
      animation: pulse 1.4s ease-in-out infinite;
    }
    .skeleton.small {
      height: 42px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .loading-text {
      margin-top: 14px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
  </style>
</head>
<body>
  <div class="skeleton small"></div>
  <div class="skeleton"></div>
  <div class="skeleton"></div>
  <div class="grid">
    <div class="skeleton"></div>
    <div class="skeleton"></div>
  </div>
  <div class="loading-text">正在加载 GLM 使用量数据...</div>
</body>
</html>`;
  }

  private getRefreshInfoHtml(summary: QuotaSummary): string {
    const parts: string[] = [];

    if (this.isOffline) {
      parts.push("⚡ 离线模式 - 显示缓存数据");
    }

    if (summary.lastRefreshTime) {
      const lastRefresh = new Date(summary.lastRefreshTime);
      const minutesAgo = Math.floor((Date.now() - lastRefresh.getTime()) / 60000);
      if (minutesAgo < 1) {
        parts.push("刚刚更新");
      } else if (minutesAgo < 60) {
        parts.push(`${minutesAgo} 分钟前更新`);
      } else {
        parts.push(`更新于 ${lastRefresh.toLocaleString("zh-CN", { hour12: false })}`);
      }
    }

    if (summary.nextRefreshTime) {
      const nextRefresh = new Date(summary.nextRefreshTime);
      const minutesUntil = Math.floor((nextRefresh.getTime() - Date.now()) / 60000);
      if (minutesUntil > 0) {
        parts.push(`${minutesUntil} 分钟后自动刷新`);
      }
    }

    if (parts.length === 0) {
      return `更新于 ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
    }

    return parts.join(" · ");
  }

  private getProgressColor(percentage: number): string {
    if (percentage >= 95) return "#d05d5d";
    if (percentage >= 80) return "#d9a441";
    return "#10b981";
  }

  private getHealthLabel(percentage: number): string {
    if (percentage >= 95) return "高风险";
    if (percentage >= 80) return "需关注";
    if (percentage >= 50) return "正常偏高";
    return "状态正常";
  }

  private getPercent(value: number, total?: number): number {
    if (!total || total <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((value / total) * 100));
  }

  private formatPercent(value: number, total?: number): string {
    return `${this.getPercent(value, total)}%`;
  }

  private formatTokenCount(value: number): string {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(1)}B`;
    }
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toString();
  }

  private escapeHtml(value: string): string {
    return value
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
