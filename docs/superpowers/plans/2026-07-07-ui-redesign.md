# GLM Usage Panel UI 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不动数据层的前提下，统一 GLM Usage 面板的视觉系统、优化布局节奏、提升数字与状态可读性。

**Architecture:** 将 `UsagePanel.ts` 中可测试的纯函数（数字格式化、进度色、相对时间、HTML 转义、内联图标）抽离到新的 `src/views/panelUtils.ts` 模块，用 mocha 单元测试覆盖；HTML/CSS 模板与 SVG 生成函数保持为表现层（靠手动验证 + 编译检查）。视觉令牌通过 CSS 变量统一管理。

**Tech Stack:** TypeScript（严格模式）、VSCode Webview API、内联 SVG（零图表库依赖）、Mocha + assert（已有测试基建）。

## Global Constraints

- **不引入任何 npm 依赖**（继续用内联 SVG）。
- **不改动数据层**：`src/types/api.ts` 的 `QuotaSummary`、`src/services/*` 不在本计划范围。
- **不改 webview 消息协议**：保留 `refresh` / `changeRange` 两个消息类型。
- **保留时间范围 tabs**：today / last7Days / last30Days 不变。
- **遵循现有代码风格**：2 空格缩进、双引号、分号、中文注释。
- **提交规范**：`<type>(<scope>): <description>`，不加 Co-Authored-By。
- **测试命令**：`npm run pretest`（编译）→ `npm test`（运行 mocha）。本项目无 lint 脚本，靠 `npm run compile` 做类型检查。
- **VSCode 主题变量**：颜色优先用 `var(--vscode-*)`，确保 light/dark 双主题兼容。

---

## File Structure

| 文件 | 职责 | 操作 |
|---|---|---|
| `src/views/panelUtils.ts` | 纯函数：数字格式化、进度色、相对时间、HTML 转义、内联 SVG 图标 | 新建 |
| `src/test/suite/panelUtils.test.ts` | `panelUtils.ts` 的单元测试 | 新建 |
| `src/views/UsagePanel.ts` | 表现层：CSS 变量、HTML 模板、SVG 图表生成；改为复用 `panelUtils` | 修改 |
| `docs/superpowers/specs/2026-07-07-ui-redesign-design.md` | 设计文档（已存在） | 不动 |

**职责边界**：`panelUtils.ts` 只包含无副作用、可独立测试的纯函数，不 import `vscode`。`UsagePanel.ts` 负责 webview 生命周期、消息处理、HTML 装配，调用 `panelUtils` 的纯函数。

---

## Task 1: 抽离纯函数模块 panelUtils（基础工具）

**Files:**
- Create: `src/views/panelUtils.ts`
- Create: `src/test/suite/panelUtils.test.ts`

**Interfaces:**
- Produces:
  - `formatTokenCount(v: number): string` — `1.2K / 3.4M / 1.1B` 简写
  - `getProgressColor(pct: number): string` — 返回语义色 hex（`#10b981` / `#d9a441` / `#d05d5d`）
  - `escapeHtml(s: string): string`
  - `getRelativeTime(targetIso: string, now: Date = new Date()): string` — "3 小时后" / "已过期" 等

- [ ] **Step 1: 写失败测试**

创建 `src/test/suite/panelUtils.test.ts`：

```typescript
import assert from "assert";
import {
  formatTokenCount,
  getProgressColor,
  escapeHtml,
  getRelativeTime,
} from "../../views/panelUtils";

suite("panelUtils Tests", () => {
  test("formatTokenCount formats large numbers", () => {
    assert.strictEqual(formatTokenCount(0), "0");
    assert.strictEqual(formatTokenCount(999), "999");
    assert.strictEqual(formatTokenCount(1500), "1.5K");
    assert.strictEqual(formatTokenCount(3_400_000), "3.4M");
    assert.strictEqual(formatTokenCount(1_100_000_000), "1.1B");
  });

  test("getProgressColor returns semantic colors", () => {
    assert.strictEqual(getProgressColor(10), "#10b981");
    assert.strictEqual(getProgressColor(79), "#10b981");
    assert.strictEqual(getProgressColor(80), "#d9a441");
    assert.strictEqual(getProgressColor(94), "#d9a441");
    assert.strictEqual(getProgressColor(95), "#d05d5d");
    assert.strictEqual(getProgressColor(100), "#d05d5d");
  });

  test("escapeHtml escapes special characters", () => {
    assert.strictEqual(escapeHtml(`<a>"x"&'y'</a>`), "&lt;a&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/a&gt;");
  });

  test("getRelativeTime shows future duration", () => {
    const now = new Date("2026-07-07T10:00:00");
    const target = new Date("2026-07-07T13:00:00").toISOString();
    assert.strictEqual(getRelativeTime(target, now), "3 小时后");
  });

  test("getRelativeTime shows past as 已过期", () => {
    const now = new Date("2026-07-07T10:00:00");
    const target = new Date("2026-07-07T09:00:00").toISOString();
    assert.strictEqual(getRelativeTime(target, now), "已过期");
  });

  test("getRelativeTime shows minutes", () => {
    const now = new Date("2026-07-07T10:00:00");
    const target = new Date("2026-07-07T10:45:00").toISOString();
    assert.strictEqual(getRelativeTime(target, now), "45 分钟后");
  });

  test("getRelativeTime handles invalid date", () => {
    assert.strictEqual(getRelativeTime("", new Date()), "--");
    assert.strictEqual(getRelativeTime("not-a-date", new Date()), "--");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run pretest && npm test`
