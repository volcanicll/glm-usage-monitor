import assert from 'assert';
import * as vscode from 'vscode';
import { AuthService } from '../../services/AuthService';

suite('AuthService Tests', () => {
    // Store original env vars to restore after tests
    const originalEnv = { ...process.env };

    // Helper to clean up env vars
    function cleanEnv() {
        delete process.env.ANTHROPIC_AUTH_TOKEN;
        delete process.env.ANTHROPIC_BASE_URL;
    }

    // Restore env vars after all tests
    setup(() => {
        cleanEnv();
    });

    teardown(() => {
        process.env = { ...originalEnv };
    });

    // Helper to create mock SecretStorage
    function createMockSecretStorage(getValue?: string | undefined): vscode.SecretStorage {
        return {
            get: () => Promise.resolve(getValue),
            store: () => Promise.resolve(),
            delete: () => Promise.resolve(),
            onDidChange: () => ({ dispose: () => {} } as any),
            keys: () => Promise.resolve([])
        };
    }

    test('reads credentials from environment variables first', async () => {
        process.env.ANTHROPIC_AUTH_TOKEN = 'env-token';
        process.env.ANTHROPIC_BASE_URL = 'https://env.example.com';

        const mockSecretStorage = createMockSecretStorage('stored-token');

        const mockConfig: vscode.WorkspaceConfiguration = {
            get: <T>(key: string, defaultValue?: T) => {
                if (key === 'baseUrl') return 'https://config.example.com' as T;
                return defaultValue as T;
            },
            update: () => Promise.resolve(),
            has: () => false,
            inspect: () => undefined
        };

        const service = new AuthService(mockSecretStorage, mockConfig);
        const creds = await service.getCredentials();

        assert.ok(creds, 'Credentials should not be null');
        assert.strictEqual(creds?.authToken, 'env-token');
        assert.strictEqual(creds?.baseUrl, 'https://env.example.com');
    });

    test('falls back to stored credentials when env vars not set', async () => {
        const mockSecretStorage = createMockSecretStorage('stored-token');

        const mockConfig: vscode.WorkspaceConfiguration = {
            get: <T>(key: string, defaultValue?: T) => {
                if (key === 'baseUrl') return 'https://config.example.com' as T;
                return defaultValue as T;
            },
            update: () => Promise.resolve(),
            has: () => false,
            inspect: () => undefined
        };

        const service = new AuthService(mockSecretStorage, mockConfig);
        const creds = await service.getCredentials();

        assert.ok(creds, 'Credentials should not be null');
        assert.strictEqual(creds?.authToken, 'stored-token');
        assert.strictEqual(creds?.baseUrl, 'https://config.example.com');
    });

    test('returns null when no credentials available', async () => {
        const mockSecretStorage = createMockSecretStorage(undefined);

        const mockConfig: vscode.WorkspaceConfiguration = {
            get: <T>(key: string, defaultValue?: T) => {
                if (key === 'baseUrl') return 'https://config.example.com' as T;
                return defaultValue as T;
            },
            update: () => Promise.resolve(),
            has: () => false,
            inspect: () => undefined
        };

        const service = new AuthService(mockSecretStorage, mockConfig);
        const creds = await service.getCredentials();

        assert.strictEqual(creds, null, 'Credentials should be null when none available');
    });

    test('hasCredentials returns true when credentials exist', async () => {
        process.env.ANTHROPIC_AUTH_TOKEN = 'env-token';
        process.env.ANTHROPIC_BASE_URL = 'https://env.example.com';

        const mockSecretStorage = createMockSecretStorage(undefined);

        const mockConfig: vscode.WorkspaceConfiguration = {
            get: <T>(key: string, defaultValue?: T) => {
                if (key === 'baseUrl') return 'https://config.example.com' as T;
                return defaultValue as T;
            },
            update: () => Promise.resolve(),
            has: () => false,
            inspect: () => undefined
        };

        const service = new AuthService(mockSecretStorage, mockConfig);
        const hasCreds = await service.hasCredentials();

        assert.strictEqual(hasCreds, true, 'hasCredentials should return true when credentials exist');
    });

    test('hasCredentials returns false when no credentials', async () => {
        const mockSecretStorage = createMockSecretStorage(undefined);

        const mockConfig: vscode.WorkspaceConfiguration = {
            get: <T>(key: string, defaultValue?: T) => {
                if (key === 'baseUrl') return 'https://config.example.com' as T;
                return defaultValue as T;
            },
            update: () => Promise.resolve(),
            has: () => false,
            inspect: () => undefined
        };

        const service = new AuthService(mockSecretStorage, mockConfig);
        const hasCreds = await service.hasCredentials();

        assert.strictEqual(hasCreds, false, 'hasCredentials should return false when no credentials');
    });

    test('storeCredentials saves token and baseUrl', async () => {
        let storedToken: string | undefined;
        let updatedBaseUrl: string | undefined;

        const mockSecretStorage: vscode.SecretStorage = {
            get: () => Promise.resolve(undefined),
            store: (key: string, value: string) => {
                if (key === 'authToken') {
                    storedToken = value;
                }
                return Promise.resolve();
            },
            delete: () => Promise.resolve(),
            onDidChange: () => ({ dispose: () => {} } as any),
            keys: () => Promise.resolve([])
        };

        const mockConfig: vscode.WorkspaceConfiguration = {
            get: <T>(key: string, defaultValue?: T) => {
                if (key === 'baseUrl') return 'https://config.example.com' as T;
                return defaultValue as T;
            },
            update: (key: string, value: unknown) => {
                if (key === 'baseUrl') {
                    updatedBaseUrl = value as string;
                }
                return Promise.resolve();
            },
            has: () => false,
            inspect: () => undefined
        };

        const service = new AuthService(mockSecretStorage, mockConfig);
        await service.storeCredentials('test-token', 'https://test.example.com');

        assert.strictEqual(storedToken, 'test-token', 'Token should be stored');
        assert.strictEqual(updatedBaseUrl, 'https://test.example.com', 'BaseUrl should be updated');
    });

    test('clearCredentials removes stored token', async () => {
        let deletedKey: string | undefined;

        const mockSecretStorage: vscode.SecretStorage = {
            get: () => Promise.resolve('stored-token'),
            store: () => Promise.resolve(),
            delete: (key: string) => {
                deletedKey = key;
                return Promise.resolve();
            },
            onDidChange: () => ({ dispose: () => {} } as any),
            keys: () => Promise.resolve([])
        };

        const mockConfig: vscode.WorkspaceConfiguration = {
            get: <T>(key: string, defaultValue?: T) => {
                if (key === 'baseUrl') return 'https://config.example.com' as T;
                return defaultValue as T;
            },
            update: () => Promise.resolve(),
            has: () => false,
            inspect: () => undefined
        };

        const service = new AuthService(mockSecretStorage, mockConfig);
        await service.clearCredentials();

        assert.strictEqual(deletedKey, 'authToken', 'authToken should be deleted');
    });
});
