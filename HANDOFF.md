# 🚀 项目交接文档 (HANDOFF.md) — HANDOFF — Smart Dashboard v4.9.6：修复体育卡 `(+N)` 时间解析（拜仁不显示）

> **更新文件**：本文件为 Smart Dashboard（Obsidian 插件 `obsidian-smart-dashboard`）的版本交接文档，记录 **v4.6.1 → v4.9.6** 共 11 个版本的连续变更（多会话完成）。严格套用《06_项目交接文档模板》8 节结构与 [[10_项目交接与上下文维持工作流]]。

---

## 🏷️ 版本变更总览 (v4.6.1 → v4.9.6 CHANGELOG)

| 版本 | 主题 | 核心变更 | 类型 |
| :--- | :--- | :--- | :---: |
| **v4.9.6** | 体育卡 `(+N)` 时间解析双修复 | ① `(+1)` 周期时间去掉后缀后尾部残留空格未 trim → moment 判 Invalid → 拜仁整条联赛不显示，修复=加 `.trim()`+`/\s+/`；② 更正 `(+N)` 语义：`datetime` 存的是**北京时间最终值**，`(+1)` 仅"跨天"说明标记，原 `parseDt` 误将 `(+N)` 当作"再加 N 天"导致所有带 `(+N)` 的比赛**多显示一天**（拜仁14/森林5/F1 5场），修复=删除 `plusDay`/`d.add`，直接 `return d` | 🐛 修复 |
| **v4.9.5** | 布局快照修复 | `setLayoutSize` 切档前深拷贝源档布局到 `layoutSmall`/`layoutBig`、深拷贝载入目标档快照；`resetLayout` 改为恢复当前档快照（无则出厂默认）且 `cardLayout` 不再清空；`reflowLayoutForVisibleCards` 加"已合法则跳过重排"早返回；设置页文案更新 | 🐛 修复 |
| **v4.7.0** | 小红书看板灵感九项落地 | Hero 欢迎区 / 统计六格 / 待办优先级 / 随笔写入日记 / D-Day 倒计时卡 / 日记跳转 / 导航入口卡 / 四套主题皮肤 /（全库热力图后删除） | ✨ 新增 |
| **v4.8.0** | 周期日程待办 + 节日节气 | 日程/待办 `repeat` 周期字段；公历节日+二十四节气进日历与倒计时；日程逐条天数徽章；倒计时卡只显最近三个 | ✨ 新增 |
| **v4.8.1** | 移除全库活动热力图卡 | 代码 + data.json 全量清除 | 🗑️ 删除 |
| **v4.8.2** | 6 列 × 4 行布局 | DEFAULT_LAYOUT 与 data.json 双重重排（用户口径「4*6」实指 6 列×4 行） | 🔧 重构 |
| **v4.9.0** | 正方形格子 + Hero 行合并 | 列定义弃用 `1fr` 改 `var(--sd-cell)`；宽屏固定 6 列；标题栏并入欢迎行 | 🔧 重构 |
| **v4.9.1** | 拖拽修复 | `getGridMetrics` 增加 `offsetX` 补偿 `justify-content:center` 居中偏移 | 🐛 修复 |
| **v4.9.2** | 体育赛事卡片 + 布局放大 | 新增 `sd-sports-section`（F1/英超诺丁汉森林/德甲拜仁最近一场）；gap 12→8、网格吃满 padding、hero 压扁、scale 0.56→0.60（cell 167→180px） | ✨ 新增 |
| **v4.9.3** | Token 卡 opencode 消耗归日修复 | `parse_opencode()` 改读 message 表按 `time.completed` 归日，修复跨天长会话消耗堆叠到创建日、之后日期显示≈0 的 bug | 🐛 修复 |
| **v4.9.4** | 卡片大小/布局设置 | 设置页新增「卡片大小/布局」下拉：小=6×4 紧凑（默认，现状不变）/ 大=4 列可滚动；新增 `layoutSize` 持久化字段（合并保存，切换时清空 cardLayout 触发重排）；每卡 w/h 占格数铁律不动，仅按 4 列重排 x/y | ✨ 新增 |

**本次变更涉及文件**：`main.ts` / `main.js` / `manifest.json` / `package.json` / `HANDOFF.md` / `HANDOFF_layoutsize_fix_plan.md`。

---

## 🩹 v4.9.6 本次修复说明（体育卡 `(+N)` 时间解析 · 双修复）

**疗程概览**：同一 `parseDt` 暴露了两处 `(+N)` 相关 bug，用户分两次上报、两次修复：(A) 拜仁整条不显示；(B) 修复 A 后拜仁显示了但时间**多一天**。

### 修复 A：带 `(+N)` 场次整条不显示（尾随空格 → Invalid）

**症状**：体育卡只显示诺丁汉森林与 F1，拜仁（全部场次带 `(+1)`）整条不显示。