Expected: 编译报错 `Cannot find module '../../views/panelUtils'` 或测试失败。

- [ ] **Step 3: 实现最小代码**

创建 `src/views/panelUtils.ts`：

```typescript
/**
 * GLM Usage 面板的纯函数工具集（无副作用、可独立测试）。
 * 不依赖 vscode API，便于单元测试。
 */

/** Token 数量简写：1.2K / 3.4M / 1.1B */
export function formatTokenCount(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toString();
}

/** 配额百分比对应的语义色：绿（充足）/ 黄（紧张）/ 红（危急） */
export function getProgressColor(pct: number): string {
  if (pct >= 95) return "#d05d5d";
  if (pct >= 80) return "#d9a441";
  return "#10b981";
}

/** HTML 转义，防止用户输入（模型名等）注入 webview */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 计算相对时间描述（用于配额重置、刷新时间）。
 * 仅处理「未来」场景的友好描述；过去返回"已过期"；无效返回"--"。
 */
export function getRelativeTime(
  targetIso: string,
  now: Date = new Date(),
): string {
  if (!targetIso) return "--";
  const target = new Date(targetIso);
  if (isNaN(target.getTime())) return "--";

  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return "已过期";

  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} 分钟后`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时后`;
  const days = Math.floor(hours / 24);
  return `${days} 天后`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run pretest && npm test`
