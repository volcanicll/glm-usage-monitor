import * as vscode from 'vscode';
import { ApiConfig } from '../types/api';

export class AuthService {
    constructor(
        private secretStorage: vscode.SecretStorage,
        private config: vscode.WorkspaceConfiguration
    ) {}

    /**
     * Get credentials with priority: env vars > stored > config
     */
    async getCredentials(): Promise<ApiConfig | null> {
        // Priority 1: Environment variables
        const envToken = process.env.ANTHROPIC_AUTH_TOKEN;
        const envBaseUrl = process.env.ANTHROPIC_BASE_URL;

        if (envToken && envBaseUrl) {
            return { authToken: envToken, baseUrl: envBaseUrl };
        }

        // Priority 2: SecretStorage for token
        const storedToken = await this.secretStorage.get('authToken');
        const configBaseUrl = this.config.get<string>('baseUrl', 'https://api.z.ai/api/anthropic');

        if (storedToken && configBaseUrl) {
            return { authToken: storedToken, baseUrl: configBaseUrl };
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
    }

    /**
     * Check if credentials exist
     */
    async hasCredentials(): Promise<boolean> {
        const creds = await this.getCredentials();
        return creds !== null;
    }
}
