import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('GLM Usage Monitor extension is now active!');

    const disposable = vscode.commands.registerCommand('glmUsage.hello', () => {
        vscode.window.showInformationMessage('Hello from GLM Usage Monitor!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
