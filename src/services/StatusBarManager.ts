import * as vscode from "vscode";
import { QuotaSummary, UsageRange } from "../types/api";
import { getUsageRangeLabel } from "../util/timeWindow";

/**
 * Status bar display mode
 */
export type StatusBarMode = "compact" | "detailed" | "minimal";

/**
 * Manages VS Code status bar display for GLM usage information
 */
export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private currentSummary: QuotaSummary | null = null;
  private currentRange: UsageRange = "today";
  private mode: StatusBarMode = "detailed";
  private isLoading = false;
  private error: string | null = null;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.tooltip = "GLM Usage Monitor - 点击查看详情";
    this.statusBarItem.command = "glmUsage.showUsage";
    this.statusBarItem.show();
  }

  /**
   * Update status bar with usage summary
   */
  update(summary: QuotaSummary, range: UsageRange = "today"): void {
    this.currentSummary = summary;
    this.currentRange = range;
    this.error = null;
    this.isLoading = false;
    this.render();
  }

  /**
   * Show loading state
   */
  showLoading(): void {
    this.isLoading = true;
    this.render();
  }

  /**
   * Hide loading state
   */
  hideLoading(): void {
    this.isLoading = false;
    this.render();
  }

  /**
   * Show error state
   */
  showError(message: string): void {
    this.error = message;
    this.isLoading = false;
    this.render();
  }

  /**
   * Set display mode
   */
  setMode(mode: StatusBarMode): void {
    this.mode = mode;
    this.render();
  }

  /**
   * Get current mode
   */
  getMode(): StatusBarMode {
    return this.mode;
  }

  /**
   * Clear status bar
   */
  clear(): void {
    this.currentSummary = null;
    this.error = null;
    this.isLoading = false;
    this.statusBarItem.text = "$(circle-large-outline) GLM";
    this.statusBarItem.tooltip = "GLM Usage Monitor - 未配置凭证";
    this.statusBarItem.color = undefined;
  }

  /**
   * Get the dominant usage percentage for color calculation
   */
  private getDominantPercentage(): number {
    if (!this.currentSummary) return 0;
    return Math.max(
      this.currentSummary.tokenUsage.percentage,
      this.currentSummary.mcpUsage.percentage,
    );
  }

  /**
   * Get status bar color based on usage percentage
   */
  private getColor(): vscode.ThemeColor | undefined {
    const percentage = this.getDominantPercentage();
    if (percentage >= 95) {
      return new vscode.ThemeColor("errorForeground");
    }
    if (percentage >= 80) {
      return new vscode.ThemeColor("warningForeground");
    }
    if (percentage >= 50) {
      return new vscode.ThemeColor("charts.yellow");
    }
    return undefined;
  }

  /**
   * Get icon based on state
   */
  private getIcon(): string {
    if (this.error) return "$(error)";
    if (this.isLoading) return "$(sync~spin)";
    return "$(pulse)";
  }

  /**
   * Get text content based on mode
   */
  private getText(): string {
    const icon = this.getIcon();

    if (this.error) {
      return `${icon} GLM 错误`;
    }

    if (this.isLoading) {
      return `${icon} 加载中...`;
    }

    if (!this.currentSummary) {
      return `${icon} GLM`;
    }

    const tokenPercent = Math.round(this.currentSummary.tokenUsage.percentage);
    const mcpPercent = Math.round(this.currentSummary.mcpUsage.percentage);
    const rangeLabel = getUsageRangeLabel(this.currentRange);

    switch (this.mode) {
      case "minimal":
        return `${icon} ${tokenPercent}%`;

      case "compact":
        return `${icon} Token ${tokenPercent}%`;

      case "detailed":
      default:
        return `${icon} Token ${tokenPercent}% | MCP ${mcpPercent}% `;
    }
  }

  /**
   * Get tooltip content
   */
  private getTooltip(): string {
    if (this.error) {
      return `GLM Usage Monitor\n错误: ${this.error}\n点击查看详情`;
    }

    if (this.isLoading) {
      return "GLM Usage Monitor\n正在加载使用量数据...";
    }

    if (!this.currentSummary) {
      return "GLM Usage Monitor - 未配置凭证\n点击进行配置";
    }

    const { tokenUsage, mcpUsage, tokenResetAt, mcpResetAt } =
      this.currentSummary;
    const tokenRemaining = Math.max(0, tokenUsage.total - tokenUsage.used);
    const mcpRemaining = Math.max(0, mcpUsage.total - mcpUsage.used);

    // Token resets hourly (HH:mm format)
    const tokenResetTime = tokenResetAt
      ? new Date(tokenResetAt).toLocaleString("zh-CN", {
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
    const mcpResetTime = mcpResetAt
      ? new Date(mcpResetAt).toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "未知";

    return [
      "",
      "🔹 Token 配额",
      `   已用: ${tokenUsage.percentage.toFixed(1)}%`,
      `   重置: ${tokenResetTime}`,
      "",
      " MCP 配额",
      `   已用: ${mcpUsage.percentage.toFixed(1)}%`,
      `   重置: ${mcpResetTime}`,
      "",
      this.getDominantPercentage() >= 80
        ? "⚠️ 用量接近限制，请注意控制使用"
        : "✅ 用量正常",
      "",
      "点击查看详情",
    ].join("\n");
  }

  /**
   * Render status bar
   */
  private render(): void {
    this.statusBarItem.text = this.getText();
    this.statusBarItem.tooltip = this.getTooltip();
    this.statusBarItem.color = this.getColor();
  }

  /**
   * Dispose status bar
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