**根因**：`renderSportsArea` 的 `parseDt`：`const d = moment(dt.replace(/\(\+\d+\)/, '').replace(' ', 'T'))`。去掉 `(+N)` 后字符串**末尾残留一个空格**，但 `.replace(' ', 'T')` 只替换**第一个**空格（"MM-DD HH:mm" 中间那个），拼出 `"2026-08-29T02:30 "`（**带尾随空格**）→ moment 判 Invalid → `parseDt` 返回 `null` → 拜仁所有场次被 `.filter(x => x.dt && ...)` 滤掉 → `if (!upcoming.length) continue` 整条联赛跳过。F1/森林多数比赛不带 `(+1)`，故正常。

**修复 A**：`.replace(' ', 'T')` 前加 `.trim()`、空格替换改 `/\s+/`：
```ts
const d = moment(dt.replace(/\(\+\d+\)/, '').trim().replace(/\s+/, 'T'));
```

### 修复 B：带 `(+N)` 场次时间多一天（`(+N)` 被误当加天）

**症状**：用户发现拜仁首轮实际北京时间应为 8/29 02:30，卡片却显示 8/30 02:30，多一天。

**根因**：数据本身是对的——按 `sports-data-verification.md` 约定，`datetime` 字段存**北京时间最终值**，`(+1)` 后缀仅是"跨天"说明标记（该北京时间日期 > 比赛当地时间日期），**不是要再加一天**。但 `parseDt` 原文：
```ts
return plusDay ? d.add(parseInt(plusDay[1], 10), 'day') : d;
```
把 `(+N)` 误当作"在此时间基础上加 N 天"→ 所有带 `(+N)` 的比赛多显示一天：拜仁全部 14 场 + F1 5 场（美/墨/圣保罗/拉斯维加斯/卡塔尔）+ 森林 5 场（赫尔城/纽卡/伯恩茅斯/富勒姆/曼城 节礼日等）。不带 `(+N)` 的比赛正常。

**修复 B**：删除 `const plusDay = ...` 行、把末行改为 `return d`（`(+N)` 只作说明，不参与运算）：
```ts
const d = moment(dt.replace(/\(\+\d+\)/, '').trim().replace(/\s+/, 'T'));
if (!d.isValid()) return null;
return d;
```

### 验收
CDP 实测（`obs_verify_sports_bayern.js`）：拜仁首轮显示 **8月29日 02:30 今天**（正确北京时间，不再 8/30）；三联赛齐全、`clipped=false` 无裁切。

### 教训（已沉淀 skill obsidian-smart-dashboard-dev）
- `(+N)` 在 sports.json 是**纯说明**不是运算指令——解析时只 strip 不为加天。
- 改数据容易、改语义易错：先确认字段口径（北京时间最终值）再写解析逻辑。

---

## 🩹 v4.9.5 本次修复说明（布局快照）

修复 v4.9.4 遗留的两个 bug：(a) 切档（small ↔ big）会把 `cardLayout` 置 `undefined`，源档位用户拖拽位置彻底丢失；(b) 重置按钮无条件清空 `cardLayout` 回出厂默认，抹掉用户自定义位置。新增 `layoutSmall` / `layoutBig` 两个快照字段（切档时建立）。

### 1. `setLayoutSize` 切档存快照 + 载入目标档快照
- 切走前把当前档位实时 `cardLayout` **深拷贝**（`JSON.parse(JSON.stringify(...))`，禁止直接引用）存进源档快照字段（`currentSize === 'small'` → `data.layoutSmall`，否则 `data.layoutBig`）。
- 切换 `data.layoutSize = size`。
- 载入目标档已存快照（**深拷贝**）；无快照则置 `undefined`，让 `onOpen → loadLayout` 回退 `DEFAULT_LAYOUT`。
- 合并写（先 `loadData` 整体再 `saveData`），保留 `skin/cardVisibility/navEntries`。

### 2. `resetLayout` 恢复当前档快照
- 读取当前档对应快照（`this.layoutSize === 'big' ? data.layoutBig : data.layoutSmall`）。
- 快照存在：`this.layoutData = JSON.parse(JSON.stringify(snapshot))` 深拷贝恢复，Notice「已恢复为你保存的默认布局」。
- 快照不存在：`this.layoutData = {...DEFAULT_LAYOUT}` 回退出厂默认，Notice「已重置为出厂默认」。
- **不再** `data.cardLayout = undefined`；改为 `data.cardLayout = JSON.parse(JSON.stringify(this.layoutData))` 写入恢复后的布局（合并保存）。

### 3. `reflowLayoutForVisibleCards` 加"已合法则跳过重排"早返回
- 在 `if (cols < 4) return;` 之后插入：当 `visibleIds` 全部有坐标、且每个坐标 `w>0 && h>0 && x>=1 && y>=1 && x+w-1<=cols`（列数取当前 `--sd-cols`）并且两两无矩形重叠时，直接 `applyLayout()` 并 `return`，跳过贪心重排以保留快照位置。
- 任一条件不满足则继续原有重排逻辑（按 `y/x` 排序 → 贪心摆放 → `saveLayout`）。

