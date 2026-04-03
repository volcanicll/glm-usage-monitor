import * as vscode from 'vscode';
import { AuthService } from './services/AuthService';
import { GLMUsageService } from './services/GLMUsageService';
import { QuotaSummary, UsageRange } from './types/api';
import { getUsageRangeLabel } from './util/timeWindow';

let refreshTimer: NodeJS.Timeout | undefined;
let authService: AuthService;
let glmUsageService: GLMUsageService | undefined;
let statusBarItem: vscode.StatusBarItem;
let webviewPanel: vscode.WebviewPanel | undefined;
let summaryCache: Map<UsageRange, QuotaSummary> = new Map();
let currentRange: UsageRange = 'today';

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("glmUsage");
  authService = new AuthService(context.secrets, config);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.tooltip = "GLM Usage Monitor - 点击查看详情";
  statusBarItem.command = 'glmUsage.showUsage';
  statusBarItem.show();

  // Check if credentials exist
  const credentials = await authService.getCredentials();
  if (!credentials) {
    statusBarItem.text = "$(circle-large-outline) GLM";
    const action = await vscode.window.showWarningMessage(
      "GLM Usage 未读取到可用凭证。插件会先尝试读取 VS Code 进程环境变量，再尝试登录 shell 环境变量，最后才使用手动配置。",
      "手动配置",
    );
    if (action === "手动配置") {
      await showConfigurationDialog();
    }
  } else {
    scheduleRefresh(config);
  }

  // Show usage command
  const showUsageCommand = vscode.commands.registerCommand(
    "glmUsage.showUsage",
    async () => {
      await showUsagePanel();
    },
  );

  // Refresh command
  const refreshCommand = vscode.commands.registerCommand(
    "glmUsage.refresh",
    async () => {
      await refreshUsage(true);
    },
  );

  // Configure command
  const configureCommand = vscode.commands.registerCommand(
    "glmUsage.configure",
    async () => {
      await showConfigurationDialog();
    },
  );

  // Clear credentials command
  const clearCredentialsCommand = vscode.commands.registerCommand(
    "glmUsage.clearCredentials",
    async () => {
      await authService.clearCredentials();
      vscode.window.showInformationMessage(
        "Stored credentials cleared. Extension will use environment variables if available.",
      );
    },
  );

  // Register all disposables
  context.subscriptions.push(
    showUsageCommand,
    refreshCommand,
    configureCommand,
    clearCredentialsCommand,
  );

  // Configuration change listener
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    async (e) => {
      if (e.affectsConfiguration("glmUsage")) {
        const newConfig = vscode.workspace.getConfiguration("glmUsage");
        const hasCredentials = await authService.hasCredentials();
        if (hasCredentials) {
          scheduleRefresh(newConfig);
        }
      }
    },
  );
  context.subscriptions.push(configChangeListener);
}

async function fetchAndParseUsage(range: UsageRange): Promise<QuotaSummary> {
  const creds = await authService.getCredentials();
  if (!creds) {
    throw new Error('No credentials configured');
  }

  if (!glmUsageService) {
    glmUsageService = new GLMUsageService(creds);
  }

  const data = await glmUsageService.fetchUsageByRange(range);
  return glmUsageService.parseCompleteUsageData(data.quotaLimits, data.modelUsage, data.toolUsage);
}

