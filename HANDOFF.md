# 🚀 项目交接文档 (HANDOFF.md) — HANDOFF — Smart Dashboard v4.9.1：看板灵感九项落地与 6×4 正方形网格重构

> **更新文件**：本文件为 Smart Dashboard（Obsidian 插件 `obsidian-smart-dashboard`）的版本交接文档，记录 **v4.7.0 → v4.9.1** 共 6 个版本的连续变更（单会话完成）。严格套用《06_项目交接文档模板》8 节结构与 [[10_项目交接与上下文维持工作流]]。

---

## 🏷️ 版本变更总览 (v4.6.1 → v4.9.1 CHANGELOG)

| 版本 | 主题 | 核心变更 | 类型 |
| :--- | :--- | :--- | :---: |
| **v4.7.0** | 小红书看板灵感九项落地 | Hero 欢迎区 / 统计六格 / 待办优先级 / 随笔写入日记 / D-Day 倒计时卡 / 日记跳转 / 导航入口卡 / 四套主题皮肤 /（全库热力图后删除） | ✨ 新增 |
| **v4.8.0** | 周期日程待办 + 节日节气 | 日程/待办 `repeat` 周期字段；公历节日+二十四节气进日历与倒计时；日程逐条天数徽章；倒计时卡只显最近三个 | ✨ 新增 |
| **v4.8.1** | 移除全库活动热力图卡 | 代码 + data.json 全量清除 | 🗑️ 删除 |
| **v4.8.2** | 6 列 × 4 行布局 | DEFAULT_LAYOUT 与 data.json 双重重排（用户口径「4*6」实指 6 列×4 行） | 🔧 重构 |
| **v4.9.0** | 正方形格子 + Hero 行合并 | 列定义弃用 `1fr` 改 `var(--sd-cell)`；宽屏固定 6 列；标题栏并入欢迎行 | 🔧 重构 |
| **v4.9.1** | 拖拽修复 | `getGridMetrics` 增加 `offsetX` 补偿 `justify-content:center` 居中偏移 | 🐛 修复 |

**本次变更涉及文件**：`main.ts` / `styles.css` / `main.js` / `manifest.json` / `package.json` / `collect_usage.py` / `HANDOFF.md`（7 文件）＋ 新增数据文件 `00_System/countdowns.json`。

---

## 1. 项目概况与当前状态
- **项目名称：** Smart Dashboard（Obsidian 插件，id: `obsidian-smart-dashboard`）
- **项目目标：** 在 Obsidian 内提供统一智能看板，聚合日历/待办/日程/倒计时/导航/Token 用量/订阅额度/交易复盘等磁贴卡片，Knowledge OS 式整合笔记与时间管理。
- **当前阶段：** 灵感落地完毕——12 张磁贴卡按 **6 列 × 4 行正方形网格**一屏显示无滚动；支持周期日程/待办、节日节气自动生成、四套皮肤一键切换；拖拽/缩放交互正常。
- **版本：** 交接版本 **v4.9.1**（manifest.json 4.9.1 / package.json 4.9.1 对齐）；日期 **2026-08-22**
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
    I --> J([用户验收 OK → 写 HANDOFF])
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
| **Smart Dashboard 插件** | **v4.9.1（2026-08-22）** | 小红书灵感九项落地；周期日程/待办；节日节气进日历与倒计时；6×4 正方形网格重构；拖拽居中偏移修复 | **git 提交推送 v4.7.0~v4.9.1**；项目状态文件 §1 更新至 v4.9.1；农历节日评估 |
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
  - [x] **collect_usage.py**：`parse_opencode` 去掉 `immutable=1`（改 `mode=ro`）以读取 `-wal` 侧车——此前启用 immutable 使 SQLite 忽略 WAL，opencode 运行中未 checkpoint 的近期会话（即当天用量）不可见，导致 Token 卡当日数据缺失；`mode=ro` 仍只读不写库
  - [x] vault `data.json` 同步维护：6×4 布局落盘、search 1×2（col5 行 2-3，col6 行 2-3 留空）、活动热力图条目清除
- **关键代码/文件路径：**
  - `D:/workspace/01_Projects/obsidian-smart-dashboard/main.ts` — 全部逻辑（约 3980 行）：常量区（`FESTIVALS/SOLAR_TERMS_21C/SD_SKINS/DAILY_DIR/DEFAULT_NAV_ENTRIES`）、视图类辅助方法群（`getStreakDays/dailyNotePath/ensureDailyNoteFile/openOrCreateDailyNote/appendToDailyNote/getCountdowns/saveCountdowns/scheduleOccursOn/nextScheduleDate/todoOccursOn/todoEffectiveCompleted`）、渲染方法（`renderCountdownArea/renderNavArea/renderStatsArea/renderQuickJotArea/renderTodoArea/renderScheduleArea`）、布局引擎（`DEFAULT_LAYOUT/setupGridSizing/applyScale/getGridMetrics/bindCardDrag/showDropTarget/commitDrop/reflowLayoutForVisibleCards`）、弹窗（`ManageCountdownModal/CountdownListModal`）
  - `D:/workspace/01_Projects/obsidian-smart-dashboard/styles.css` — 末段 v4.7/v4.8 增补：皮肤类/Hero 行/优先级胶囊/倒计时卡/日历角标/导航按钮
  - 构建产物已部署：`D:/Obsidian Vault/Obsidian Vault/.obsidian/plugins/obsidian-smart-dashboard/`（main.js/styles.css/manifest.json）
  - 持久化配置：同目录 `data.json`（cardLayout 6×4 / cardVisibility / skin / navEntries）