### 4. 设置页下拉 `setDesc` 文案
- 「切换会重置自定义拖拽位置」→「切换会保存当前尺寸布局并载入目标尺寸已存布局」。

### 硬约束遵守
- 未改任何卡片 `w/h` 占格数、`DEFAULT_LAYOUT` 坐标、格子正方形逻辑。
- 未改 `getLayoutSize` / `loadLayout` / `applyLayout` / `applyLayoutCompact` / `saveLayout` / `onOpen` / `setupGridSizing`。
- `saveData` 全程合并写（先 `loadData` 整体再 `saveData`），无单对象覆盖。
- 快照字段写入深拷贝（`JSON.parse(JSON.stringify(...))`），杜绝引用污染。

---

## 1. 项目概况与当前状态
- **项目名称：** Smart Dashboard（Obsidian 插件，id: `obsidian-smart-dashboard`）
- **项目目标：** 在 Obsidian 内提供统一智能看板，聚合日历/待办/日程/倒计时/导航/Token 用量/订阅额度/交易复盘等磁贴卡片，Knowledge OS 式整合笔记与时间管理。
- **当前阶段：** 灵感落地完毕——13 张磁贴卡按 **6 列 × 4 行正方形网格**一屏显示无滚动（新增体育赛事卡）；支持周期日程/待办、节日节气自动生成、四套皮肤一键切换、体育赛事赛程展示、卡片大小/布局两档切换（小=6×4 紧凑 / 大=4 列可滚动）；拖拽/缩放交互正常。**用户双档默认布局已固化**：小档摆位存 `layoutSmall`、大档摆位存 `layoutBig`，「↺ 重置布局」按钮恢复当前档所存默认（不再清空、不再回出厂）。
- **版本：** 交接版本 **v4.9.6**（manifest.json 4.9.6 / package.json 4.9.6 对齐）；日期 **2026-08-29**
- **作者：** kroetz　**仓库：** https://github.com/billikroetzlyr43-eng/obsidian-smart-dashboard　**分支：** main

## 2. 任务执行全流程结构图 (Mermaid Workflow)
```mermaid
flowchart TD
    A[输入: 小红书看板灵感汇总15篇 vs 现插件差距分析] --> B[确认范围: 全部九项 + 连续天数=打卡或笔记活动任一]
    B --> C[v4.7.0 九项落地: Hero/六格指标/优先级/日记联动/倒计时/导航/皮肤等]
    C --> D[v4.8.0 周期化: 日程待办repeat + 节日节气寿星公式 + 倒计时top3]
    D --> E[v4.8.1-4.8.2 迭代: 删热力图卡; 用户纠正口径改 6列x4行]
    E --> F[v4.9.0 正方形格子: 列定义 var(--sd-cell) 替代 1fr + 高度约束缩放]
    F --> G{用户反馈: 卡片拖不动}
    G --> H[v4.9.1 定位: justify-content:center 轨道偏移未入坐标系]
    H --> I[getGridMetrics 增加 offsetX 三处坐标换算修正]
    I --> J([用户验收 OK → 写 HANDOFF]) --> K[v4.9.2 体育赛事卡 + 布局放大: 爬取三赛事赛程→sports.json→opencode渲染→CDP实测4轮视觉微调]
    K --> L([v4.9.2 已提交 cb888ee 并 API 推送 main 720bc1f9])
    L --> M[用户疑问: Token卡只看得到 Hermes 调 opencode 的消耗]
    M --> N[opencode 研究: parse_opencode 按 session.time_created 归日 + 累计 token → 跨天长会话消耗全记创建日]
    N --> O[v4.9.3 修复: 改读 message 表按 time.completed 归日, 总量守恒验证分毫不差]
```

## 3. 治理/交付核心成果与数据对比 (Metrics & Data Comparison)
| 指标/维度 | 执行前（v4.6.1） | 执行后（v4.9.1） | 说明 |
| :--- | :---: | :---: | :--- |
| **磁贴卡片数** | 10 张 | **12 张** | +D-Day 倒计时、+导航入口（热力图卡加后又删） |
| **网格规格** | 4 列 × 约 8 行，需滚动 | **6 列 × 4 行正方形格子，一屏无滚动** | `cell = min(宽约束, 高约束)` |
| **统计卡指标** | 3 格（总/月/周新增） | **6 格**（+今日新增/未完成待办/连续活跃） | Vault Pulse 补全 |
| **待办优先级** | 无 | **🔴紧急/🟠重要/🔵常规胶囊 + 逾期置顶排序** | `priority` 可选字段 |
| **周期能力** | 无 | **日程/待办均支持 每天/每周/每月/每年** | `repeat` 字段 + 周期重置机制 |
| **节日节气** | 无 | **15 公历节日 + 24 节气自动生成** | 寿星公式推算（个别年份 ±1 天） |
| **倒计时来源** | 仅自定义事件全量列出 | **自定义+节日+节气统一取最近 3 个** | `00_System/countdowns.json` |
| **日记联动** | 无 | **随笔追加 + 日历弹窗直达/创建当日日记** | `05_事件记录/YYYY/MM/YYYY-MM-DD.md` |
| **主题皮肤** | 暖橙单方案 | **4 套预设（暖橙/香芋紫/暗棕金/金融蓝）** | `.sd-skin-*` 变量覆盖 |
| **头部区** | 大标题独占一行 | **问候语+秒级时钟+连续天数+重置按钮+Inbox 徽章单行** | 删除大标题行 |

