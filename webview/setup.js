// Get VS Code API
const vscode = acquireVsCodeApi();

// Handle setup form submission
document.getElementById('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const authToken = document.getElementById('auth-token').value;
    const baseUrl = document.getElementById('base-url').value;
    vscode.postMessage({ command: 'saveCredentials', authToken, baseUrl });
});
