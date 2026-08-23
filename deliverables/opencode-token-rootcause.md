# Smart Dashboard Token 用量卡「OpenCode 直接对话消耗缺失」根因分析报告

> 调查日期：2026-08-24
> 调查方式：全部结论基于对 `C:/Users/华为/.local/share/opencode/opencode.db`（mode=ro 只读连接）的实际 SQL 查询、`collect_usage.py` / `main.ts` / `collect_subscriptions.py` 源码阅读、以及 `usage_daily.json` 实际数据比对。所有数字均为亲自运行查询所得，无推测编造。

---

## 一、背景

- 插件源码：`D:/workspace/01_Projects/obsidian-smart-dashboard/`
  - `collect_usage.py` 采集数据 → 输出 `D:/Obsidian Vault/Obsidian Vault/.smart-dashboard/usage_daily.json`（schema_version=5）
  - `main.ts` 渲染 Token 卡（`renderUsageArea`，main.ts:3231）
- `parse_opencode()`（collect_usage.py:335-378）读取 opencode.db 的 **session 表**，聚合 `time_created, tokens_input, tokens_output, tokens_cache_read, tokens_reasoning, tokens_cache_write`，**按 `time_created`（会话创建时刻）归日**，全部 session 不分 provider 汇总进 json 的 `"opencode"` 字段。
- 用户疑问：Token 卡的 opencode 消耗似乎只反映「Hermes 调用 opencode」的量；用户自己在 opencode TUI 直接对话的消耗没反映出来（或明显偏低）。

---

## 二、DB 结构与脚本逐项排查证据

### 2.1 库里有哪些表

```
sqlite_master 共 26 张表，核心：
  session          会话级聚合（含 tokens_* 五列）   ← parse_opencode 唯一数据源
  message          消息级明细（data 列为 JSON，内含逐条 tokens）
  part             消息片段
  project / workspace / account / event / todo ...
```

关键表结构：

```sql
PRAGMA table_info(session);
-- id, project_id, parent_id, slug, directory, title, version,
-- time_created(ms), time_updated(ms), workspace_id, path, agent,
-- model(TEXT! JSON 串), cost,
-- tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
-- metadata

-- message.data (JSON) 实样（assistant 消息）：
{ "role":"assistant", "providerID":"opencode-go", "modelID":"mimo-v2.5",
  "tokens": {"total":14891,"input":4621,"output":30,"reasoning":0,
             "cache":{"write":0,"read":10240}},
  "cost":0.000684012,
  "time":{"created":1787139942216,"completed":1787139951435}, ... }
```

> 即 token 同时存在于两处：**session 级累计** 和 **message 级逐条**。二者关系见 §2.6（完全守恒）。

### 2.2 疑问1：不同 providerID 的会话是否都带 token？——是（除空会话）

```sql
SELECT json_extract(model,'$.providerID') pv,
       COUNT(*), SUM(tokens_input), SUM(tokens_output),
       SUM(tokens_cache_read), SUM(tokens_cache_write), ROUND(SUM(cost),4)
FROM session GROUP BY pv;
```

| providerID | 会话数 | Σ input | Σ output | Σ cache_read | Σ cost |
|---|---|---|---|---|---|
| opencode（native 免费） | 267 | 30,803,949 | 2,140,253 | 271,380,914 | ~0.34 |
| opencode-go（付费网关） | ~103 | 19,822,473 | 1,549,658 | 395,626,846 | ~23.78 |
| deepseek（直连 API） | 93 | 19,470,351 | 2,118,744 | 737,889,088 | ~11.43 |
| uniapi / ollama / google / NULL | 少量 | ≈0（ollama 仅 8192） | | | |

opencode-go 的有值会话对应模型：`deepseek-v4-flash`(61 个会话/16.0M in)、`deepseek-v4-pro`(12/3.4M in)、`mimo-v2.5`(17)、`minimax-m3`(2+1)、`qwen3.7-plus`(1) 等——**本地库确实记了 go 网关会话的 token**。

### 2.3 疑问3：go 网关消耗是否只记在远端？——否，本地就有