## 3.1 主要项目进程扫描 (Project Progress Scan)
> 数据源：`04_当前长期项目状态.md` §1 核心项目看板 + 本次变更。

| 主要项目 | 当前阶段/版本 | 本次进展 | 下一步 |
| :--- | :--- | :--- | :--- |
| **Smart Dashboard 插件** | **v4.9.4（2026-08-27）** | 设置页新增「卡片大小/布局」两档（小=6×4 紧凑 / 大=4 列可滚动）；新增 `layoutSize` 持久化字段（合并保存，切换时清空 cardLayout 触发按 4 列重排，w/h 占格数铁律不动）；styles.css 无需改（正方形格子 + overflow-y:auto 已就绪） | git 提交 v4.9.4 推送 main；用户重启 Obsidian 验收两档切换 |
| Obsidian 知识库 LLM Wiki 重构 | 方案一/二/三 100% 落地 | — | 持续维护事件记录/知识卡片 |
| Hermes 消息通道 QQ 迁移 | 100% 完成（2026-08-12） | — | 旧微信凭据备份待清理 |
| 新闻获取能力升级 | 基础设施 100% 部署 | — | 服务持久化 [待确认]；AnySearch 提额评估 |
| A股全流程盯盘 cron 化 | 8 个定时任务运行中 | — | 期权 PCR [待确认]；历史缺口补全 |
| 抓取工具链 CLI 化 | v1 已完成（2026-08-17） | — | 小红书批量实战；scraper 入 memory |
| dsh 部署与入口 | v0.1.1-rc.1 | — | Web UI 开机常驻 [待确认] |

