import * as vscode from 'vscode';
import { QuotaSummary, UsageRange } from '../types/api';
import { getUsageRangeLabel } from '../util/timeWindow';

type SummaryLoader = (range: UsageRange) => Promise<QuotaSummary>;

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private panel: vscode.WebviewPanel | undefined;
  private currentRange: UsageRange = 'today';
  private readonly ranges: UsageRange[] = ['today', 'last7Days', 'last30Days'];
  private summaryCache: Map<UsageRange, QuotaSummary> = new Map();

  constructor(private readonly loadSummary: SummaryLoader) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.tooltip = "GLM Usage Monitor - 点击查看详情";
    this.statusBarItem.command = 'glmUsage.togglePanel';
    this.statusBarItem.show();
  }

  /**
   * Update with summary for current range
   */
  async update(summary: QuotaSummary): Promise<void> {
    this.summaryCache.set(this.currentRange, summary);
    this.updateStatusBarText();
    if (this.panel) {
      this.updatePanelContent();
    }
  }

  /**
   * Update status bar text
   */
  private updateStatusBarText(): void {
    const summary = this.summaryCache.get(this.currentRange);
    if (!summary) {
      return;
    }

    const tokenPercent = summary.tokenUsage.percentage;
    const mcpPercent = summary.mcpUsage.percentage;

    this.statusBarItem.text = `$(pulse) ${tokenPercent}% | $(tools) ${mcpPercent}%`;
  }

  /**
   * Toggle panel visibility
   */
  async togglePanel(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    await this.showPanel();
  }

  /**
   * Show floating panel
   */
  async showPanel(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'glmUsagePanel',
      'GLM Usage',
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

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'changeRange') {
        await this.switchToRange(message.range as UsageRange);
      } else if (message.type === 'refresh') {
        await this.refreshCurrentRange();
      } else if (message.type === 'ready') {
        this.updatePanelContent();
      }
    });

    this.updatePanelContent();
  }

  /**
   * Update panel content
   */
  private updatePanelContent(): void {
    if (!this.panel) {
      return;
    }

    const summary = this.summaryCache.get(this.currentRange);
    if (!summary) {
      this.panel.webview.html = this.getLoadingHtml();
      return;
    }

    this.panel.webview.html = this.getPanelHtml(summary);
  }

  /**
   * Get panel HTML
   */
  private getPanelHtml(summary: QuotaSummary): string {
    const tokenPercent = summary.tokenUsage.percentage;
    const tokenUsed = summary.tokenUsage.used;
    const tokenTotal = summary.tokenUsage.total;
    const tokenRemaining = Math.max(0, tokenTotal - tokenUsed);

    const mcpPercent = summary.mcpUsage.percentage;
    const mcpUsed = summary.mcpUsage.used;
    const mcpTotal = summary.mcpUsage.total;
    const mcpRemaining = Math.max(0, mcpTotal - mcpUsed);

    const consumedTokens = summary.consumedTokens !== undefined
      ? `<div class="stat-row"><span class="stat-label">消耗Token</span><span class="stat-value">${this.formatNumber(summary.consumedTokens)} tokens</span></div>`
      : '';

    const toolCalls = summary.mcpToolCalls ? `
      <div class="tool-calls-section">
        <div class="tool-call-title">工具调用</div>
        <div class="tool-call-grid">
          <div class="tool-call-item">
            <span class="tool-call-label">网络搜索</span>
            <span class="tool-call-value">${summary.mcpToolCalls.totalNetworkSearchCount} 次</span>
          </div>
          <div class="tool-call-item">
            <span class="tool-call-label">网页阅读</span>
            <span class="tool-call-value">${summary.mcpToolCalls.totalWebReadMcpCount} 次</span>
          </div>
          <div class="tool-call-item">
            <span class="tool-call-label">Z阅读</span>
            <span class="tool-call-value">${summary.mcpToolCalls.totalZreadMcpCount} 次</span>
          </div>
        </div>
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>GLM Usage</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
              color: var(--vscode-foreground);
              background: var(--vscode-editor-background);
              line-height: 1.5;
              padding: 20px;
            }

            .container {
              max-width: 450px;
            }

            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 20px;
              padding-bottom: 16px;
              border-bottom: 1px solid var(--vscode-panel-border);
            }

            .title {
              font-size: 18px;
              font-weight: 600;
              color: var(--vscode-foreground);
            }

            .refresh-btn {
              background: var(--vscode-button-secondaryBackground);
              color: var(--vscode-button-secondaryForeground);
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 13px;
              display: flex;
              align-items: center;
              gap: 6px;
            }

            .refresh-btn:hover {
              background: var(--vscode-button-secondaryHoverBackground);
            }

            .range-tabs {
              display: flex;
              gap: 0;
              margin-bottom: 20px;
              background: var(--vscode-editor-selectionBackground);
              border-radius: 8px;
              padding: 4px;
            }

            .range-tab {
              flex: 1;
              text-align: center;
              padding: 10px 16px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 13px;
              transition: all 0.2s ease;
              color: var(--vscode-descriptionForeground);
            }

            .range-tab:hover {
              background: var(--vscode-toolbar-hoverBackground);
            }

            .range-tab.active {
              background: var(--vscode-textBlockQuote-background);
              color: var(--vscode-foreground);
              font-weight: 500;
            }

            .card {
              background: var(--vscode-editor-background);
              border: 1px solid var(--vscode-panel-border);
              border-radius: 12px;
              padding: 16px;
              margin-bottom: 16px;
            }

            .card-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 12px;
            }

            .card-title {
              font-size: 14px;
              font-weight: 600;
              color: var(--vscode-foreground);
            }

            .card-percentage {
              font-size: 20px;
              font-weight: 700;
            }

            .progress-container {
              margin: 12px 0;
            }

            .progress-bar {
              height: 8px;
              background: var(--vscode-progressBar-background);
              border-radius: 4px;
              overflow: hidden;
            }

            .progress-fill {
              height: 100%;
              background: var(--vscode-progressBar-foreground);
              border-radius: 4px;
              transition: width 0.3s ease;
            }

            .progress-fill.warning {
              background: #d9a441;
            }

            .progress-fill.danger {
              background: #d05d5d;
            }

            .stats-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }

            .stat-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 13px;
            }

            .stat-label {
              color: var(--vscode-descriptionForeground);
            }

            .stat-value {
              font-weight: 500;
              color: var(--vscode-foreground);
            }

            .divider {
              height: 1px;
              background: var(--vscode-panel-border);
              margin: 16px 0;
            }

            .info-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 12px;
              color: var(--vscode-descriptionForeground);
              padding: 8px 0;
            }

            .tool-calls-section {
              margin-top: 12px;
              padding-top: 12px;
              border-top: 1px solid var(--vscode-panel-border);
            }

            .tool-call-title {
              font-size: 13px;
              font-weight: 500;
              margin-bottom: 10px;
              color: var(--vscode-foreground);
            }

            .tool-call-grid {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 8px;
            }

            .tool-call-item {
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 10px;
              background: var(--vscode-editor-selectionBackground);
              border-radius: 8px;
            }

            .tool-call-label {
              font-size: 11px;
              color: var(--vscode-descriptionForeground);
              margin-bottom: 4px;
            }

            .tool-call-value {
              font-size: 14px;
              font-weight: 600;
              color: var(--vscode-foreground);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="title">📊 GLM 使用量监控</div>
              <button class="refresh-btn" onclick="refresh()">
                <span class="refresh-icon">↻</span>
                <span>刷新</span>
              </button>
            </div>

            <div class="range-tabs">
              ${this.ranges.map(range => {
                const label = getUsageRangeLabel(range);
                const active = range === this.currentRange ? 'active' : '';
                return `<div class="range-tab ${active}" onclick="changeRange('${range}')" data-range="${range}">${label}</div>`;
              }).join('')}
            </div>

            <div class="card">
              <div class="card-header">
                <div class="card-title">Token 配额</div>
                <div class="card-percentage">${tokenPercent}%</div>
              </div>
              <div class="progress-container">
                <div class="progress-bar">
                  <div class="progress-fill ${this.getProgressClass(tokenPercent)}" style="width: ${tokenPercent}%"></div>
                </div>
              </div>
              <div class="stats-grid">
                <div class="stat-row">
                  <span class="stat-label">已用</span>
                  <span class="stat-value">${this.formatNumber(tokenUsed)}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">总量</span>
                  <span class="stat-value">${this.formatNumber(tokenTotal)}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">剩余</span>
                  <span class="stat-value">${this.formatNumber(tokenRemaining)}</span>
                </div>
              </div>
              ${consumedTokens}
              <div class="divider"></div>
              <div class="info-row">
                <span>重置时间</span>
                <span>${this.formatTimeHourMinute(summary.monthlyResetAt)}</span>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <div class="card-title">MCP 配额</div>
                <div class="card-percentage">${mcpPercent}%</div>
              </div>
              <div class="progress-container">
                <div class="progress-bar">
                  <div class="progress-fill ${this.getProgressClass(mcpPercent)}" style="width: ${mcpPercent}%"></div>
                </div>
              </div>
              <div class="stats-grid">
                <div class="stat-row">
                  <span class="stat-label">已用</span>
                  <span class="stat-value">${this.formatNumber(mcpUsed)}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">总量</span>
                  <span class="stat-value">${this.formatNumber(mcpTotal)}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">剩余</span>
                  <span class="stat-value">${this.formatNumber(mcpRemaining)}</span>
                </div>
              </div>
              <div class="divider"></div>
              <div class="info-row">
                <span>重置时间</span>
                <span>${this.formatTimeYearMonthDayHourMinute(summary.monthlyResetAt)}</span>
              </div>
              ${toolCalls}
            </div>
          </div>

          <script>
            const vscode = acquireVsCodeApi();

            function changeRange(range) {
              vscode.postMessage({ type: 'changeRange', range: range });
            }

            function refresh() {
              vscode.postMessage({ type: 'refresh' });
            }

            setTimeout(() => {
              vscode.postMessage({ type: 'ready' });
            }, 100);
          </script>
        </body>
      </html>
    `;
  }

  private getLoadingHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
          </style>
        </head>
        <body>
          <div>正在加载数据...</div>
        </body>
      </html>
    `;
  }

  private getProgressClass(percentage: number): string {
    if (percentage >= 80) return 'danger';
    if (percentage >= 60) return 'warning';
    return '';
  }

  /**
   * Switch to specific range
   */
  async switchToRange(range: UsageRange): Promise<void> {
    this.currentRange = range;
    this.updateStatusBarText();

    // Check if we have cached data
    if (this.summaryCache.has(range)) {
      this.updatePanelContent();
      return;
    }

    // Show loading and fetch new data
    this.updatePanelLoading();
    try {
      const summary = await this.loadSummary(range);
      this.summaryCache.set(range, summary);
      this.updatePanelContent();
    } catch (error) {
      this.updatePanelError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Refresh current range data
   */
  async refreshCurrentRange(): Promise<void> {
    this.updatePanelLoading();
    try {
      const summary = await this.loadSummary(this.currentRange);
      this.summaryCache.set(this.currentRange, summary);
      this.updatePanelContent();
      this.updateStatusBarText();
    } catch (error) {
      this.updatePanelError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private updatePanelLoading(): void {
    if (!this.panel) return;
    this.panel.webview.html = this.getLoadingHtml();
  }

  private updatePanelError(message: string): void {
    if (!this.panel) return;
    this.panel.webview.html = `
      <!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: var(--vscode-font-family);
              color: var(--vscode-errorForeground);
              background: var(--vscode-editor-background);
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              padding: 20px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div>加载失败: ${message}</div>
        </body>
      </html>
    `;
  }

  showError(message: string): void {
    this.statusBarItem.text = "$(error) GLM Error";
    this.statusBarItem.tooltip = `GLM Usage Monitor Error:\n${message}`;
    this.statusBarItem.color = new vscode.ThemeColor("errorForeground");
  }

  showLoading(): void {
    this.statusBarItem.text = "$(sync~spin) Loading...";
    this.statusBarItem.tooltip = "Fetching GLM usage data...";
    this.statusBarItem.color = undefined;
  }

  dispose(): void {
    this.panel?.dispose();
    this.statusBarItem.dispose();
  }

  private formatNumber(value: number): string {
    return value.toLocaleString("zh-CN");
  }

  private formatTimeHourMinute(value: string): string {
    return new Date(value).toLocaleString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private formatTimeYearMonthDayHourMinute(value: string): string {
    return new Date(value).toLocaleString("zh-CN", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}
