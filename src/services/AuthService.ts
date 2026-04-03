import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ApiConfig } from '../types/api';

const execFileAsync = promisify(execFile);

export class AuthService {
    private shellCredentialLookup: Promise<ApiConfig | null> | undefined;

    constructor(
        private secretStorage: vscode.SecretStorage,
        private config: vscode.WorkspaceConfiguration,
        private shellEnvLoader: (() => Promise<ApiConfig | null>) | undefined = undefined,
    ) {}

    /**
     * Get credentials with priority:
     * 1. Current VS Code extension process env
     * 2. Login shell env
     * 3. Stored secret/config values
     */
    async getCredentials(): Promise<ApiConfig | null> {
        const envToken = process.env.ANTHROPIC_AUTH_TOKEN;
        const envBaseUrl = process.env.ANTHROPIC_BASE_URL;

        if (envToken && envBaseUrl) {
            return { authToken: envToken, baseUrl: envBaseUrl };
        }

        const shellCredentials = await this.getShellCredentials();
        if (shellCredentials) {
            return shellCredentials;
        }

        const storedToken = await this.secretStorage.get('authToken');
        const storedBaseUrl = this.config.get<string>('baseUrl');

        if (storedToken && storedBaseUrl) {
            return { authToken: storedToken, baseUrl: storedBaseUrl };
        }

        return null;
    }

    /**
     * Store credentials securely
     */
    async storeCredentials(authToken: string, baseUrl: string): Promise<void> {
        await this.secretStorage.store('authToken', authToken);
        await this.config.update('baseUrl', baseUrl, vscode.ConfigurationTarget.Global);
    }

    /**
     * Clear stored credentials
     */
    async clearCredentials(): Promise<void> {
        await this.secretStorage.delete('authToken');
        await this.config.update('baseUrl', undefined, vscode.ConfigurationTarget.Global);
    }

    /**
     * Check if credentials exist
     */
    async hasCredentials(): Promise<boolean> {
        const creds = await this.getCredentials();
        return creds !== null;
    }

    private async getShellCredentials(): Promise<ApiConfig | null> {
        if (!this.shellCredentialLookup) {
            this.shellCredentialLookup = this.shellEnvLoader
                ? this.shellEnvLoader()
                : this.loadCredentialsFromLoginShell();
        }

        return this.shellCredentialLookup;
    }

    private async loadCredentialsFromLoginShell(): Promise<ApiConfig | null> {
        try {
            const shell = process.env.SHELL || '/bin/zsh';
            const args = this.getShellArgs(shell);
            const command = 'printf "%s\\n%s" "$ANTHROPIC_AUTH_TOKEN" "$ANTHROPIC_BASE_URL"';

            const { stdout } = await execFileAsync(shell, [...args, command], {
                timeout: 4000,
                env: process.env,
            });

            const [authToken = '', baseUrl = ''] = stdout
                .split(/\r?\n/)
                .map((value) => value.trim())
                .filter((value, index) => index < 2);

            if (authToken && baseUrl) {
                return { authToken, baseUrl };
            }
        } catch {
            // Ignore shell env lookup failures and fall back to stored credentials.
        }

        return null;
    }

    private getShellArgs(shell: string): string[] {
        if (shell.includes('fish')) {
            return ['-l', '-c'];
        }

        return ['-ilc'];
    }
}