## 4. 已完成工作 (Completed)
- **核心功能/交付物（按版本）：**
  - [x] **v4.7.0**：① Hero 欢迎区（`refreshHero` 时段问候 + 秒级时钟 interval + `getStreakDays()` 连续活跃=心情打卡 OR 笔记 ctime/mtime 任一，今天未活跃从昨天起算）② 统计卡扩 6 格（今日新增/未完成待办/连续活跃）③ 待办优先级（`TodoItem.priority?: 'high'|'mid'|'low'`，胶囊色 #e6635a/#f4a261/#7c6ee6，排序=逾期置顶→高中低→稳定拖拽序）④ 随笔「📝 写入今日日记」（`appendToDailyNote` 文末 append，无日记经 `ensureDailyNoteFile` 按模板创建于 `05_事件记录/YYYY/MM/YYYY-MM-DD.md`）⑤ D-Day 倒计时卡 `sd-countdown-section`（`countdowns.json`）⑥ DayDetailModal「📖 打开/创建日记」⑦ 导航入口卡 `sd-nav-section`（纯色五按钮竖排 1×1，revealInFolder 定位文件夹）⑧ 四套皮肤 `SD_SKINS`（容器类 `.sd-skin-violet/gold/terminal` 覆盖 `--sd-warm-accent`）⑨ 全库活动热力图卡（v4.8.1 移除）
  - [x] **v4.8.0**：① `ScheduleItem/TodoItem` 增 `repeat?: 'none'|'daily'|'weekly'|'monthly'|'yearly'`，周期待办用 `lastCompleted` + `todoEffectiveCompleted()` 按天/ISO周/月/年自动重置 ② 辅助方法族 `scheduleOccursOn / nextScheduleDate / todoOccursOn` ③ 节日常量 `FESTIVALS`(15 个公历) + `SOLAR_TERMS_21C`(寿星公式 `solarTermDate`) + `getHolidayMap/upcomingHolidays` ④ 日历格角标 `🏮节日 / ☀节气`（`.sd-calendar-festival/.sd-calendar-term`）⑤ 倒计时卡统一事件源只显最近 3 个 + `CountdownListModal` 全量管理 ⑥ 日程每条 `⏱ 还剩 N 天` 徽章（`.sd-schedule-days`）⑦ 两 Modal 各加「重复」下拉
  - [x] **v4.9.x**：① `setupGridSizing` 重写——宽屏固定 6 列，`cell=min(宽约束,高约束)`，ResizeObserver 改观察滚动容器防反馈循环 ② CSS `.sd-grid` 列定义 `repeat(var(--sd-cols), var(--sd-cell))` 替代 `1fr` + `justify-content:center` ③ 标题行删除，重置布局/Inbox 徽章并入 Hero 行（`margin-left:auto` 推右） ④ `getGridMetrics` 增加 `offsetX` 居中偏移，`showDropTarget/commitDrop` 坐标扣除 → 拖拽修复
  - [x] **v4.9.2 体育赛事卡 + 布局放大**：新增 `sd-sports-section`（2×1 格，默认 x1,y5），data 链路 `sports.json` → `renderSportsArea()`（~L3486）→ 每联赛过滤 `datetime>now` 取最近一场；渲染图标+联赛名+轮次徽标（"第N场大奖赛"/"第N轮"）+ 对手文本（足球主场 🏠）+ 日期 + 倒计时；三色左边框（F1 红 #E63946/森林绿 #2E9E4F/拜仁蓝 #2A6FDB）；布局放大 gap 12→8、网格宽度吃满真实 padding、hero 行压扁、scale 0.56→0.60、`GRID_GAP` 8（含 `getGridMetrics` 拖拽定位同步）；体育卡行距参照导航卡（flex:1 1 0 等分填满 + gap 6px + 上下零留空）
  - [x] **v4.9.3 Token 卡 opencode 消耗归日修复**：用户反馈"Token 卡只统计到 Hermes 调 opencode 的消耗、自己 TUI 直接对话的看不见"。经 opencode 深入研究（`deliverables/opencode-token-rootcause.md`）定位根因：`parse_opencode()` 原按 session 表 `time_created`（会话创建时间）归日 + 读 session 级**累计** token，导致跨天长会话（用户 `C:/Users/华为` 下的 plan 长会话 08-22~08-24 累计 852 万 input）全部消耗堆到创建日 08-22，之后日期显示≈0，且每次刷新创建日追溯虚涨；而 Hermes 委派会话全是分钟级短命会话日期天然准确，于是呈现"只有 Hermes 统计得对"。修复=改读 message 表、逐条 assistant 消息按 `COALESCE(time.completed, time.created)` 归日（本地时区），`calls`=当日消息条数。实测 08-23 从 62 万→**560 万**（真实），08-24 从凌晨快照 6.4 万→**220 万**；session 级 vs message 级五项 token 总量守恒分毫不差（7073 万 input）。改动仅限 `parse_opencode()`，其余四源与 schema_version=5 未动
  - [x] **v4.9.4 卡片大小/布局设置**：设置页「主题皮肤」与「卡片开关」之间新增 h3「卡片大小/布局」+ Dropdown（small=小 6×4 紧凑 / big=大 4 列可滚动）。新增 `SmartDashboardPlugin.getLayoutSize()/setLayoutSize()`（类比 `getSkin/setSkin`，合并保存：先 loadData 取整体 → 改 data.layoutSize + 清空 data.cardLayout → saveData 整体写回，绝不覆盖 skin/cardVisibility/navEntries）。`SmartDashboardView` 新增 `layoutSize` 字段，`loadLayout()` 读取后存入；`onOpen` 在 grid 创建后预置 `--sd-cols`（big=4/small=6）使随后 `reflowLayoutForVisibleCards`（现成装箱算法，复用按 4 列）读取正确列数重排 x/y，**w/h 占格数铁律不动**；`setupGridSizing` 在窄屏分支后新增 big 分支：`cell=(availW-gap*3)/4`、`--sd-cols=4`、**不走 cellH 高度约束** → 行数自然增多使网格总高超过 `.sd-tab-content-container` 可视高，由其既有 `overflow-y:auto` 触发纵向滚动；小档逻辑完全不变。styles.css 无需改（正方形格子由 `repeat(var(--sd-cols), var(--sd-cell))`+`grid-auto-rows: var(--sd-cell)` 保证）。取消计划中的「舒适」第三档。切换档位会清空 cardLayout 即丢失自定义拖拽位置（用户拍板可接受）
  - [x] **collect_usage.py**：`parse_opencode` 去掉 `immutable=1`（改 `mode=ro`）以读取 `-wal` 侧车——此前启用 immutable 使 SQLite 忽略 WAL，opencode 运行中未 checkpoint 的近期会话（即当天用量）不可见，导致 Token 卡当日数据缺失；`mode=ro` 仍只读不写库（v4.9.1，保留）
  - [x] vault `data.json` 同步维护：6×4 布局落盘、search 1×2（col5 行 2-3，col6 行 2-3 留空）、活动热力图条目清除
