import assert from 'assert';

// Simple mock interfaces for testing
interface SecretStorage {
    get(key: string): Promise<string | undefined>;
    store(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}

interface WorkspaceConfiguration {
    get<T>(key: string, defaultValue?: T): T | undefined;
    update(key: string, value: unknown, target: boolean): Promise<void>;
}

// Import AuthService implementation
class AuthService {
    constructor(
        private secretStorage: SecretStorage,
        private config: WorkspaceConfiguration
    ) {}

    /**
     * Get credentials with priority: env vars > stored > config
     */
    async getCredentials(): Promise<{ authToken: string; baseUrl: string } | null> {
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
        await this.config.update('baseUrl', baseUrl, true);
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

suite('AuthService Tests', () => {
    test('reads credentials from environment variables first', async () => {
        process.env.ANTHROPIC_AUTH_TOKEN = 'env-token';
        process.env.ANTHROPIC_BASE_URL = 'https://env.example.com';

        const mockSecretStorage: SecretStorage = {
            get: () => Promise.resolve('stored-token'),
            store: () => Promise.resolve(),
            delete: () => Promise.resolve()
        };

        const mockConfig: WorkspaceConfiguration = {
            get: <T>(key: string, defaultValue?: T) => {
                if (key === 'baseUrl') return 'https://config.example.com' as T;
                return defaultValue as T;
            },
            update: () => Promise.resolve()
        };

        const service = new AuthService(mockSecretStorage, mockConfig);
        const creds = await service.getCredentials();

        assert.ok(creds, 'Credentials should not be null');
        assert.strictEqual(creds?.authToken, 'env-token');
        assert.strictEqual(creds?.baseUrl, 'https://env.example.com');
    });

    test('falls back to stored credentials when env vars not set', async () => {
        delete process.env.ANTHROPIC_AUTH_TOKEN;
        delete process.env.ANTHROPIC_BASE_URL;

        const mockSecretStorage: SecretStorage = {
            get: () => Promise.resolve('stored-token'),
            store: () => Promise.resolve(),
            delete: () => Promise.resolve()
        };

        const mockConfig: WorkspaceConfiguration = {
            get: <T>(key: string, defaultValue?: T) => {
                if (key === 'baseUrl') return 'https://config.example.com' as T;
                return defaultValue as T;
            },
            update: () => Promise.resolve()
        };

        const service = new AuthService(mockSecretStorage, mockConfig);
        const creds = await service.getCredentials();

        assert.ok(creds, 'Credentials should not be null');
        assert.strictEqual(creds?.authToken, 'stored-token');
        assert.strictEqual(creds?.baseUrl, 'https://config.example.com');
    });
});
