# 计划：Token 用量卡新增"缓存命中率（历史累计）"

> 状态：仅调查 + 计划，未改动任何源码（main.ts / collect_usage.py / styles.css 均未动）。

---

## 一、现状：现有缓存命中率怎么算的（main.ts）

### 代码位置
| 位置 | 内容 |
|---|---|
| `main.ts:3402-3413` | 渲染：`bottomRow`（`.sd-usage-bottom-row`）内右侧 `rateLine`（`.sd-usage-cache-rate`），文本 `'缓存命中 ' + rateStr` |
| `main.ts:3410` | `const cs = this.cacheStats(days, monthKey);` — **注意：前缀是 monthKey（"YYYY-MM"），即现有命中率实际是"本月"口径，不是"当天"** |
| `main.ts:3411` | 公式：`(cs.hit + cs.miss) > 0 ? (cs.hit / (cs.hit + cs.miss) * 100).toFixed(3) + '%' : '—'` |
| `main.ts:3470-3511` | `cacheStats(days, prefix)`：按 `k.startsWith(prefix)` 过滤日期，六源累加 hit/miss（各源口径见函数注释 3471-3477 行） |

### 现有口径（cacheStats 内部，已统一为 命中/(命中+未命中)）
- hermes：`hit = min(cache, input)`，`miss = input - cache`（input 含命中）
- dsh / opencode / workbuddy / codebuddy / codex：`hit = cache`，`miss = input`（采集时 input 已折算为未命中值，见下）

### 渲染位置与布局
- 卡片：`#sd-usage-section`，2x1（`styles.css:181` `.sd-size-2x1 { grid-column: span 2; grid-row: span 1; }`），**h=1 高度受限，不可加新行**。
- 底部行 `styles.css:913`：flex 左 `.sd-usage-summary`（flex:1）右 `.sd-usage-cache-rate`（11px，右对齐），同一行空间有限。

> ⚠️ 需求描述为"当天口径之外"，但代码里现显示的是**本月**命中率（prefix=monthKey）。本计划按"保留现有（月）+ 新增累计（全历史）"处理；如确需"当天"口径，只需把现有调用 prefix 改为 `today`，但那会改变现有展示，默认不做。

---

## 二、数据源 usage_daily.json 结构（collect_usage.py 生成）

路径：`D:/Obsidian Vault/Obsidian Vault/.smart-dashboard/usage_daily.json`（`collect_usage.py:48`）

```jsonc
{
  "schema_version": 6,          // collect_usage.py:524
  "updated_at": "YYYY-MM-DDTHH:MM:SS",
  "days": {                     // 每天一条，键为 "YYYY-MM-DD"，全历史保留
    "2026-08-30": {
      "hermes":    { "input", "output", "cache", "calls" },                    // collect_usage.py:115
      "dsh":       { "input", "output", "cache" },                             // :177
      "opencode":  { "input", "output", "cache", "reasoning", "cache_write", "calls" },  // :469
      "workbuddy": { "input", "output", "cache", "reasoning", "calls" },       // :246-248
      "codebuddy": { "input", "output", "cache", "reasoning", "calls" },       // :324-326
      "codex":     { "input", "output", "cache", "reasoning", "calls" }        // :406-408
    }
  }
}
```

要点：
1. **每天一条、全历史累积**：`load_existing`（:484-493）读回 schema_version ∈ {3,4,5,6} 的旧 `days`，`merge_days`（:496-501）按日期覆盖合并，历史天不丢。
2. **没有现成的"历史累计"字段**——days 里只有逐日明细，无 totals 节点。
3. 字段口径（采集时已折算）：
   - workbuddy/codebuddy/codex：`input` = `max(0, inputTokens - cached)`（已扣掉 cache，cache_read 单存于 `cache`），codex 的 `cache_write_input_tokens` 被忽略（:356-359）。
   - dsh：`input` 不含 `cacheReadTokens`；opencode：`input` 不含 `tokens.cache.read`（另有 `cache_write` 字段但 main.ts 未消费）。
   - hermes：`input` **包含** cache（例外，cacheStats 里已用 min/max 处理）。
4. 因此**总命中率无需改 collect_usage.py**：直接在插件端把 `days` 全部日期的 cache/input 字段按 cacheStats 同一套口径累加即可。opencode 的 `cache_write` 维持现状不参与（与现有月口径一致，遵守口径统一）。

---

## 三、方案

### 计算公式（口径统一铁律）
复用现有 `cacheStats`，同一函数、同一公式，仅换过滤前缀：

```
总命中率 = Σ_hit / (Σ_hit + Σ_miss) × 100%
其中 Σ 遍历 days 中全部日期（prefix = ''），hit/miss 按六源口径同 main.ts:3479-3511
```