- **关键代码/文件路径：**
  - `D:/workspace/01_Projects/obsidian-smart-dashboard/main.ts` — 全部逻辑（约 3980 行）：常量区（`FESTIVALS/SOLAR_TERMS_21C/SD_SKINS/DAILY_DIR/DEFAULT_NAV_ENTRIES`）、视图类辅助方法群（`getStreakDays/dailyNotePath/ensureDailyNoteFile/openOrCreateDailyNote/appendToDailyNote/getCountdowns/saveCountdowns/scheduleOccursOn/nextScheduleDate/todoOccursOn/todoEffectiveCompleted`）、渲染方法（`renderCountdownArea/renderNavArea/renderStatsArea/renderQuickJotArea/renderTodoArea/renderScheduleArea`）、布局引擎（`DEFAULT_LAYOUT/setupGridSizing/applyScale/getGridMetrics/bindCardDrag/showDropTarget/commitDrop/reflowLayoutForVisibleCards`）、弹窗（`ManageCountdownModal/CountdownListModal`）
  - `D:/workspace/01_Projects/obsidian-smart-dashboard/styles.css` — 末段 v4.7/v4.8 增补：皮肤类/Hero 行/优先级胶囊/倒计时卡/日历角标/导航按钮；v4.9.2 `.sd-sports-*` 样式与 hero/grid 放大
  - 构建产物已部署：`D:/Obsidian Vault/Obsidian Vault/.obsidian/plugins/obsidian-smart-dashboard/`（main.js/styles.css/manifest.json）
  - 持久化配置：同目录 `data.json`（cardLayout 6×4 / cardVisibility / skin / navEntries）
  - 体育赛事数据：`.smart-dashboard/sports.json`（vault，F1 剩余11站 round14-24 / 森林英超13轮 / 拜仁德甲6轮，北京时间）
- **技术方案与架构：**
  - **正方形格子**：CSS 列定义必须 `repeat(var(--sd-cols), var(--sd-cell))` 而非 `1fr`；格子边长单一变量驱动，内容仍走 DESIGN_CELL=300 设计基准 + `transform: scale(var(--sd-scale))` 等比缩放
  - **高度约束缩放**：`cell = min(面板宽/6, 滚动容器可视高换算)`，ResizeObserver 观察**滚动容器**而非 grid 本身（避免缩放自触发反馈循环），测距补偿 `scrollTop`
  - **周期语义**：普通待办勾选置 `completed=true`；周期待办勾选只写 `lastCompleted=今天`，显示态由 `todoEffectiveCompleted` 按 repeat 粒度判定，进入下周期自动回到未完成；从周期改回不重复时物化完成状态
  - **节气推算**：寿星公式 `day = ⌊0.2422y + C⌋ − L`（21 世纪 C 值表，小寒/大寒/立春/雨水 L=⌊(y−1)/4⌋ 其余 ⌊y/4⌋），按年缓存 Map

## 5. 待办事项与下一步行动 (Next Steps)
- **⚡ 优先级最高（已在本轮完成）：**
  - [x] **git 提交 v4.6.1~v4.9.1**（已于 2026-08-22 走 GitHub REST API 推送，6708ddb→远程 0ba9872，tree 一致 4e0fd928）
  - [x] **git 提交 v4.9.2**（`cb888ee`）并经 GitHub REST API 推送——远程 main → `720bc1f9`，tree 校验一致 `7d1a2d6d`（2026-08-23）
  - [x] `04_当前长期项目状态.md` §1 看板 + §2.3 + §2.6 + 演进历史更新至 v4.9.2（2026-08-23 完成）
  - [x] **git 提交 v4.9.6**（含 v4.9.3~v4.9.6 全部累积变更：Token 归日修复 + 布局快照 + 体育卡 `(+N)` 解析修复）并经 GitHub REST API 推送 main（2026-08-29）
- **📌 后续规划：**
  - [ ] 农历节日（春节/中秋等）接入评估——需引入农历换算算法或 solarlunar 库，现仅公历节日+节气 [待确认]
  - [ ] 体育卡 `sports.json` 数据随赛季推进更新（F1 剩余 11 站，森林/拜仁赛程确认后补全）；体育卡目前无自动刷新计时器（与日历等静态卡一致），如需可挂共享 300s 定时器
  - [ ] 清理源码工程内多轮备份文件（`*.bak_20260822` 等，确认无需回溯后删）
  - [ ] 窄屏（<700px）2 列流式模式下的拖拽仍禁用（`commitDrop` cols<4 直接 return），如需支持另行设计

