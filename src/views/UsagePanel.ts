import * as vscode from "vscode";
import { QuotaSummary, UsageRange, ChartDataPoint } from "../types/api";
import { getUsageRangeLabel } from "../util/timeWindow";

/**
 * Manages the GLM Usage webview panel with charts and dashboard
 */
export class UsagePanel {
  private panel: vscode.WebviewPanel | undefined;
  private currentSummary: QuotaSummary | null = null;
  private currentRange: UsageRange = "today";
  private trendData: ChartDataPoint[] = [];

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Show or reveal the usage panel
   */
  async show(
    summary: QuotaSummary,
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

  /**
   * Update panel with new data
   */
  async update(
    summary: QuotaSummary,
    range: UsageRange = "today",
  ): Promise<void> {
    this.currentSummary = summary;
    this.currentRange = range;

    if (!this.panel) {
      return;
    }

    await this.updateContent();
  }

  /**
   * Set trend data for chart
   */
  setTrendData(data: ChartDataPoint[]): void {
    this.trendData = data;
  }

  /**
   * Update webview content
   */
  private async updateContent(): Promise<void> {
    if (!this.panel) {
      return;
    }
    this.panel.webview.html = this.getHtml();
  }

  /**
   * Generate panel HTML
   */
  private getHtml(): string {
    if (!this.currentSummary) {
      return this.getLoadingHtml();
    }

    const summary = this.currentSummary;
    const { tokenUsage, mcpUsage, monthlyResetAt } = summary;

    const tokenPercent = Math.round(tokenUsage.percentage);
    const mcpPercent = Math.round(mcpUsage.percentage);
    const tokenRemaining = Math.max(0, tokenUsage.total - tokenUsage.used);
    const mcpRemaining = Math.max(0, mcpUsage.total - mcpUsage.used);

    // Token resets hourly (HH:mm format)
    const tokenResetTime = summary.tokenResetAt
      ? new Date(summary.tokenResetAt).toLocaleString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : new Date().toLocaleString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

    // MCP resets monthly (YYYY-MM-DD HH:mm format)
    const mcpResetTime = summary.mcpResetAt
      ? new Date(summary.mcpResetAt).toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "未知";

    const ranges: UsageRange[] = ["today", "last7Days", "last30Days"];

    // Tool calls data
    const toolCallsSection = summary.mcpToolCalls
      ? `
    <div class="card">
      <div class="card-header">
        <span class="card-title">🔧 工具调用</span>
      </div>
      <div class="tool-grid">
        <div class="tool-item">
          <div class="tool-icon">🔍</div>
          <div class="tool-label">网络搜索</div>
          <div class="tool-value">${summary.mcpToolCalls.totalNetworkSearchCount}</div>
        </div>
        <div class="tool-item">
          <div class="tool-icon">🌐</div>
          <div class="tool-label">网页阅读</div>
          <div class="tool-value">${summary.mcpToolCalls.totalWebReadMcpCount}</div>
        </div>
        <div class="tool-item">
          <div class="tool-icon">📖</div>
          <div class="tool-label">Z阅读</div>
          <div class="tool-value">${summary.mcpToolCalls.totalZreadMcpCount}</div>
        </div>
        <div class="tool-item">
          <div class="tool-icon">🔎</div>
          <div class="tool-label">搜索MCP</div>
          <div class="tool-value">${summary.mcpToolCalls.totalSearchMcpCount}</div>
        </div>
      </div>
    </div>`
      : "";

    // Consumed tokens display
    const consumedTokens =
      summary.consumedTokens !== undefined && summary.consumedTokens > 0
        ? `
    <div class="card">
      <div class="card-header">
        <span class="card-title">💬 Token 消耗</span>
        <span class="card-value">${this.formatTokenCount(summary.consumedTokens)}</span>
      </div>
    </div>`
        : "";

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GLM Usage Monitor</title>
  <style>
    :root {
      --green: #10b981;
      --yellow: #f59e0b;
      --red: #ef4444;
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --card-bg: var(--vscode-editor-inactiveSelectionBackground);
      --border: var(--vscode-panel-border, #e0e0e0);
      --muted: var(--vscode-descriptionForeground);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      color: var(--fg);
      background: var(--bg);
      padding: 16px;
      font-size: 13px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .title { font-size: 18px; font-weight: 600; }
    .refresh-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }
    .refresh-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
      background: var(--card-bg);
      border-radius: 6px;
      padding: 4px;
    }
    .tab {
      flex: 1;
      text-align: center;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      color: var(--muted);
      transition: all 0.2s;
    }
    .tab:hover { background: var(--vscode-toolbar-hoverBackground); }
    .tab.active {
      background: var(--vscode-textBlockQuote-background, #e8f4fd);
      color: var(--fg);
      font-weight: 500;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .card-title { font-size: 13px; font-weight: 600; }
    .card-value { font-size: 14px; font-weight: 600; }
    .gauge-section { margin-bottom: 12px; }
    .gauge-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    .gauge-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .gauge-circle {
      position: relative;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: conic-gradient(
        var(--color) calc(var(--percent) * 1%),
        var(--vscode-progressBar-background) 0%
      );
      flex-shrink: 0;
    }
    .gauge-inner {
      position: absolute;
      inset: 8px;
      border-radius: 50%;
      background: var(--card-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
    }
    .gauge-percent { font-size: 18px; font-weight: 700; }
    .gauge-unit { font-size: 10px; color: var(--muted); }
    .gauge-details { flex: 1; }
    .gauge-details .detail-row { font-size: 12px; padding: 2px 0; color: var(--muted); }
    .gauge-details .detail-value { font-weight: 500; color: var(--fg); }
    .progress-bar {
      height: 6px;
      background: var(--vscode-progressBar-background);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 4px;
    }
    .progress-fill {
      height: 100%;
      background: var(--progress-color);
      transition: width 0.3s ease;
    }
    .tool-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .tool-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10px;
      background: var(--vscode-editor-selectionBackground, #e0e0e0);
      border-radius: 6px;
      text-align: center;
    }
    .tool-icon { font-size: 20px; margin-bottom: 4px; }
    .tool-label { font-size: 11px; color: var(--muted); margin-bottom: 2px; }
    .tool-value { font-size: 14px; font-weight: 600; }
    .footer {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--muted);
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">📊 GLM 使用量监控</div>
    <button class="refresh-btn" onclick="refresh()">🔄 刷新</button>
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

  <div class="gauge-section">
    <div class="card">
      <div class="card-header">
        <span class="card-title">💬 Token 配额</span>
        <span class="card-value">${tokenPercent}%</span>
      </div>
      <div class="gauge-container">
        <div class="gauge-circle" style="--color: ${this.getProgressColor(tokenPercent)}; --percent: ${tokenPercent}; --progress-color: ${this.getProgressColor(tokenPercent)}">
          <div class="gauge-inner">
            <div class="gauge-percent">${tokenPercent}%</div>
            <div class="gauge-unit">已使用</div>
          </div>
        </div>
        <div class="gauge-details">
          <div class="detail-row">已用: <span class="detail-value">${tokenUsage.used.toLocaleString("zh-CN")}</span></div>
          <div class="detail-row">剩余: <span class="detail-value">${tokenRemaining.toLocaleString("zh-CN")}</span></div>
          <div class="detail-row">重置: <span class="detail-value">${tokenResetTime}</span></div>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${tokenPercent}%; background: ${this.getProgressColor(tokenPercent)}"></div>
      </div>
    </div>
  </div>

  <div class="gauge-section">
    <div class="card">
      <div class="card-header">
        <span class="card-title">🔗 MCP 配额</span>
        <span class="card-value">${mcpPercent}%</span>
      </div>
      <div class="gauge-container">
        <div class="gauge-circle" style="--color: ${this.getProgressColor(mcpPercent)}; --percent: ${mcpPercent}">
          <div class="gauge-inner">
            <div class="gauge-percent">${mcpPercent}%</div>
            <div class="gauge-unit">已使用</div>
          </div>
        </div>
        <div class="gauge-details">
          <div class="detail-row">已用: <span class="detail-value">${mcpUsage.used.toLocaleString("zh-CN")}</span></div>
          <div class="detail-row">剩余: <span class="detail-value">${mcpRemaining.toLocaleString("zh-CN")}</span></div>
          <div class="detail-row">重置: <span class="detail-value">${mcpResetTime}</span></div>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${mcpPercent}%; background: ${this.getProgressColor(mcpPercent)}"></div>
      </div>
    </div>
  </div>

  ${consumedTokens}
  ${toolCallsSection}

  <div class="footer">
    数据更新于: ${new Date().toLocaleString("zh-CN", { hour12: false })}
    · 点击查看详情
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

  /**
   * Get loading HTML
   */
  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
    }
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .spinner { font-size: 24px; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner">🔄</div>
    <div>正在加载使用量数据...</div>
  </div>
</body>
</html>`;
  }

  /**
   * Get progress color based on percentage
   */
  private getProgressColor(percentage: number): string {
    if (percentage >= 80) return "#d05d5d";
    if (percentage >= 60) return "#d9a441";
    return "#10b981";
  }

  /**
   * Format large token counts
   */
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

  /**
   * Dispose panel
   */
  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }
}