- 本地 db 中 providerID=opencode-go 且 token 有值的会话，其 directory 分布在 `D:/Hermes/**`（如 `D:/Hermes/work/xhs_kanban`、`D:/Hermes/repo-build`）和少量 `D:/workspace` —— 这些是 **Hermes 通过 `opencode run` CLI 委派产生的会话**。
- 而 **用户在 TUI 直接发起的 go 模型调用基本全是失败空会话**：

```sql
SELECT id, title, /* message 数与消息级 token */ ...
FROM session WHERE pv='opencode-go' AND tokens_input=0 AND tokens_output=0;
-- 结果（最近 8 条）：msgs=0~1, msg_in=0，title 全是默认值
--   'New session - 2026-08-21T15:50:27.405Z' 等
-- 对应 08-21 C:/Users/华为 下 6 个 build 会话 + D:/Hermes/work/xhs_kanban 1 个
```

即：用户直接用 go 模型对话的那几次**请求本身失败了（0-1 条消息、无 assistant 回复）**，没有产生可统计的消耗，而不是"消耗记到远端去了"。远端 usage API 见 §2.7。

### 2.4 疑问4：能否区分「Hermes 委派」vs「TUI 直接对话」？

逐字段检查结论：

| 字段 | 能否区分 | 依据 |
|---|---|---|
| `directory` | ✅ 最可靠 | Hermes 委派 = `D:/Hermes/**`（工作目录由委派方 cwd 决定）；TUI 直接对话 = `C:/Users/华为`、`C:/Users/华为/Desktop/**` 等用户手动启动目录 |
| `title` | ✅ 辅助 | Hermes 委派标题是任务名（"知识库并卡执行…"）；TUI 是聊天首句（"模型身份询问"、"电脑本地大模型推荐"）；失败空会话是默认 `'New session - ISO时间'` |
| `parent_id` | 部分 | 78/457 非空 = 子代理/subagent 会话，两类来源都可能有 |
| `agent` | ❌ | 只是模式（build/plan/general/explore），与发起方无关 |
| `metadata` | ❌ | 抽样全为 NULL |
| `workspace` 表 | ❌ | 空表 |

### 2.5 核心排查：脚本到底漏了什么？——不漏读，但**日期归属错误**

`parse_opencode()` 无 provider/directory 过滤，TUI 会话只要库里有 token 就会被读到。验证卡片值 vs 库中真实值：

**usage_daily.json 现状（updated_at: 2026-08-24T00:24:44）：**

| 日期 | 卡片 opencode.input | calls |
|---|---|---|
| 2026-08-22 | 14,551,392 | 86 |
| 2026-08-23 | 620,981 | 13 |
| 2026-08-24 | 64,480 | 1 |

**按消息完成时间还原的真实每日消耗（message 表，全 provider）：**

```sql
SELECT date(json_extract(data,'$.time.completed')/1000,'unixepoch','localtime') d,
       SUM(json_extract(data,'$.tokens.input')), COUNT(*)
FROM message WHERE json_extract(data,'$.role')='assistant'
GROUP BY d ORDER BY d DESC;
```

| 日期 | 真实 input（消息级） | 卡片显示 | 卡片/真实 |
|---|---|---|---|
| 08-24 | **2,142,501** | 64,480（且是凌晨快照） | **≈3%** |
| 08-23 | **5,607,511** | 620,981 | **≈11%** |
| 08-22 | 8,481,563（当日真实发生额） | 14,551,392 | 虚高 172% |

**元凶实锤——跨天长会话：**

```sql
SELECT date(time_created/1000,'unixepoch','localtime') cd,
       date(time_updated/1000,'unixepoch','localtime') ud,
       directory, agent, SUM(tokens_input)
FROM session WHERE time_updated-time_created > 12*3600*1000
GROUP BY cd ORDER BY SUM(tokens_input) DESC LIMIT 3;
-- ('2026-08-22','2026-08-24','C:/Users/华为','plan', 8,508,739)  ← 用户 TUI 长会话
```

该 plan 会话（directory=C:/Users/华为，典型用户直接对话）按天拆解其消息级消耗：