## 6. 踩坑记录与避坑指南 (Lessons Learned & Pitfalls)
- **已踩过的坑：**
  - ⚠️ **[v4.9.5 严重坑] 验收收尾误清用户布局，造成不可逆丢失**：多轮验收脚本在最后一步执行"清理快照/还原出厂"（delete d.layoutSmall/layoutBig、cardLayout=undefined），把用户手工摆的默认布局源数据从 data.json 清掉且未留备份，导致无法原样还原。**立铁律（已写入 Hermes 记忆）**：凡涉及 data.json（layoutSmall/layoutBig/cardLayout）或 main.ts 的任何改动，执行前必须先把 data.json + main.ts 全量备份到 `D:/Hermes/backup/smart_dashboard/`（带时间戳 bak_YYYYMMDD_HHMMSS，不删不覆盖）；任何"清理快照/还原出厂/重置布局"类操作严禁自动执行，必须先征求确认且只动目标字段；验收脚本一律不得写/删 layout* 字段、不做还原收尾。违反=严重错误。
  - ⚠️ **[v4.9.5 验收陷阱] 脚本 refreshView 会冲掉 cardLayout**：CDP 实测脚本里 `plugin.saveData({cardLayout:...})` 后若调 `refreshView()`，onOpen→reflow→saveLayout 会把 cardLayout 覆盖回 DEFAULT_LAYOUT 重排结果，导致随后 `setLayoutSize` 读到的 data.cardLayout 是重排后的（仍是 object 所以仍能存快照，但若想验证"用户自定义布局"须通过 Obsidian API 正常写、且不要在切档前 refreshView 冲掉）。验证快照落盘应直接读磁盘 data.json，而非依赖 loadData 缓存。
  - ⚠️ **[v4.9.1 关键坑] `justify-content:center` 导致"卡片拖不动"**：居中使轨道起点偏离 grid 左缘，拖拽占位框坐标未扣偏移 → 被钳死在最后一列。修复=`getGridMetrics` 计算 `offsetX = (rect.width − 24 − trackW)/2` 并在 `showDropTarget/commitDrop` 的列换算中扣除
  - ⚠️ **[v4.9.0] 正方形格子必须 `repeat(n, var(--sd-cell))`**：用 `1fr` 时列宽随面板拉伸、与行高脱钩变长方形
  - ⚠️ **[v4.8.x] ResizeObserver 反馈循环风险**：观察 grid 自身会因缩放改变其尺寸而反复触发；改观察外层 `.sd-tab-content-container`
  - ⚠️ **[流程] 版本口径歧义**：用户说「4*6」实指 **6 列×4 行**（横铺）而非 4 列×6 行——行列方向务必先确认再动手
  - ⚠️ **[环境] 本地未装 tsc**：esbuild 仅语法检查不做类型检查；类型错误只能运行期暴露，新字段一律 optional 渐进
  - ⚠️ PowerShell 中文输出乱码 → 先 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`
  - 历史坑（v4.6.x 及更早）：Obsidian 改码后需完全重启非热加载；火山采集仅登录态 Cookie 等——见上一版 HANDOFF 归档
- **已知 Bug / 限制：**
  - 🐛 节气寿星公式个别年份 ±1 天误差；农历节日（春节/中秋/端午等）尚未实现
  - 🐛 周期待办的日历圆点按「当前周期未完成」粗粒度过滤，历史周期日期上的点展示为已完成态
  - 🐛 导航卡点击文件夹依赖 internalPlugins file-explorer 的 `revealInFolder`（非公开 API，Obsidian 大版本升级需回归验证）

## 7. 项目规范与硬性约束 (Rules & Constraints)
- **代码/文件规范：**
  - 提交身份 kroetz；commit message 格式 `vX.Y.Z: 描述`；构建 `npm run build`（esbuild 自动部署三件套进 vault 插件目录）
  - 版本号**三端对齐**：manifest.json / package.json / HANDOFF.md 必须一致
  - 会话首改前必备份：`main.ts.bak_YYYYMMDD` / `styles.css.bak_YYYYMMDD`；`__pycache__/`、`*.bak*`、`TASK*.md`、`data.json` 不入库
  - **数据落盘二分**：业务数据（schedules/todos/moods/countdowns）→ `vault://00_System/*.json`；UI 配置（skin/navEntries/cardVisibility/cardLayout）→ 插件 data.json
  - **新增卡片四件套**：DEFAULT_LAYOUT 声明 + onOpen 条件渲染块 + CARD_LABELS 中文标签 + renderXxxArea 方法（缺设置页开关就不生成）
  - **向后兼容铁律**：JSON 结构新增字段一律 optional，旧数据零迁移运行
- **业务/逻辑底线：**
  - 凭证加密存储不变（继承 v4.6.1）；`add` 合并不覆盖
  - 拖拽/缩放坐标系任何网格样式调整都必须回归验证 `showDropTarget/commitDrop`
  - 周期待办禁止直接写 `completed=true`（破坏周期重置语义）

