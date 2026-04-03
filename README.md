# GLM Usage Monitor

> Monitor your GLM Coding Plan usage directly in Visual Studio Code

![Version](https://img.shields.io/visual-studio-marketplace/v/glm-usage-monitor)
![Installs](https://img.shields.io/visual-studio-marketplace/i/glm-usage-monitor)
![Rating](https://img.shields.io/visual-studio-marketplace/r/glm-usage-monitor)

## Features

- **Real-time Usage Tracking**: Monitor your GLM Coding Plan token usage at a glance
- **Status Bar Integration**: See current usage statistics in your status bar
- **Auto-Refresh**: Configurable auto-refresh interval (default: 10 minutes)
- **Manual Refresh**: Quick refresh command to get the latest data
- **Secure Credential Storage**: API key stored securely in VSCode's secret storage
- **Time Window Analysis**: View usage data with customizable time windows (24h, 7d, 30d)

## Requirements

- Visual Studio Code 1.80.0 or higher
- GLM Coding Plan API credentials

## Installation

1. Open Visual Studio Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "GLM Usage Monitor"
4. Click Install

## Quick Start

1. **Configure API Credentials**
   - Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Run "GLM Usage Monitor: Configure"
   - Enter your API Base URL (default: `https://api.z.ai/api/anthropic`)
   - Enter your API Key

2. **View Your Usage**
   - Click the status bar item or run "Show GLM Usage Panel" command
   - View your current usage statistics

## Commands

| Command | Description |
|---------|-------------|
| `glmUsage.showUsage` | Show GLM Usage Panel |
| `glmUsage.refresh` | Refresh usage data |
| `glmUsage.configure` | Configure API credentials |
| `glmUsage.clearCredentials` | Clear stored API credentials |

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `glmUsage.baseUrl` | string | `https://api.z.ai/api/anthropic` | GLM API base URL |
| `glmUsage.refreshInterval` | number | `600000` | Auto-refresh interval in milliseconds |
| `glmUsage.autoRefresh` | boolean | `true` | Enable/disable auto-refresh |

## Privacy & Security

- Your API key is stored securely in VSCode's secret storage
- No usage data is sent to any third-party services
- All API calls are made directly to the configured GLM API endpoint

## License

MIT License - see [LICENSE](LICENSE) for details

## Support

For issues, feature requests, or questions, please visit the [GitHub repository](https://github.com/volcanicll/glm-usage-monitor)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history