Expected: 全部测试通过（`panelUtils Tests` suite 全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/panelUtils.ts src/test/suite/panelUtils.test.ts
git commit -m "feat(views): 抽离面板纯函数工具模块 panelUtils"
```

---

## Task 2: 内联图标函数与令牌常量

**Files:**
- Modify: `src/views/panelUtils.ts`（追加图标函数）
- Modify: `src/test/suite/panelUtils.test.ts`（追加测试）

**Interfaces:**
- Produces:
  - `CHART_COLORS: string[]` — 复用现有调色板（从 UsagePanel 迁移）
  - `getIcon(name: 'quota' | 'donut' | 'tool' | 'trend'): string` — 返回内联 SVG 字符串（14×14，`currentColor`）

- [ ] **Step 1: 写失败测试**

在 `src/test/suite/panelUtils.test.ts` 末尾的 `suite(...)` 内追加：

```typescript
  test("getIcon returns svg markup", () => {
    const svg = getIcon("quota");
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.includes("currentColor"));
    assert.ok(svg.includes("14"));
  });

  test("getIcon throws on unknown name", () => {
    assert.throws(() => getIcon("unknown" as never), /unknown icon/);
  });

  test("CHART_COLORS is non-empty array of hex colors", () => {
    assert.ok(CHART_COLORS.length >= 6);
    for (const c of CHART_COLORS) {
      assert.ok(/^#[0-9a-f]{6}$/i.test(c), `bad color ${c}`);
    }
  });
```

并在文件顶部 import 中加入 `CHART_COLORS, getIcon`：

```typescript
import {
  CHART_COLORS,
  formatTokenCount,
  getIcon,
  getProgressColor,
  getQuotaLevel,
  escapeHtml,
  getRelativeTime,
} from "../../views/panelUtils";
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run pretest && npm test`
Expected: 失败（`getIcon` / `CHART_COLORS` 未导出）。

- [ ] **Step 3: 实现图标与调色板**

在 `src/views/panelUtils.ts` 顶部（工具函数之前）追加调色板：

```typescript
/** 图表配色（从 UsagePanel 迁移，保持视觉连续） */
export const CHART_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#84cc16",
];
```

在文件末尾追加图标函数：

```typescript
/** 卡片标题内联 SVG 图标（14×14，stroke 用 currentColor 自适应主题） */
export function getIcon(
  name: "quota" | "donut" | "tool" | "trend",
): string {
  const common =
    'width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  switch (name) {
    case "quota":
      return `<svg ${common}><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 2v10l8 4"/></svg>`;
    case "donut":
      return `<svg ${common}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>`;
    case "tool":
      return `<svg ${common}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.8-2.8z"/></svg>`;
    case "trend":
      return `<svg ${common}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>`;
    default:
      throw new Error(`unknown icon: ${name}`);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run pretest && npm test`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add src/views/panelUtils.ts src/test/suite/panelUtils.test.ts
git commit -m "feat(views): 添加内联图标函数与图表调色板常量"
```

---

## Task 3: UsagePanel 复用 panelUtils（去重，不改外观）

**Files:**
- Modify: `src/views/UsagePanel.ts`

**Interfaces:**
- Consumes: `formatTokenCount`, `getProgressColor`, `escapeHtml`, `CHART_COLORS`, `getIcon` from `./panelUtils`
- 删除 `UsagePanel` 内的 `CHART_COLORS`、`formatTokenCount`、`getProgressColor`、`escapeHtml` 私有实现，改为从 `panelUtils` 导入复用。
- `getRefreshInfoHtml` 保持私有（它依赖 `this.isOffline` 实例状态），但内部可调用 `getRelativeTime`。

**说明**：此任务为纯重构，**不改任何视觉外观**。改动后页面应与改动前像素级一致。先做这步以降低后续视觉改造的耦合。

- [ ] **Step 1: 替换 import 与删除重复实现**

在 `src/views/UsagePanel.ts` 顶部，将：

```typescript
import * as vscode from "vscode";
import { QuotaSummary, UsageRange } from "../types/api";
import { getUsageRangeLabel } from "../util/timeWindow";

const CHART_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#84cc16",
];
```

替换为：

```typescript
import * as vscode from "vscode";
import { QuotaSummary, UsageRange } from "../types/api";
import { getUsageRangeLabel } from "../util/timeWindow";
import {
  CHART_COLORS,
  escapeHtml,
  formatTokenCount,
  getProgressColor,
} from "./panelUtils";
```

- [ ] **Step 2: 删除类内重复的私有方法**

删除 `UsagePanel` 类内的这三个私有方法（约在 696-716 行）：

- `private getProgressColor(pct: number): string { ... }`
- `private formatTokenCount(v: number): string { ... }`
- `private escapeHtml(s: string): string { ... }`

- [ ] **Step 3: 替换类内调用为模块函数**

在 `getHtml()`、`generateDonutSvg()`、`generateLineChartSection()`、`getRefreshInfoHtml()` 中，将所有 `this.formatTokenCount(` → `formatTokenCount(`、`this.getProgressColor(` → `getProgressColor(`、`this.escapeHtml(` → `escapeHtml(`。

可用全局替换（确认每次替换的上下文都正确）。

- [ ] **Step 4: 编译验证**

Run: `npm run compile`
Expected: 编译通过，无类型错误。

- [ ] **Step 5: 手动验证外观无变化**

在 VSCode 中按 `F5` 启动扩展开发宿主，运行 `GLM: 显示使用详情`（或对应命令）打开面板，确认与重构前**像素级一致**。

- [ ] **Step 6: 运行全部测试**

Run: `npm run pretest && npm test`
Expected: 全绿（含原 util/types/services suite + 新 panelUtils suite）。

- [ ] **Step 7: 提交**

```bash
git add src/views/UsagePanel.ts
git commit -m "refactor(views): UsagePanel 复用 panelUtils 纯函数"
```

---

## Task 4: 视觉令牌系统（CSS 变量重构）

**Files:**
- Modify: `src/views/UsagePanel.ts`（仅 `getHtml()` 的 `<style>` 段）

**说明**：纯样式改动，无可单元测试的纯函数；靠编译 + 手动验证。本任务**只重构 CSS 变量定义**，不改任何 class 的视觉规则（规则改造在 Task 5）。

- [ ] **Step 1: 替换 `:root` 变量块**

在 `getHtml()` 内，将现有的 `:root { ... }` 块（约 327-338 行）：

```css
:root {
  --accent: #6366f1;
  --green: #10b981;
  --yellow: #f59e0b;
  --red: #ef4444;
  --bg: var(--vscode-editor-background);
  --fg: var(--vscode-foreground);
  --card-bg: var(--vscode-editor-inactiveSelectionBackground);
  --panel-bg: var(--vscode-editor-selectionBackground);
  --border: var(--vscode-panel-border, rgba(128,128,128,.25));
  --muted: var(--vscode-descriptionForeground);
}
```

替换为：

```css
:root {
  /* 主色梯度 */
  --accent: #6366f1;
  --accent-soft: rgba(99,102,241,.12);

  /* 语义色 */
  --ok: #10b981;
  --warn: #f59e0b;
  --warn-strong: #d9a441;
  --danger: #ef4444;
  --danger-soft: #d05d5d;

  /* 层级背景 */
  --bg: var(--vscode-editor-background);
  --fg: var(--vscode-foreground);
  --surface-1: var(--vscode-editor-background);
  --surface-2: var(--vscode-editor-inactiveSelectionBackground);
  --surface-3: var(--vscode-editor-selectionBackground);
  /* 兼容旧名（Task 5 前的过渡） */
  --card-bg: var(--surface-2);
  --panel-bg: var(--surface-3);

  /* 边框 / 文字弱化 */
  --border: var(--vscode-panel-border, rgba(128,128,128,.25));
  --muted: var(--vscode-descriptionForeground);

  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  /* 间距 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;

  /* 字号梯度 */
  --text-xs: 10px;
  --text-sm: 11px;
  --text-base: 12px;
  --text-md: 13px;
  --text-lg: 16px;
  --text-xl: 22px;
  --text-2xl: 28px;
}
```

- [ ] **Step 2: 编译验证**

Run: `npm run compile`
Expected: 通过（CSS 在模板字符串内，编译不校验内容）。

- [ ] **Step 3: 手动验证视觉无回归**

`F5` 启动开发宿主打开面板，确认 light / dark 主题下外观与重构前一致（新变量通过兼容旧名 `--card-bg` / `--panel-bg` 保持效果不变）。

- [ ] **Step 4: 提交**

```bash
git add src/views/UsagePanel.ts
git commit -m "style(views): 建立统一视觉令牌 CSS 变量系统"
```

---

## Task 5: 配额横条视觉优化与警示态

**Files:**
- Modify: `src/views/UsagePanel.ts`（`getHtml()` 的 CSS `.quota-*` 段 + 配额条 HTML）

**说明**：保留横条布局（用户明确要求"保持现状"），仅强化字号、警示态边框、相对时间 tooltip。

- [ ] **Step 1: 更新配额条 CSS**

在 `.quota-bar` 区域，将：

```css
.quota-bar{
  display:flex;gap:12px;margin-bottom:14px;
  padding:10px 14px;border-radius:10px;background:var(--card-bg);
  border:1px solid var(--border);align-items:center;flex-wrap:wrap;
}
.quota-item{display:flex;align-items:center;gap:6px;font-size:11px}
.quota-dot{width:8px;height:8px;border-radius:50%}
.quota-dot.token{background:#6366f1}
.quota-dot.weekly{background:#10b981}
.quota-dot.mcp{background:#f59e0b}
.quota-pct{font-weight:700;font-size:13px}
.quota-meta{color:var(--muted)}
.offline-badge{
  margin-left:auto;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:600;
  background:rgba(245,158,11,.15);color:#d97706;
}
```

替换为：

```css
.quota-bar{
  display:flex;gap:var(--space-4);margin-bottom:var(--space-4);
  padding:var(--space-3) var(--space-5);border-radius:var(--radius-md);
  background:var(--surface-2);border:1px solid var(--border);
  border-left:3px solid var(--border);
  align-items:center;flex-wrap:wrap;transition:border-color .2s,background .2s;
}
/* 警示态：配额接近上限 */
.quota-bar.is-warn{border-left-color:var(--warn-strong);background:rgba(245,158,11,.06)}
.quota-bar.is-danger{border-left-color:var(--danger-soft);background:rgba(239,68,68,.06)}
.quota-item{display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm)}
.quota-dot{width:8px;height:8px;border-radius:50%}
.quota-dot.token{background:var(--accent)}
.quota-dot.weekly{background:var(--ok)}
.quota-dot.mcp{background:var(--warn)}
.quota-pct{font-weight:700;font-size:var(--text-lg)}
.quota-meta{color:var(--muted);font-size:var(--text-xs)}
.offline-badge{
  margin-left:auto;padding:3px var(--space-3);border-radius:999px;
  font-size:var(--text-xs);font-weight:600;
  background:rgba(245,158,11,.15);color:#d97706;
}
```

- [ ] **Step 2: 在 HTML 中根据最高用量添加警示 class**

定位 `getHtml()` 中 `<div class="quota-bar">`，改为按 `dominantPercent`（已在函数体内计算）附加 class：

```html
<div class="quota-bar ${dominantPercent >= 95 ? "is-danger" : dominantPercent >= 80 ? "is-warn" : ""}">
```

- [ ] **Step 3: 为重置时间加相对时间 tooltip**

在 import 中追加 `getRelativeTime`：

```typescript
import {
  CHART_COLORS,
  escapeHtml,
  formatTokenCount,
  getProgressColor,
  getRelativeTime,
} from "./panelUtils";
```

将配额条内三个 `重置 ${...ResetTime}` 的 `<span class="quota-meta">` 元素，分别加 `title` 属性显示相对时间。例如 Token 项：

将
```html
<span class="quota-meta">剩余 ${tokenRemaining.toLocaleString("zh-CN")} · 重置 ${tokenResetTime}</span>
```
改为
```html
<span class="quota-meta" title="${summary.tokenResetAt ? getRelativeTime(summary.tokenResetAt) : ''}">剩余 ${tokenRemaining.toLocaleString("zh-CN")} · 重置 ${tokenResetTime}</span>
```

对 `weekly` 项的 `重置 ${weeklyResetTime}` 与 MCP 项的 `重置 ${mcpResetTime}` 做同样处理（分别用 `summary.weeklyTokenResetAt`、`summary.mcpResetAt`）。

- [ ] **Step 4: 编译验证**

Run: `npm run compile`
Expected: 通过。

- [ ] **Step 5: 手动验证**

`F5` 打开面板，确认：
- 百分比字号变大（13→16）。
- 配额条左侧出现细色条（默认为边框灰）。
- 构造一个 `dominantPercent ≥ 80` 的场景（可临时把 `tokenPercent` mock 到 85）确认黄色警示态；≥95 确认红色。（验证后改回）
- 悬停「重置 …」文字，tooltip 显示「N 小时后」。

- [ ] **Step 6: 提交**

```bash
git add src/views/UsagePanel.ts
git commit -m "style(views): 配额横条字号强化、警示态与相对时间 tooltip"
```

---

## Task 6: 模型占比环形图与占比条图例

**Files:**
- Modify: `src/views/UsagePanel.ts`（`generateDonutSvg` + 图例 CSS + 图例 HTML）

- [ ] **Step 1: 环形图放大与中心字号**

在 `generateDonutSvg` 中，将 `radius = 68` 改为 `radius = 76`；将返回的 `<svg viewBox="0 0 200 200" class="donut-chart">` 保持不变（viewBox 不变，但 stroke 视觉占比更明显）。

将 CSS：
```css
.donut-chart{width:180px;height:180px}
.donut-value{font-size:22px;font-weight:700;fill:var(--fg);font-family:var(--vscode-font-family,sans-serif)}
```
改为：
```css
.donut-chart{width:200px;height:200px}
.donut-value{font-size:var(--text-2xl);font-weight:700;fill:var(--fg);font-family:var(--vscode-font-family,sans-serif)}
```

并将 `generateDonutSvg` 内中心文字 y 坐标微调以适配更大字号：
- `<text x="100" y="96" ...>` → `<text x="100" y="98" ...>`（中心值）
- `<text x="100" y="116" ...>` → `<text x="100" y="118" ...>`（标签）
（对空数据态与正常态两处都改。）

- [ ] **Step 2: 图例升级为占比条**

将图例 CSS：
```css
.legend{display:flex;flex-direction:column;gap:6px}
.legend-item{display:grid;grid-template-columns:8px 1fr auto auto;gap:6px;align-items:center;font-size:11px}
.legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.legend-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.legend-value{color:var(--muted);text-align:right;white-space:nowrap}
.legend-pct{font-weight:600;text-align:right;min-width:36px}
```
替换为：
```css
.legend{display:flex;flex-direction:column;gap:var(--space-2)}
.legend-item{display:flex;flex-direction:column;gap:3px;font-size:var(--text-sm)}
.legend-head{display:flex;align-items:center;gap:var(--space-2)}
.legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.legend-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.legend-value{color:var(--muted);text-align:right;white-space:nowrap}
.legend-pct{font-weight:600;text-align:right;min-width:36px}
.legend-bar{height:3px;border-radius:2px;background:var(--surface-3);overflow:hidden}
.legend-bar-fill{height:100%;border-radius:2px}
```

- [ ] **Step 3: 图例 HTML 结构改为「表头行 + 占比条」**

将 `getHtml()` 中 `legendItems` 的生成（约 238-248 行）：

```typescript
const legendItems = donutData
  .map(
    (d) => `
  <div class="legend-item">
    <span class="legend-dot" style="background:${d.color}"></span>
    <span class="legend-name">${escapeHtml(d.name)}</span>
    <span class="legend-value">${formatTokenCount(d.tokens)}</span>
    <span class="legend-pct">${d.percent}%</span>
  </div>`,
  )
  .join("");
```

替换为：

```typescript
const legendItems = donutData
  .map(
    (d) => `
  <div class="legend-item">
    <div class="legend-head">
      <span class="legend-dot" style="background:${d.color}"></span>
      <span class="legend-name">${escapeHtml(d.name)}</span>
      <span class="legend-value">${formatTokenCount(d.tokens)}</span>
      <span class="legend-pct">${d.percent}%</span>
    </div>
    <div class="legend-bar"><div class="legend-bar-fill" style="width:${d.percent}%;background:${d.color}"></div></div>
  </div>`,
  )
  .join("");
```

- [ ] **Step 4: 卡片标题加图标**

在 import 中加入 `getIcon`：

```typescript
import {
  CHART_COLORS,
  escapeHtml,
  formatTokenCount,
  getIcon,
  getProgressColor,
  getRelativeTime,
} from "./panelUtils";
```

将主网格中 `<div class="card-title">模型使用占比</div>` 改为：
```html
<div class="card-title"><span class="card-icon">${getIcon("donut")}</span>模型使用占比</div>
```

并追加 `.card-icon` CSS（color 与标题一致，垂直居中）：
```css
.card-title{font-size:var(--text-md);font-weight:600;margin-bottom:var(--space-4);display:flex;align-items:center;gap:var(--space-2)}
.card-icon{display:inline-flex;color:var(--muted)}
```
（替换原 `.card-title{font-size:13px;font-weight:600;margin-bottom:12px}`。）

- [ ] **Step 5: 编译验证**

Run: `npm run compile`
Expected: 通过。

- [ ] **Step 6: 手动验证**

`F5` 打开面板，确认：
- 环形图放大，中心数字字号增大。
- 每个模型图例项下方出现按占比填充的细色条。
- 「模型使用占比」标题前出现环形图标。
- light/dark 主题下颜色正常。

- [ ] **Step 7: 运行测试**

Run: `npm run pretest && npm test`
Expected: 全绿（确保模板改动未破坏编译产物中可被测试触及的部分）。

- [ ] **Step 8: 提交**

```bash
git add src/views/UsagePanel.ts
git commit -m "style(views): 环形图放大、图例升级为占比条、卡片标题加图标"
```

---

## Task 7: 工具使用统计优化

**Files:**
- Modify: `src/views/UsagePanel.ts`（柱状图 CSS + HTML、计数卡片、空态）

- [ ] **Step 1: 柱状图加圆角与占比**

将柱状图 CSS：
```css
.bar-chart{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
.bar-row{display:grid;grid-template-columns:64px 1fr 36px;gap:8px;align-items:center}
.bar-name{font-size:11px;color:var(--muted);white-space:nowrap}
.bar-track{height:18px;border-radius:4px;background:var(--panel-bg);overflow:hidden}
.bar-fill{height:100%;border-radius:4px;min-width:2px;transition:width .3s}
.bar-count{font-size:13px;font-weight:700;text-align:right}
```
替换为（4 列：名称 / 轨道 / 计数 / 占比）：
```css
.bar-chart{display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-4)}
.bar-row{display:grid;grid-template-columns:56px 1fr auto 40px;gap:var(--space-2);align-items:center}
.bar-name{font-size:var(--text-sm);color:var(--muted);white-space:nowrap}
.bar-track{height:var(--space-4);border-radius:var(--radius-sm);background:var(--surface-3);overflow:hidden}
.bar-fill{height:100%;border-radius:var(--radius-sm);min-width:2px;transition:width .3s}
.bar-count{font-size:var(--text-md);font-weight:700;text-align:right;white-space:nowrap}
.bar-pct{font-size:var(--text-xs);color:var(--muted);text-align:right}
```

- [ ] **Step 2: 柱状图 HTML 加占比列**

将 `barRows` 生成（约 286-297 行）：
```typescript
const barRows = toolItems
  .map(
    (t) => `
  <div class="bar-row">
    <div class="bar-name">${t.name}</div>
    <div class="bar-track">
      <div class="bar-fill" style="width:${(t.count / maxTool) * 100}%;background:${t.color}"></div>
    </div>
    <div class="bar-count">${t.count}</div>
  </div>`,
  )
  .join("");
```
替换为（占比 = 该工具 / 总调用数）：
```typescript
const barRows = toolItems
  .map((t) => {
    const pct = totalToolCalls > 0 ? Math.round((t.count / totalToolCalls) * 100) : 0;
    return `
  <div class="bar-row">
    <div class="bar-name">${t.name}</div>
    <div class="bar-track">
      <div class="bar-fill" style="width:${(t.count / maxTool) * 100}%;background:${t.color}"></div>
    </div>
    <div class="bar-count">${t.count}</div>
    <div class="bar-pct">${pct}%</div>
  </div>`;
  })
  .join("");
```

- [ ] **Step 3: 计数卡片缩小**

将 `.count-grid` 与 `.count-card` CSS：
```css
.count-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.count-card{text-align:center;padding:10px 6px;border-radius:8px;background:var(--panel-bg)}
.count-num{font-size:20px;font-weight:700}
.count-label{font-size:10px;color:var(--muted);margin-top:2px}
```
替换为：
```css
.count-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-2)}
.count-card{text-align:center;padding:var(--space-2) var(--space-1);border-radius:var(--radius-sm);background:var(--surface-3)}
.count-num{font-size:var(--text-xl);font-weight:700}
.count-label{font-size:var(--text-xs);color:var(--muted);margin-top:2px}
```

- [ ] **Step 4: 卡片标题加图标 + 空态优化**

将 `<div class="card-title">工具使用统计</div>` 改为：
```html
<div class="card-title"><span class="card-icon">${getIcon("tool")}</span>工具使用统计</div>
```

将空态：
```html
'<div style="color:var(--muted);text-align:center;padding:24px 0">暂无工具使用数据</div>'
```
替换为（带图标 + 文案）：
```html
`<div style="display:flex;flex-direction:column;align-items:center;gap:var(--space-2);color:var(--muted);text-align:center;padding:var(--space-6) 0">
  <span style="opacity:.5;display:inline-flex">${getIcon("tool")}</span>
  <div style="font-size:var(--text-sm)">暂无工具使用数据</div>
</div>`
```

- [ ] **Step 5: 编译验证**

Run: `npm run compile`
Expected: 通过。

- [ ] **Step 6: 手动验证**

`F5` 打开面板，确认：
- 每根柱子右侧出现「计数 + 占比%」。
- 计数卡片略缩小。
- 标题前出现工具图标。
- 切到无工具数据的场景（如新账号），确认空态带图标。

- [ ] **Step 7: 提交**

```bash
git add src/views/UsagePanel.ts
git commit -m "style(views): 工具柱状图加占比、计数卡片缩小、空态优化"
```

---

## Task 8: 趋势折线图增强（网格线 / 单位 / 数据点 / tooltip）

**Files:**
- Modify: `src/views/UsagePanel.ts`（`generateLineChartSection` + 趋势卡 HTML/CSS）

- [ ] **Step 1: 卡片标题加图标与网格线虚线样式**

将 `.trend-card` 区域 CSS 末尾追加：
```css
.trend-grid-line{stroke:var(--border);stroke-width:.5;stroke-dasharray:2 3}
.trend-point{fill:var(--bg)}
.trend-title{display:flex;align-items:center;gap:var(--space-2)}
```
并将原 `.trend-title{font-size:13px;font-weight:600}` 改为 `.trend-title{font-size:var(--text-md);font-weight:600;display:flex;align-items:center;gap:var(--space-2)}`。

将趋势卡标题 HTML：
```html
<div class="trend-title">Token 用量趋势</div>
```
改为：
```html
<div class="trend-title"><span class="card-icon">${getIcon("trend")}</span>Token 用量趋势</div>
```

- [ ] **Step 2: Y 轴网格线改虚线 + 顶部单位标注**

在 `generateLineChartSection` 中，将 Y 轴刻度循环生成的 `<line ...>`：
```typescript
yAxisSvg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
```
改为使用虚线 class：
```typescript
yAxisSvg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" class="trend-grid-line"/>`;
```

并在 Y 轴最顶端加单位标注。在 `yAxisSvg` 循环**之前**插入：
```typescript
yAxisSvg += `<text x="${padL}" y="${padT - 4}" text-anchor="start" fill="var(--muted)" font-size="9">Token</text>`;
```

- [ ] **Step 3: 数据点 + tooltip**

在 `lines` 生成逻辑中，每个模型除 `<polyline>` 外，再为每个数据点加带 `<title>` 的小圆点。将：
```typescript
const lines = sortedModels
  .map((m, idx) => {
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const points = m.tokensUsage
      .map((v, i) => {
        const x = padL + i * xStep;
        const y = yScale(v);
        return `${x},${y}`;
      })
      .join(" ");
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
  })
  .join("\n");
```
替换为：
```typescript
const lines = sortedModels
  .map((m, idx) => {
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const points = m.tokensUsage
      .map((v, i) => {
        const x = padL + i * xStep;
        const y = yScale(v);
        return `${x},${y}`;
      })
      .join(" ");
    // 每个数据点：小圆点 + 原生 tooltip（日期 + 模型 + 数值）
    const dots = m.tokensUsage
      .map((v, i) => {
        const x = padL + i * xStep;
        const y = yScale(v);
        const tip = `${xTime[i]} · ${m.modelName} · ${formatTokenCount(v)}`;
        return `<circle cx="${x}" cy="${y}" r="2.5" fill="${color}" stroke="var(--bg)" stroke-width="1"><title>${tip}</title></circle>`;
      })
      .join("");
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>${dots}`;
  })
  .join("\n");
```

- [ ] **Step 4: 编译验证**

Run: `npm run compile`
Expected: 通过。

- [ ] **Step 5: 手动验证**

`F5` 打开面板，切换到「最近 7 天 / 30 天」让趋势图出现，确认：
- 水平网格线为虚线。
- Y 轴顶部出现「Token」单位。
- 每个数据点有小圆点；鼠标悬停出现 tooltip（日期 + 模型 + 数值）。
- 标题前出现趋势图标。
- light/dark 主题下点描边色（`var(--bg)`）与背景一致，形成「中空」效果。

- [ ] **Step 6: 运行测试**

Run: `npm run pretest && npm test`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add src/views/UsagePanel.ts
git commit -m "feat(views): 趋势折线图加虚线网格、单位标注、数据点与 tooltip"
```

---

## Task 9: 响应式断点与最终打磨

**Files:**
- Modify: `src/views/UsagePanel.ts`（`@media` 段 + 头部图标 + 全局字号）

- [ ] **Step 1: 头部套餐图标与字号**

将 `.title` CSS：
```css
.title{font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px}
```
改为：
```css
.title{font-size:var(--text-lg);font-weight:700;display:flex;align-items:center;gap:var(--space-2)}
.title-icon{display:inline-flex;color:var(--accent)}
```

将头部标题 HTML：
```html
<div class="title">GLM 套餐${levelText ? ` <span class="level-badge">${escapeHtml(levelText)}</span>` : ""}</div>
```
改为：
```html
<div class="title"><span class="title-icon">${getIcon("quota")}</span>GLM 套餐${levelText ? ` <span class="level-badge">${escapeHtml(levelText)}</span>` : ""}</div>
```

- [ ] **Step 2: 响应式断点重构**

将底部媒体查询：
```css
@media(max-width:600px){
  .main-grid{grid-template-columns:1fr}
  .quota-bar{flex-direction:column;align-items:flex-start;gap:6px}
}
```
替换为三档断点：
```css
/* 中宽：主网格保持双列，配额条横排 */
@media(max-width:760px){
  .main-grid{grid-template-columns:1fr}
}
/* 窄宽：配额条堆叠为多行 */
@media(max-width:480px){
  .quota-bar{flex-direction:column;align-items:flex-start;gap:var(--space-2)}
  .donut-chart{width:170px;height:170px}
}
```

- [ ] **Step 3: body 基础字号用令牌**

将 `body{...font-size:12px;line-height:1.5;padding:16px;...}` 中的硬编码替换为令牌：
```css
font-size:var(--text-base);line-height:1.5;padding:var(--space-4);
```

- [ ] **Step 4: 编译验证**

Run: `npm run compile`
Expected: 通过。

- [ ] **Step 5: 手动验证**

`F5` 打开面板，逐档拉宽/拉窄 webview：
- 宽（>760px）：主网格双列，配额条横排。
- 中（480–760px）：主网格堆叠为单列，配额条仍横排。
- 窄（<480px）：配额条堆叠为多行，环形图缩小。
- 标题前出现套餐图标。

- [ ] **Step 6: 运行全部测试**

Run: `npm run pretest && npm test`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add src/views/UsagePanel.ts
git commit -m "style(views): 响应式断点重构与头部图标打磨"
```

---

## Definition of Done

- [ ] 全部 9 个 Task 完成，每个都有独立提交。
- [ ] `npm run compile` 无类型错误。
- [ ] `npm test` 全绿（含新增 `panelUtils Tests`）。
- [ ] 在 VSCode 开发宿主中，light / dark 双主题下外观符合设计文档。
- [ ] today / last7Days / last30Days 三个时间范围均正常渲染。
- [ ] 窄宽（<480px）响应式堆叠正常。
- [ ] 空数据场景（断网 / 新账号）空态友好。
- [ ] 设计文档 `docs/superpowers/specs/2026-07-07-ui-redesign-design.md` 中列出的所有「目标」均可在成品中观察到。