## 8. 断点快照 (Current State Snapshot)
- **上次停下的位置：**
  - 📍 v4.9.5 已改 `main.ts`（`setLayoutSize` 切档存源档深拷贝快照 + 载入目标档深拷贝快照；`resetLayout` 改为读 `layoutSmall`/`layoutBig` 恢复、不再清空 `cardLayout`；`reflowLayoutForVisibleCards` 加"已合法则跳过重排"早返回；设置页 `setDesc` 文案更新）并构建部署（vault manifest 4.9.5）；styles.css 未改。本变更待 git commit + REST API 推送 main
  - 📍 v4.9.4 已改 `main.ts`（新增 getLayoutSize/setLayoutSize/layoutSize 字段/loadLayout 读取/onOpen 预置 --sd-cols/setupGridSizing big 分支/设置页下拉）并构建部署（vault manifest 4.9.4）；styles.css 未改。本变更待 git commit + REST API 推送 main
  - 📍 v4.9.3 已改 `parse_opencode()`（读 message 表归日）并构建部署（vault manifest 4.9.3）；本变更将 git commit + REST API 推送 main
  - 📍 v4.9.2 体育卡 CDP 实测通过（clipped=false）；v4.9.1 拖拽修复用户验收通过
  - 📍 最终布局态：data.json 已固化用户双档默认——`layoutSize: 'big'`（当前在大档）；`layoutSmall` = 用户小档摆位（13 张，坐标来自用户手工拖拽、已存快照）；`layoutBig` = 用户大档摆位（13 张，同上）；`cardLayout` = 当前大档实时布局；`cardVisibility` 等其余字段完好。13 张卡占格数（w/h）全程未变（日历 2×2 / 统计 2×2 / 检索 1×2 / 用量·订阅·交易·体育 2×1 / 其余 1×1）。「↺ 重置布局」按钮验证：大档下点重置 → 精确恢复 `layoutBig`；切小档 → 恢复 `layoutSmall`；切回大档 → 恢复 `layoutBig`；两档互不污染（CDP 实测全过）
  - 📍 备份目录 `D:/Hermes/backup/smart_dashboard/` 含多份 `data.json.bak_*` 与 `main.ts.bak_*`（改动前全量备份，不删不覆盖）
  - 📍 最后一次构建命令：`npm run build`（v4.9.5）
- **遗留待确认问题：**
  - ❓ `sports.json` 赛程是否补全为全年？F1 24 站 / 英超德甲整赛季数据 [待确认]
  - ❓ 农历节日是否立项；体育卡是否挂自动刷新定时器 [待确认]

---
> 🔗 关联工作流：[[10_项目交接与上下文维持工作流]]

---

## 附录：历史版本摘要
- **v4.9.6**：修复体育卡 `(+N)` 时间解析——`parseDt` 去掉 `(+N)` 后残留尾随空格未 trim 使 moment 判 Invalid、导致拜仁（全部场次带 `(+1)`）整条不显示；修复=先 `.trim()` 再 `.replace(/\s+/,'T')`；CDP 实测三联赛齐全
- **v4.9.5**：布局快照修复（切档存 layoutSmall/layoutBig 深拷贝快照 + resetLayout 恢复快照 + reflow 早返回）
- **v4.9.3**：Token 卡 `parse_opencode()` 改读 opencode.db message 表、按消息完成时间归日（COALESCE time.completed/created），修复跨天长会话消耗堆叠创建日、后日期显示≈0 的 bug；实测 08-23 卡片从 62 万摆正至真实 560 万 input
- **v4.9.2**：体育赛事卡片（sd-sports-section，F1/诺丁汉森林/拜仁最近一场，sports.json）+ 布局放大（gap 12→8、网格吃满、hero 压扁、scale 0.6、cell 180px）
- **v4.9.1**：拖拽修复（getGridMetrics offsetX 补偿 justify-content:center 轨道偏移）
- **v4.9.0**：6×4 正方形网格重构（var(--sd-cell) 列定义 + 高度约束缩放 + 固定 6 列 + Hero 行合并标题栏）
- **v4.8.2**：布局改 6 列×4 行（纠正「4*6」口径歧义）；data.json 同步重排
- **v4.8.1**：移除全库活动热力图卡（代码与 data.json 全清）
- **v4.8.0**：周期日程/待办（repeat + lastCompleted 周期重置）；公历节日+二十四节气进日历角标与倒计时；日程逐条天数徽章；倒计时卡收敛最近三个 + CountdownListModal
- **v4.7.0**：小红书灵感九项落地（Hero 区/六格指标/优先级胶囊/随笔日记联动/D-Day 倒计时/日记跳转/导航入口/四套皮肤/热力图卡[后删]）
- **v4.6.1**：订阅卡接入 DeepSeek 官方 API 余额第 3 源（/user/balance，余额型渲染分支 type=balance，实测 CNY 0.71）
- **v4.6.0**：订阅卡接入火山方舟 Agent Plan 第 2 源（登录态 Cookie BFF 网关）；SCNet cron 迁移火山 watchdog
- **v4.5.x**：Token/订阅多源采集与凭证加密体系（CodeBuddy/WorkBuddy/SCNet）