async function showUsagePanel(): Promise<void> {
  // If panel already exists, reveal it
  if (webviewPanel) {
    webviewPanel.reveal();
    return;
  }

  // Fetch current data
  try {
    const summary = await fetchAndParseUsage(currentRange);
    summaryCache.set(currentRange, summary);
  } catch (error) {
    vscode.window.showErrorMessage(`获取数据失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Create webview panel
  webviewPanel = vscode.window.createWebviewPanel(
    'glmUsagePanel',
    'GLM Usage',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    }
  );

  webviewPanel.onDidDispose(() => {
    webviewPanel = undefined;
  });

  webviewPanel.webview.onDidReceiveMessage(async (message) => {
    switch (message.type) {
      case 'changeRange':
        currentRange = message.range as UsageRange;
        await refreshPanel();
        break;
      case 'refresh':
        await refreshPanel();
        break;
      case 'ready':
        updatePanelContent();
        break;
    }
  });

  updatePanelContent();
}

function updatePanelContent(): void {
  if (!webviewPanel) {
    return;
  }

  const summary = summaryCache.get(currentRange);
  if (!summary) {
    webviewPanel.webview.html = getLoadingHtml();
    return;
  }

  webviewPanel.webview.html = getPanelHtml(summary);
}

async function refreshPanel(): Promise<void> {
  if (!webviewPanel) {
    return;
  }

  webviewPanel.webview.html = getLoadingHtml();

  try {
    const summary = await fetchAndParseUsage(currentRange);
    summaryCache.set(currentRange, summary);
    updatePanelContent();

    // Update status bar
    const tokenPercent = summary.tokenUsage.percentage;
    const mcpPercent = summary.mcpUsage.percentage;
    statusBarItem.text = `$(pulse) ${tokenPercent}% | $(tools) ${mcpPercent}%`;
  } catch (error) {
    webviewPanel.webview.html = getErrorHtml(error instanceof Error ? error.message : 'Unknown error');
  }
}

function getPanelHtml(summary: QuotaSummary): string {
  const ranges: UsageRange[] = ['today', 'last7Days', 'last30Days'];

  const tokenPercent = summary.tokenUsage.percentage;
  const tokenUsed = summary.tokenUsage.used;
  const tokenTotal = summary.tokenUsage.total;
  const tokenRemaining = Math.max(0, tokenTotal - tokenUsed);

  const mcpPercent = summary.mcpUsage.percentage;
  const mcpUsed = summary.mcpUsage.used;
  const mcpTotal = summary.mcpUsage.total;
  const mcpRemaining = Math.max(0, mcpTotal - mcpUsed);

  const consumedTokens = summary.consumedTokens !== undefined
    ? `<div class="info-row"><span class="info-label">消耗Token</span><span class="info-value">${formatTokenCount(summary.consumedTokens)}</span></div>`
    : '';

  const toolCalls = summary.mcpToolCalls ? `
    <div class="tool-section">
      <div class="section-title">工具调用</div>
      <div class="tool-grid">
        <div class="tool-item">
          <span class="tool-label">网络搜索</span>
          <span class="tool-count">${summary.mcpToolCalls.totalNetworkSearchCount}</span>
        </div>
        <div class="tool-item">
          <span class="tool-label">网页阅读</span>
          <span class="tool-count">${summary.mcpToolCalls.totalWebReadMcpCount}</span>
        </div>
        <div class="tool-item">
          <span class="tool-label">Z阅读</span>
          <span class="tool-count">${summary.mcpToolCalls.totalZreadMcpCount}</span>
        </div>
      </div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GLM Usage</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      font-size: 13px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .title { font-size: 16px; font-weight: 600; }
    .refresh-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .refresh-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .tabs { display: flex; gap: 4px; margin-bottom: 16px; background: var(--vscode-editor-selectionBackground); border-radius: 6px; padding: 4px; }
    .tab {
      flex: 1;
      text-align: center;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .tab:hover { background: var(--vscode-toolbar-hoverBackground); }
    .tab.active { background: var(--vscode-textBlockQuote-background); color: var(--vscode-foreground); font-weight: 500; }
    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .card-title { font-size: 13px; font-weight: 600; }
    .card-percent { font-size: 18px; font-weight: 700; }
    .progress-bar { height: 6px; background: var(--vscode-progressBar-background); border-radius: 3px; overflow: hidden; margin: 8px 0; }
    .progress-fill { height: 100%; background: var(--vscode-progressBar-foreground); transition: width 0.3s ease; }
    .progress-fill.warning { background: #d9a441; }
    .progress-fill.danger { background: #d05d5d; }
    .info-row { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; }
    .info-label { color: var(--vscode-descriptionForeground); }
    .info-value { font-weight: 500; }
    .divider { height: 1px; background: var(--vscode-panel-border); margin: 8px 0; }
    .tool-section { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border); }
    .section-title { font-size: 12px; font-weight: 500; margin-bottom: 8px; }
    .tool-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .tool-item { display: flex; flex-direction: column; align-items: center; padding: 8px; background: var(--vscode-editor-selectionBackground); border-radius: 6px; }
    .tool-label { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 2px; }
    .tool-count { font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">📊 GLM 使用量</div>
    <button class="refresh-btn" onclick="refresh()">🔄 刷新</button>
  </div>

  <div class="tabs">
    ${ranges.map(range => {
      const label = getUsageRangeLabel(range);
      const active = range === currentRange ? 'active' : '';
      return `<div class="tab ${active}" onclick="changeRange('${range}')">${label}</div>`;
    }).join('')}
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title">Token 配额</div>
      <div class="card-percent">${tokenPercent}%</div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill ${getProgressClass(tokenPercent)}" style="width: ${tokenPercent}%"></div>
    </div>
    <div class="info-row"><span class="info-label">已用</span><span class="info-value">${formatNumber(tokenUsed)}</span></div>
    <div class="info-row"><span class="info-label">总量</span><span class="info-value">${formatNumber(tokenTotal)}</span></div>
    <div class="info-row"><span class="info-label">剩余</span><span class="info-value">${formatNumber(tokenRemaining)}</span></div>
    ${consumedTokens}
    <div class="divider"></div>
    <div class="info-row"><span class="info-label">重置时间</span><span class="info-value">${formatTimeHourMinute(summary.monthlyResetAt)}</span></div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title">MCP 配额</div>
      <div class="card-percent">${mcpPercent}%</div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill ${getProgressClass(mcpPercent)}" style="width: ${mcpPercent}%"></div>
    </div>
    <div class="info-row"><span class="info-label">已用</span><span class="info-value">${formatNumber(mcpUsed)}</span></div>
    <div class="info-row"><span class="info-label">总量</span><span class="info-value">${formatNumber(mcpTotal)}</span></div>
    <div class="info-row"><span class="info-label">剩余</span><span class="info-value">${formatNumber(mcpRemaining)}</span></div>
    <div class="divider"></div>
    <div class="info-row"><span class="info-label">重置时间</span><span class="info-value">${formatTimeYearMonthDayHourMinute(summary.monthlyResetAt)}</span></div>
    ${toolCalls}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function changeRange(range) {
      vscode.postMessage({ type: 'changeRange', range: range });
    }

    function refresh() {
      vscode.postMessage({ type: 'refresh' });
    }

    setTimeout(() => { vscode.postMessage({ type: 'ready' }); }, 100);
  </script>
</body>
</html>`;
}

function getLoadingHtml(): string {
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
  </style>
</head>
<body><div>正在加载数据...</div></body>
</html>`;
}

function getErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
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
<body><div>加载失败: ${message}</div></body>
</html>`;
}

function getProgressClass(percentage: number): string {
  if (percentage >= 80) return 'danger';
  if (percentage >= 60) return 'warning';
  return '';
}

async function refreshUsage(showNotification = false): Promise<void> {
  try {
    statusBarItem.text = "$(sync~spin) Loading...";
    statusBarItem.tooltip = "Fetching GLM usage data...";

    const creds = await authService.getCredentials();
    if (!creds) {
      throw new Error('No credentials configured');
    }

    const service = new GLMUsageService(creds);
    glmUsageService = service;
    const data = await service.fetchAllUsage();
    const summary = service.parseCompleteUsageData(data.quotaLimits, data.modelUsage, data.toolUsage);

    summaryCache.set(currentRange, summary);

    const tokenPercent = summary.tokenUsage.percentage;
    const mcpPercent = summary.mcpUsage.percentage;
    statusBarItem.text = `$(pulse) ${tokenPercent}% | $(tools) ${mcpPercent}%`;
    statusBarItem.tooltip = "GLM Usage Monitor - 点击查看详情";

    // Update panel if open
    if (webviewPanel) {
      updatePanelContent();
    }

    if (showNotification) {
      vscode.window.showInformationMessage(
        `GLM Usage: Token ${tokenPercent}% | MCP ${mcpPercent}%`,
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    statusBarItem.text = "$(error) GLM Error";
    statusBarItem.tooltip = `Error: ${errorMessage}`;
    vscode.window.showErrorMessage(`GLM Usage Error: ${errorMessage}`);
  }
}

function scheduleRefresh(config: vscode.WorkspaceConfiguration): void {
  const interval = config.get<number>('refreshInterval', 600000);
  const autoRefresh = config.get<boolean>('autoRefresh', true);

  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  if (autoRefresh) {
    refreshTimer = setInterval(() => {
      refreshUsage(false);
    }, interval);
  }

  // Initial refresh
  refreshUsage(false);
}

export function deactivate() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  webviewPanel?.dispose();
  statusBarItem?.dispose();
}

async function showConfigurationDialog(): Promise<void> {
  const authToken = await vscode.window.showInputBox({
    prompt: 'Enter your GLM API Auth Token',
    password: true,
    ignoreFocusOut: true,
  });

  if (!authToken) {
    return;
  }

  const baseUrl = await vscode.window.showInputBox({
    prompt: 'Enter your GLM API Base URL',
    value: 'https://api.z.ai/api/anthropic',
    ignoreFocusOut: true,
  });

  if (!baseUrl) {
    return;
  }

  await authService.storeCredentials(authToken, baseUrl);
  vscode.window.showInformationMessage('Credentials saved successfully.');

  const config = vscode.workspace.getConfiguration('glmUsage');
  scheduleRefresh(config);
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000_000) {
    const billions = value / 1_000_000_000;
    return `${billions.toFixed(billions >= 10 ? 0 : 1)}B`;
  }
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions.toFixed(millions >= 10 ? 0 : 1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${thousands.toFixed(thousands >= 10 ? 0 : 1)}K`;
  }
  return value.toString();
}

function formatTimeHourMinute(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeYearMonthDayHourMinute(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
