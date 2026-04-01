import * as vscode from 'vscode';
import { AuthService } from './services/AuthService';
import { GLMUsageService } from './services/GLMUsageService';
import { StatusBarManager } from './services/StatusBarManager';
import { WebViewProvider } from './views/WebViewProvider';
import { CombinedUsageData } from './types/api';

let refreshTimer: NodeJS.Timeout | undefined;
let statusBarManager: StatusBarManager;
let webViewProvider: WebViewProvider;
let authService: AuthService;

export async function activate(context: vscode.ExtensionContext) {
    console.log('GLM Usage Monitor extension is now active!');

    const config = vscode.workspace.getConfiguration('glmUsage');
    authService = new AuthService(context.secrets, config);

    statusBarManager = new StatusBarManager();

    // Create event emitter for data changes
    const onDidChangeData = new vscode.EventEmitter<CombinedUsageData | null>();

    // Register WebView provider
    webViewProvider = new WebViewProvider(
        context.extensionUri,
        onDidChangeData.event
    );

    vscode.window.registerWebviewViewProvider(
        WebViewProvider.viewType,
        webViewProvider
    );

    // Check if credentials exist, if not show setup screen
    const credentials = await authService.getCredentials();
    if (!credentials) {
        webViewProvider.setSetupMode(true);
    }

    // Refresh command
    const refreshCommand = vscode.commands.registerCommand('glmUsage.refresh', async () => {
        await refreshUsage(authService);
    });

    // Open monitor command
    const openMonitorCommand = vscode.commands.registerCommand('glmUsage.openMonitor', () => {
        vscode.commands.executeCommand('glmUsage.monitor.focus');
    });

    // Configure command
    const configureCommand = vscode.commands.registerCommand('glmUsage.configure', async () => {
        await showConfigurationDialog(authService);
    });

    // Clear credentials command
    const clearCredentialsCommand = vscode.commands.registerCommand('glmUsage.clearCredentials', async () => {
        await authService.clearCredentials();
        vscode.window.showInformationMessage('Credentials cleared. Please reload VS Code.');
    });

    // Store credentials command (used by setup screen)
    const storeCredentialsCommand = vscode.commands.registerCommand('glmUsage.storeCredentials', async (authToken: string, baseUrl: string) => {
        await authService.storeCredentials(authToken, baseUrl);
        vscode.window.showInformationMessage('Credentials saved successfully!');
        webViewProvider.setSetupMode(false);
        await refreshUsage(authService);
    });

    // Register all disposables
    context.subscriptions.push(
        refreshCommand,
        openMonitorCommand,
        configureCommand,
        clearCredentialsCommand,
        storeCredentialsCommand,
        statusBarManager,
        onDidChangeData
    );

    // Configuration change listener (Task 13)
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('glmUsage')) {
            const newConfig = vscode.workspace.getConfiguration('glmUsage');
            scheduleRefresh(authService, newConfig);
        }
    });
    context.subscriptions.push(configChangeListener);

    // Window focus handler (Task 14)
    const focusHandler = vscode.window.onDidChangeWindowState(state => {
        const config = vscode.workspace.getConfiguration('glmUsage');
        const autoRefresh = config.get<boolean>('autoRefresh', true);

        if (autoRefresh) {
            if (state.focused) {
                scheduleRefresh(authService, config);
            } else {
                if (refreshTimer) {
                    clearInterval(refreshTimer);
                    refreshTimer = undefined;
                }
            }
        }
    });
    context.subscriptions.push(focusHandler);

    // Initial refresh and setup auto-refresh
    scheduleRefresh(authService, config);
}

async function refreshUsage(authService: AuthService): Promise<void> {
    statusBarManager.showLoading();
    webViewProvider.sendLoading();

    try {
        const creds = await authService.getCredentials();
        if (!creds) {
            throw new Error('No credentials configured. Please run "GLM Usage: Configure" command.');
        }

        const service = new GLMUsageService(creds);
        const data = await service.fetchAllUsage();

        const combinedData: CombinedUsageData = {
            quotaLimits: data.quotaLimits,
            modelUsage: data.modelUsage,
            toolUsage: data.toolUsage,
            timestamp: new Date().toISOString()
        };

        const summary = service.parseQuotaSummary(data.quotaLimits);
        statusBarManager.update(summary);
        webViewProvider.sendData(combinedData);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        statusBarManager.showError(errorMessage);
        webViewProvider.sendError(errorMessage);
    }
}

function scheduleRefresh(authService: AuthService, config: vscode.WorkspaceConfiguration): void {
    const interval = config.get<number>('refreshInterval', 600000);
    const autoRefresh = config.get<boolean>('autoRefresh', true);

    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    if (autoRefresh) {
        refreshTimer = setInterval(() => {
            refreshUsage(authService);
        }, interval);
    }

    // Initial refresh
    refreshUsage(authService);
}

async function showConfigurationDialog(authService: AuthService): Promise<void> {
    const authToken = await vscode.window.showInputBox({
        prompt: 'Enter your GLM API Auth Token',
        password: true,
        ignoreFocusOut: true
    });

    if (!authToken) {
        return;
    }

    const baseUrl = await vscode.window.showInputBox({
        prompt: 'Enter your GLM API Base URL',
        value: 'https://api.z.ai/api/anthropic',
        ignoreFocusOut: true
    });

    if (!baseUrl) {
        return;
    }

    await authService.storeCredentials(authToken, baseUrl);
    vscode.window.showInformationMessage('Credentials saved successfully!');
}

export function deactivate() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
}
