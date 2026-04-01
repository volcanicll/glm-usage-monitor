import * as vscode from 'vscode';
import { QuotaSummary } from '../types/api';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'glmUsage.openMonitor';
        this.statusBarItem.show();
    }

    /**
     * Update status bar with current usage
     */
    update(summary: QuotaSummary): void {
        const tokenColor = this.getColorForPercentage(summary.tokenUsage.percentage);
        const mcpColor = this.getColorForPercentage(summary.mcpUsage.percentage);

        this.statusBarItem.text = `$(database) ${summary.tokenUsage.percentage}% | $(clock) ${summary.mcpUsage.percentage}%`;
        this.statusBarItem.tooltip = `Token Usage (5h): ${summary.tokenUsage.percentage}%\nMCP Usage (1mo): ${summary.mcpUsage.percentage}%\nClick to open GLM Usage Monitor`;

        // Set color based on highest usage
        const maxPercentage = Math.max(summary.tokenUsage.percentage, summary.mcpUsage.percentage);
        if (maxPercentage > 80) {
            this.statusBarItem.color = new vscode.ThemeColor('errorForeground');
        } else if (maxPercentage > 50) {
            this.statusBarItem.color = new vscode.ThemeColor('warningForeground');
        } else {
            this.statusBarItem.color = undefined;
        }
    }

    /**
     * Show error state
     */
    showError(message: string): void {
        this.statusBarItem.text = `$(error) GLM Usage Error`;
        this.statusBarItem.tooltip = message;
        this.statusBarItem.color = new vscode.ThemeColor('errorForeground');
    }

    /**
     * Show loading state
     */
    showLoading(): void {
        this.statusBarItem.text = `$(sync~spin) Loading...`;
        this.statusBarItem.tooltip = 'Fetching GLM usage data...';
    }

    /**
     * Get color based on percentage threshold
     */
    private getColorForPercentage(percentage: number): string {
        if (percentage > 80) return '#ef4444'; // red
        if (percentage > 50) return '#f59e0b'; // yellow
        return '#10b981'; // green
    }

    /**
     * Dispose of status bar item
     */
    dispose(): void {
        this.statusBarItem.dispose();
    }
}