- **技术方案与架构：**
  - **正方形格子**：CSS 列定义必须 `repeat(var(--sd-cols), var(--sd-cell))` 而非 `1fr`；格子边长单一变量驱动，内容仍走 DESIGN_CELL=300 设计基准 + `transform: scale(var(--sd-scale))` 等比缩放
  - **高度约束缩放**：`cell = min(面板宽/6, 滚动容器可视高换算)`，ResizeObserver 观察**滚动容器**而非 grid 本身（避免缩放自触发反馈循环），测距补偿 `scrollTop`
  - **周期语义**：普通待办勾选置 `completed=true`；周期待办勾选只写 `lastCompleted=今天`，显示态由 `todoEffectiveCompleted` 按 repeat 粒度判定，进入下周期自动回到未完成；从周期改回不重复时物化完成状态
  - **节气推算**：寿星公式 `day = ⌊0.2422y + C⌋ − L`（21 世纪 C 值表，小寒/大寒/立春/雨水 L=⌊(y−1)/4⌋ 其余 ⌊y/4⌋），按年缓存 Map

## 5. 待办事项与下一步行动 (Next Steps)
- **⚡ 优先级最高（启动后立即执行）：**
  - [ ] **git 提交并推送 v4.7.0~v4.9.1 全部改动**——本会话自始至终未 commit，工作区包含 main.ts/styles.css/main.js/manifest.json/package.json 及多个 `.bak_20260822*` 备份（bak 不入库，见 §7 .gitignore 约定）
- **📌 后续规划：**
  - [ ] `04_当前长期项目状态.md` §1 看板 Smart Dashboard 行更新 v4.6.1 → v4.9.1 [待确认]
  - [ ] 农历节日（春节/中秋等）接入评估——需引入农历换算算法或 solarlunar 库，现仅公历节日+节气 [待确认]
  - [ ] 清理源码工程内多轮备份文件（`*.bak_20260822` 等，确认无需回溯后删）
  - [ ] 窄屏（<700px）2 列流式模式下的拖拽仍禁用（`commitDrop` cols<4 直接 return），如需支持另行设计

## 6. 踩坑记录与避坑指南 (Lessons Learned & Pitfalls)
- **已踩过的坑：**
  - ⚠️ **[v4.8.x 关键坑] data.json 持久化布局覆盖 DEFAULT_LAYOUT**：`reflowLayoutForVisibleCards` 每次打开按已存 `(y,x)` 排序做首适装配箱，尺寸取已存值——**改代码里的 DEFAULT_LAYOUT 对已有安装完全无效**（导航卡尺寸改了三次不生效即此因）。解法：直接编辑 vault 内 data.json，或让用户点「↺ 重置布局」。留空的竖向槽位只要后续卡片宽度放不进去就会原样保留
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
  - 📍 v4.9.1 已构建部署且**用户明确验收通过**（原话「ok了」，指拖拽恢复正常）
  - 📍 最终布局态：data.json 为 6 列×4 行（顶行六个 1×1 单卡 → 中部 calendar/stats 2×2 + search 1×2 → 底行 usage/trading/subscriptions 2×1），search 位于 col5 行 2-3，col6 行 2-3 留空两格
  - 📍 最后一次构建命令：`npm run build`（workdir `D:\workspace\01_Projects\obsidian-smart-dashboard`），产物时间戳 2026-08-22
- **遗留待确认问题：**
  - ❓ [待确认] git push 后本地与远程 sha 对齐（沿用既有 REST API push 流程）
  - ❓ [待确认] 农历节日是否立项；`04_当前长期项目状态.md` §1 是否由下一会话顺带更新

---
> 🔗 关联工作流：[[10_项目交接与上下文维持工作流]]

---

## 附录：历史版本摘要
- **v4.9.1**：拖拽修复（getGridMetrics offsetX 补偿 justify-content:center 轨道偏移）
- **v4.9.0**：6×4 正方形网格重构（var(--sd-cell) 列定义 + 高度约束缩放 + 固定 6 列 + Hero 行合并标题栏）
- **v4.8.2**：布局改 6 列×4 行（纠正「4*6」口径歧义）；data.json 同步重排
- **v4.8.1**：移除全库活动热力图卡（代码与 data.json 全清）
- **v4.8.0**：周期日程/待办（repeat + lastCompleted 周期重置）；公历节日+二十四节气进日历角标与倒计时；日程逐条天数徽章；倒计时卡收敛最近三个 + CountdownListModal
- **v4.7.0**：小红书灵感九项落地（Hero 区/六格指标/优先级胶囊/随笔日记联动/D-Day 倒计时/日记跳转/导航入口/四套皮肤/热力图卡[后删]）
- **v4.6.1**：订阅卡接入 DeepSeek 官方 API 余额第 3 源（/user/balance，余额型渲染分支 type=balance，实测 CNY 0.71）
- **v4.6.0**：订阅卡接入火山方舟 Agent Plan 第 2 源（登录态 Cookie BFF 网关）；SCNet cron 迁移火山 watchdog
- **v4.5.x**：Token/订阅多源采集与凭证加密体系（CodeBuddy/WorkBuddy/SCNet）
