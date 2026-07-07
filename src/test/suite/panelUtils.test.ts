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