| 实际发生日 | 当日消息级 input | 但 parse_opencode 把它计入哪天 |
|---|---|---|
| 08-22 | 1,572,889 | 全部 8,508,739 计入 **08-22** |
| 08-23 | 4,932,808 | （08-23 记 0） |
| 08-24 | 2,003,042 | （08-24 记 0） |

因为 `parse_opencode()` 用 `time_created` 归组、而 session 表的 `tokens_*` 是**随会话推进不断增长的累计值**，导致：
1. 长对话的全部消耗被记到**创建当天**，之后每天显示≈0；
2. 每次重新采集时 `merge_days` 是**整条替换**该日记录（collect_usage.py:393-398），创建日的数值还会随会话增长**追溯性虚涨**（json 里 08-22 从 00:24 快照的 14,551,392 涨到现在重算的 15,470,305）。

而 **Hermes 委派会话都是分钟级短命会话**（前 13 大跨天会话全部来自 `C:/Users/华为`，无一条 `D:/Hermes/**`），日期归属天然准确——所以卡片上"Hermes 的量看起来是对的"，"自己聊天的量不见了"，形成用户观察到的现象。

**次要因素：采集时机。** Token 卡只在点击 🔄 时才 exec 运行 `collect_usage.py`（main.ts:3247-3251），无任何定时刷新。json 最后更新于 08-24 00:24:44，当天白天新增的 200 万+ input 全部不在卡上。

### 2.6 口径守恒验证（方案可行性前提）

```sql
-- session 级总和 vs message 级总和（五项指标逐一对比）：
session : (70715857, 5829776, 1406600912, 2150273, 628973)
message : (70715857, 5829776, 1406600912, 2150273, 628973)   -- 完全一致
```

证明：`session.tokens_*` 就是其全部 assistant 消息 tokens 的累计和，**既无重复计数也无丢失**。因此把归组键从 session 创建时间换成 message 完成时间，总量分毫不差、只是日期摆正。（12204 条 assistant 消息中仅 21 条缺 `time.completed`，可用 `time.created` 兜底。）

### 2.7 远端 OpenCode Go usage API 能否补充每日数据？——不能

- `~/.local/share/opencode/auth.json` 存在，含 `opencode-go -> {key,type}`，API 可用；
- 但 `GET https://opencode.ai/zen/go/v1/usage` 返回的是**配额窗口百分比**：`usage.{rolling,weekly,monthly}.{percent,resetsAt,status}`（见 collect_subscriptions.py:157-193，subscriptions 卡已在用）。**没有按日 token 序列**，无法用于 Token 卡的每日柱状图。
- 且本地 db 已镜像 go 会话的 token 与 cost（§2.2/§2.3），无需远端补数。

---

## 三、根因判定

对四个候选逐一裁定（附证据编号）：

| 候选 | 裁定 | 证据 |
|---|---|---|
| ① 本地 db 只记 native、go 会话只记远端 | **排除** | go 会话在本地库 token/cost 齐全（§2.2）；远端 API 只有配额百分比（§2.7）；用户直接调 go 失败是空会话而非"记到远端"（§2.3） |
| ② db 记了但 parse_opencode 遗漏 | **✅ 主因（变体）** | 脚本确实读了所有行，但按 `time_created` 归日 → 跨天长会话（几乎全是 TUI 直接对话）全部消耗记进创建日，"今天/昨天"显示≈0、创建日追溯虚涨（§2.5） |
| ③ 直接对话根本没写本地 | **排除** | TUI 会话（C:/Users/华为）大量存在且有完整 token（08-22 单 plan 会话 850 万 input 都写进了库）；旧版遗留 storage/ 目录仅剩 migration/session_diff，非用量数据 |
| ④ 其他 | **✅ 次因** | 采集仅由 🔄 手动触发，无定时任务，"今天"数据严重滞后（json updated_at=00:24，白天新增 214 万 input 不在卡上） |

**一句话根因：用户直接对话的 token 其实全都写进了本地 opencode.db 也被脚本读到了，但 `parse_opencode()` 以会话创建时间为归组键、以会话级累计值为数值，导致跨天的 TUI 长会话把几百上千万 token 全记到创建那天，之后的日期显示接近零；叠加卡片只在手动刷新时才重采，最终呈现出"只有 Hermes（短会话）统计得准、自己聊天的不见了"的假象。**

