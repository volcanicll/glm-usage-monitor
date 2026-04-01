import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('GLM Usage Monitor extension is now active!');

    // TODO: Temporary scaffolding command for testing (Task 11 will implement full commands: refresh, openMonitor, configure, clearCredentials)
    const disposable = vscode.commands.registerCommand('glmUsage.hello', () => {
        vscode.window.showInformationMessage('Hello from GLM Usage Monitor!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
