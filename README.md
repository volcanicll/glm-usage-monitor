# GLM Usage Monitor

> 在 Visual Studio Code 中直接监控您的 GLM Coding Plan 使用量

![Version](https://img.shields.io/visual-studio-marketplace/v/glm-usage-monitor)
![Installs](https://img.shields.io/visual-studio-marketplace/i/glm-usage-monitor)
![Rating](https://img.shields.io/visual-studio-marketplace/r/glm-usage-monitor)

## 功能特性

- **配额优先监控**：优先展示 Token 配额和 MCP 配额状态，快速判断剩余空间
- **紧凑面板设计**：面板采用更紧凑的仪表盘布局，减少滚动并提升信息密度
- **模型统计**：支持模型调用次数与 Token 消耗排行
- **工具统计**：支持 MCP 工具调用汇总与工具排行
- **状态栏集成**：在状态栏中查看当前使用量摘要，并通过 tooltip 查看结构化详情
- **自动刷新**：可配置的自动刷新间隔（默认：10 分钟）
- **手动刷新**：快速刷新命令获取最新数据
- **安全凭证存储**：API 密钥安全存储在 VSCode 的 secret storage 中
- **时间窗口分析**：支持自定义时间窗口查看使用量数据（今日、近7天、近30天）
- **自动配置**：自动读取 Claude Code 配置文件中的凭证

## 系统要求

- Visual Studio Code 1.80.0 或更高版本
- GLM Coding Plan API 凭证

## 安装

1. 打开 Visual Studio Code
2. 进入扩展面板（Ctrl+Shift+X）
3. 搜索 "GLM Usage Monitor"
4. 点击安装

## 快速开始

### 方式一：自动配置（推荐）

如果您已经配置了 Claude Code，扩展会自动使用 `~/.claude/settings.json` 中的凭证，无需额外配置。

### 方式二：手动配置

1. **配置 API 凭证**
   - 打开命令面板（Ctrl+Shift+P / Cmd+Shift+P）
   - 运行 "GLM Usage: Configure"
   - 输入您的 API Base URL（默认：`https://api.z.ai/api/anthropic`）
   - 输入您的 API 密钥

2. **查看使用量**
   - 点击状态栏项目或运行 "Show GLM Usage Panel" 命令
   - 查看配额状态、模型统计和工具统计

## 面板说明

- **配额状态**：展示 Token 配额和 MCP 配额的已用比例、剩余空间和重置时间
- **模型统计**：展示模型调用次数、Token 消耗和模型排行
- **工具统计**：展示工具调用汇总和工具排行
- **状态栏 Tooltip**：悬停即可查看当前时间范围、配额状态、重置时间和调用摘要

## 命令

| 命令 | 描述 |
|---------|-------------|
| `glmUsage.showUsage` | 显示 GLM 使用量面板 |
| `glmUsage.refresh` | 刷新使用量数据 |
| `glmUsage.configure` | 配置 API 凭证 |
| `glmUsage.clearCredentials` | 清除已存储的 API 凭证 |
| `glmUsage.diagnose` | 诊断凭证配置 |

## 设置

| 设置 | 类型 | 默认值 | 描述 |
|---------|------|---------|-------------|
| `glmUsage.baseUrl` | string | `https://api.z.ai/api/anthropic` | GLM API 基础 URL |
| `glmUsage.refreshInterval` | number | `600000` | 自动刷新间隔（毫秒） |
| `glmUsage.autoRefresh` | boolean | `true` | 启用/禁用自动刷新 |

## 凭证配置优先级

扩展按以下优先级获取 API 凭证：

1. **Claude Code 配置文件** (`~/.claude/settings.json`)
2. **VSCode 进程环境变量**
3. **手动配置的凭证**

## 隐私与安全

- 您的 API 密钥安全存储在 VSCode 的 secret storage 中
- 不向任何第三方服务发送使用量数据
- 所有 API 调用直接发送到配置的 GLM API 端点

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

## 支持

如有问题、功能建议或疑问，请访问 [GitHub 仓库](https://github.com/volcanicll/glm-usage-monitor)

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)
