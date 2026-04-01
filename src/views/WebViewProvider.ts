import * as vscode from 'vscode';
import { CombinedUsageData, QuotaSummary } from '../types/api';

export class WebViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'glmUsage.monitor';

    private _view?: vscode.WebviewView;
    private setupMode = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly onDidChange: vscode.Event<CombinedUsageData | null>
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        // Trigger refresh - will be handled by extension
                        vscode.commands.executeCommand('glmUsage.refresh');
                        break;
                    case 'saveCredentials':
                        // Handle saving credentials from setup screen
                        vscode.commands.executeCommand('glmUsage.storeCredentials', message.authToken, message.baseUrl);
                        break;
                    }
                },
            undefined,
            undefined
        );

        // Subscribe to data changes
        this.onDidChange(data => {
            if (this._view) {
                this._view.webview.postMessage({ type: 'updateData', data });
            }
        });
    }

    /**
     * Send updated data to webview
     */
    public sendData(data: CombinedUsageData): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'updateData', data });
        }
    }

    /**
     * Send error to webview
     */
    public sendError(error: string): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'error', error });
        }
    }

    /**
     * Send loading state to webview
     */
    public sendLoading(): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'loading' });
        }
    }

    /**
     * Set setup mode to show welcome screen
     */
    public setSetupMode(enabled: boolean): void {
        this.setupMode = enabled;
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        if (this.setupMode) {
            return this._getSetupHtml(webview);
        }
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
    <title>GLM Usage Monitor</title>
    <link rel="stylesheet" href="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'styles.css'))}">
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>GLM Usage Monitor</h1>
            <button id="refresh-btn" class="icon-button" title="Refresh">🔄</button>
        </div>

        <div class="summary-cards">
            <div class="card">
                <h2>Token Usage (5 Hour)</h2>
                <div class="gauge-container">
                    <canvas id="token-gauge"></canvas>
                    <div class="gauge-label">
                        <span id="token-percentage">--</span>%
                    </div>
                </div>
            </div>

            <div class="card">
                <h2>MCP Usage (1 Month)</h2>
                <div class="gauge-container">
                    <canvas id="mcp-gauge"></canvas>
                    <div class="gauge-label">
                        <span id="mcp-percentage">--</span>%
                    </div>
                </div>
            </div>
        </div>

        <div class="chart-section">
            <h2>📈 Model Usage Trend (Last 24h)</h2>
            <canvas id="trend-chart"></canvas>
        </div>

        <div class="table-section">
            <h2>📊 Today's Breakdown</h2>
            <table id="breakdown-table">
                <thead>
                    <tr>
                        <th>Model</th>
                        <th>Requests</th>
                        <th>Tokens</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td colspan="3">Loading...</td></tr>
                </tbody>
            </table>
        </div>

        <div class="settings-section">
            <details>
                <summary>⚙️ Settings</summary>
                <div class="settings-content">
                    <p>Refresh Interval: <span id="refresh-interval">10</span> minutes</p>
                    <p>Status: <span id="connection-status">Connected</span></p>
                </div>
            </details>
        </div>
    </div>

    <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'))}"></script>
    <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js'))}"></script>
    <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'messages.js'))}"></script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private _getSetupHtml(webview: vscode.Webview): string {
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
    <title>GLM Usage Monitor - Setup</title>
    <link rel="stylesheet" href="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'styles.css'))}">
</head>
<body>
    <div class="setup-container">
        <h1>Welcome to GLM Usage Monitor!</h1>
        <p>To get started, please enter your GLM API credentials.</p>

        <form id="setup-form" class="setup-form">
            <div class="form-group">
                <label for="auth-token">Auth Token</label>
                <input
                    type="password"
                    id="auth-token"
                    name="auth-token"
                    placeholder="Enter your GLM API auth token"
                    required
                >
            </div>

            <div class="form-group">
                <label for="base-url">Base URL</label>
                <input
                    type="url"
                    id="base-url"
                    name="base-url"
                    value="https://api.z.ai/api/anthropic"
                    placeholder="Enter your GLM API base URL"
                    required
                >
            </div>

            <button type="submit" class="primary-button">Get Started</button>
        </form>

        <div class="setup-hint">
            <strong>Where to find your credentials:</strong>
            <code>1. Visit your GLM platform dashboard
2. Navigate to API settings
3. Copy your auth token
4. Use the base URL provided by your platform</code>
        </div>
    </div>

    <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'setup.js'))}"></script>
</body>
</html>`;
    }
}