**不需要新增计算函数**。改法二选一（推荐 A）：

- **方案 A（推荐，零新增函数）**：`cacheStats` 的 `prefix` 参数传 `''`。当前实现 `if (prefix && !k.startsWith(prefix)) continue;`（main.ts:3482）——`prefix` 为空串时 falsy、不过滤，天然就是全历史累计。改动仅是渲染处多调一次。
- 方案 B：显式改判断为 `if (prefix !== undefined && !k.startsWith(prefix))`——无必要，A 已满足。

### 展示（不破坏 2x1 / h=1）
- 位置：仍在本月热力图下方的 `bottomRow`（main.ts:3404-3413）右侧 `rateLine`，**不加新行、不动占格**。
- 文案改为双指标一行（紧凑格式，11px 右对齐）：

```ts
const csMonth = this.cacheStats(days, monthKey);
const csAll   = this.cacheStats(days, '');            // '' = 全历史
const rate = (cs: {hit:number;miss:number}) =>
  (cs.hit + cs.miss) > 0 ? (cs.hit / (cs.hit + cs.miss) * 100).toFixed(3) + '%' : '—';
rateLine.setText('命中(月) ' + rate(csMonth) + ' ｜ 累计 ' + rate(csAll));
```

- 宽度评估：`命中(月) 99.912% ｜ 累计 98.765%` ≈ 34 字符 × ~5.5px ≈ 190px。左侧 summary（本周/累计明细）为 flex:1 且 `min-width:0`（styles.css:909），有挤压风险；若溢出，兜底把 rateLine 的字号降到 10px 或把文案缩为 `月 99.9% ｜ 累 98.8%`（toFixed(1)）。**先按 toFixed(3) 全精度实现，验收时确认无裁剪再定是否降精度。**
- `hit+miss === 0`（无任何缓存数据）时整体显示 `命中(月) — ｜ 累计 —`。
- 口径统一：两个百分比出自同一 `cacheStats`、同一公式，仅统计窗口不同（本月 / 全部日期），符合铁律。

---

## 四、collect_usage.py schema 确认结论

- **支持，且无需改动**。逐日明细已含全部所需字段（`input`、`cache`），历史天永久保留在 `days` 中，累计可在插件端实时求和。
- 不新增 totals 节点：避免双份累计数据源（JSON 里存一份、插件算一份）造成口径漂移；且 `schema_version` 不用升级（不动 :489 的版本白名单）。

---

## 五、改动点清单

| # | 文件 | 位置 | 改动 |
|---|---|---|---|
| 1 | main.ts | :3410-3413（renderUsageBody 底部行） | 把单次 `cacheStats(days, monthKey)` 改为两次调用（`monthKey` 与 `''`），rateLine 文案改为 `命中(月) X% ｜ 累计 Y%`；抽出局部 `rate()` 小函数消重复（仅此一处用，不另建类方法） |
| 2 | main.ts | :3479-3482（cacheStats） | **不改**（prefix='' 天然全量）；仅在注释 :3471 处补一行"`prefix='' 表示全历史累计`" |
| 3 | collect_usage.py | — | **不改** |
| 4 | styles.css | — | **不改**（先验验收，溢出才考虑降字号/缩文案，届时再单独立项） |

---

## 六、验收方式

1. `npm run build`（esbuild）无报错。
2. 重载插件，打开 Smart Dashboard，确认 2x1 Token 卡底部行显示 `命中(月) xx.xxx% ｜ 累计 xx.xxx%`，无换行、无裁剪、卡片不溢出（h=1）。
3. 数值核对（口径验证）：用脚本对 `usage_daily.json` 手工求和比对——
   ```python
   # 全历史：hit = Σ(dsh.cache + opencode.cache + workbuddy.cache + codebuddy.cache + codex.cache + min(hermes.cache, hermes.input))
   #        miss = Σ(dsh.input + opencode.input + workbuddy.input + codebuddy.input + codex.input + max(0, hermes.input - hermes.cache))
   # 月度：同样公式但仅 k.startswith('YYYY-MM')；两值应与卡片显示一致（小数 3 位）
   ```
4. 边界：删除/改名月度日期键或空 days 时显示 `—` 而非 NaN；刷新按钮（🔄）重渲染后两值仍在。
5. 回归：卡片"本月消耗 / 今日 / 本周 / 累计"数字与改动前一致（本方案未触碰这些路径）。

---

*计划文件路径：D:/workspace/01_Projects/obsidian-smart-dashboard/HANDOFF_cache_total_hitrate_plan.md*
*调查时间：2026-09-01；依据 main.ts、collect_usage.py、styles.css 当前版本。*