---

## 四、修复方案

### 方案 A（推荐）：`parse_opencode()` 改为按 message 表逐消息归日

改动点：collect_usage.py 的 `parse_opencode()` 一个函数，查询替换为：

```python
cur = conn.execute("""
    SELECT date(COALESCE(
               json_extract(data,'$.time.completed'),
               json_extract(data,'$.time.created')) / 1000,
               'unixepoch','localtime') AS d,
           SUM(json_extract(data,'$.tokens.input')),
           SUM(json_extract(data,'$.tokens.output')),
           SUM(json_extract(data,'$.tokens.cache.read')),
           SUM(json_extract(data,'$.tokens.reasoning')),
           SUM(json_extract(data,'$.tokens.cache.write'))
    FROM message
    WHERE json_extract(data,'$.role') = 'assistant'
      AND COALESCE(json_extract(data,'$.time.completed'),
                   json_extract(data,'$.time.created')) IS NOT NULL
    GROUP BY d
""")
```

实测该 SQL 输出（近几日）：08-24 → 2,142,501 in / 585 万 cache；08-23 → 5,607,511；08-22 → 8,481,563——与"真实每日消耗"完全吻合。
- **代价**：极低，单函数改动；db 1.6GB，message 表全扫描实测秒级完成，采集本就是手动触发，可接受。
- **准确性**：§2.6 已证总量守恒（与现口径五项总和一字不差），只修正日期归属；`merge_days` 整条替换语义不变，历史日期每次重算自动收敛，不再追溯虚涨。
- 注意：`WHERE tokens_input>0 OR tokens_output>0` 这类过滤不再需要（消息级天然过滤空记录）。

### 方案 B（可选增强）：区分展示 Hermes 委派 vs 直接对话

在同一函数加一个维度即可（§2.4 已验证 directory 可靠）：

```sql
CASE WHEN directory LIKE 'D:/Hermes%' THEN 'delegate' ELSE 'interactive' END
```

输出拆成 `opencode` / `opencode_user` 两个 key（或 json 内子字段），Token 卡分组渲染。**代价**：需同步改 main.ts 渲染与合并逻辑（allTotalWithCache / cacheStats / dailyTokens 三处，main.ts:3333-3428）；**准确性**高。

### 方案 C（必做的小修）：定时自动采集

在 plugin `onload` 里 `setInterval`（如每 30 分钟）exec 一次 `collect_usage.py --quiet`，或在打开面板时若 `updated_at` 距今 >N 分钟则自动后台重采。**代价**：几行代码；解决"当天数据滞后到凌晨"问题。

### 方案 D（不建议）：接 OpenCode Go usage API 补数

API 仅返回 rolling/weekly/monthly 配额百分比（§2.7），无按日序列，无法支撑每日 Token 卡；本地 db 数据已完备。仅适合继续留在 subscriptions 配额卡使用。

### 组合建议

**A + C 立即做**（一个函数改动 + 定时器，彻底修正日期归属与滞后）；B 视需求追加。另留一个遗留疑点备查：hermes 源（agent.log 直连 go 网关的调用）与 opencode 源（CLI 委派会话）理论上是两条互斥链路，但建议后续抽一天的数据交叉核对一次，确认无同一次调用双计。

---

## 附：本次调查运行的关键命令清单

1. `sqlite3.connect('file:...opencode.db?mode=ro', uri=True)` + `sqlite_master` 全表清单
2. `PRAGMA table_info(session/message/part/project/session_message)`
3. `GROUP BY json_extract(model,'$.providerID')` 的 session 级 / message 级 token 总和对比
4. 零 token go 会话的消息数核查（0-1 条，无 assistant 回复）
5. 跨天会话 TOP 排行 + 08-22 plan 会话按日消息级拆解
6. usage_daily.json 近 7 日 opencode 字段读取与对比
7. message 级按完成日 GROUP BY（方案 A 验证）+ 总量守恒校验
8. auth.json 键结构、`fetch_opencode_go()` 返回结构阅读、main.ts 采集触发点定位
