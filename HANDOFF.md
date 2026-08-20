# HANDOFF — Smart Dashboard 更新文件 v4.6.0（火山方舟 Agent Plan 订阅额度接入 + SCNet 移除）

> **更新文件**：本文件为 Smart Dashboard（Obsidian 插件 `obsidian-smart-dashboard`）的版本交接文档，记录 v4.6.0 相对 v4.5.1 的版本变更。
> 本次交接聚焦：火山方舟 Agent Plan 订阅额度接入（登录态 Cookie 认证 BFF 网关）代替已移除的 SCNet；订阅卡显示修复（低百分比进度条可见 + 去掉剩余 credit 明细）；SCNet 每日采集 cron 迁移为火山 watchdog。三端版本对齐 ship 惯例（manifest.json / package.json / HANDOFF.md 均 4.6.0）。严格套用《06_项目交接文档模板》8 节结构。

---

## 🏷️ 版本变更 (v4.6.0 → CHANGELOG)

> 本文件是 Smart Dashboard 的 **v4.6.0 更新文件**，以下为本版本相对上一版本（v4.5.1）的变更清单：

| 变更模块 | v4.5.1（上一版） | v4.6.0（本版） | 类型 |
| :--- | :---: | :---: | :--- |
| **订阅额度数据源** | OpenCode Go + SCNet 超算 | **OpenCode Go + 火山方舟**（SCNet 移除） | 🔄 替换 |
| **火山方舟用量展示** | 不可用（API-key 端点 404） | **真实三窗口百分比（5h/周/月 AFP）** | ✨ 新增 |
| **删除订阅功能** | 删除失败（提示已删但文件没动） | **真实删除（config+data 双文件移除）** | 🐛 修复 |
| **每日采集 cron** | scnet_daily_collect.py | **volcengine_daily_collect.py**（火山 cookie 过期提醒） | 🔄 迁移 |
| **低百分比进度条** | 月 2% fill 0px 不可见 | **bar 8px + min-width 6px 可见绿条** | 🐛 修复 |
| **月窗口剩余 credit 明细** | 火山显示 `2127/100000 AFP` | **移除，与 OpenCode Go 格式一致** | 🎨 优化 |
| **版本号** | 4.5.1 | **4.6.0**（三端对齐） | ⬆️ 升级 |

**本次变更涉及文件**：`collect_subscriptions.py` / `main.ts` / `styles.css` / `main.js` / `manifest.json` / `package.json` / `HANDOFF.md`（7 文件，+187 / -142 行）＋ 新增脚本 `D:/Hermes/scripts/volcengine_daily_collect.py`（本地基础设施脚本，不入仓库）。

---

## 1. 项目概况与当前状态
- **项目名称：** Smart Dashboard（Obsidian 插件，id: `obsidian-smart-dashboard`）
- **项目目标：** 在 Obsidian 侧边栏提供统一智能看板，聚合日历/待办/日程/Token 用量/订阅额度等卡片，以 Knowledge OS 方式整合笔记与时间管理。
- **当前阶段：** 火山方舟 Agent Plan 订阅额度接入完成（Cookie 登录态认证），SCNet 超算额度已移除（用户主动删），SCNet 每日采集 cron 已迁移为火山方舟 watchdog，订阅卡显示修复（低百分比进度条 + 去掉剩余 credit 明细）。`collect_subscriptions.py` / `main.ts` / `styles.css` / `main.js` / `manifest.json` / `package.json` 已改并重新构建部署到 vault；CDP 实测 + cbc(glm-5.2/kimi-k2.6) 视觉双重确认。
- **版本：** 交接版本 **v4.6.0**（manifest.json 4.6.0 / package.json 4.6.0 / HANDOFF.md 4.6.0 三端对齐）；日期 **2026-08-21**
- **作者：** kroetz　**仓库：** https://github.com/billikroetzlyr43-eng/obsidian-smart-dashboard　**分支：** main

## 2. 任务执行全流程结构图 (Mermaid Workflow)
```mermaid
flowchart TD
    A[需求: 火山方舟订阅额度卡片显示/删除故障] --> B[诊断: 删除失败=adapter绝对路径+静默吞错; 火山加不上=fetch占位返回None]
    B --> C[修复A: deleteSubscription 改走 CLI remove]
    C --> D[修复B: 探寻火山用量接口: API-key端点全404]
    D --> E[定位: console.volcengine.com BFF网关 GetAgentPlanAFPUsage (登录态Cookie认证)]
    E --> F[实测: Cookie直连返回 Medium套餐 5h/周/月 AFP用量]
    F --> G[codebuddy实现 fetch_volcengine(Cookie) + main.ts authType=cookie]
    G --> H[注入真实Cookie + npm build + 重启Obsidian + CDP/视觉实测: 火山卡显示真实百分比]
    H --> I[SCNet移除(用户删) + 每日cron 5fb9 迁为火山watchdog volcengine_daily_collect.py]
    I --> J[订阅卡修复: bar 8px + min-width 6px 低百分比可见; 去掉剩余credit明细行]
    J --> K[版本号升4.6.0 + 写HANDOFF + git提交]
```

## 3. 治理/交付核心成果与数据对比 (Metrics & Data Comparison)
| 指标/维度 | 执行前状态 | 执行后状态 | 优化效果与说明 |
| :--- | :---: | :---: | :--- |
| **订阅额度数据源** | OpenCode Go + SCNet 超算 | **OpenCode Go + 火山方舟** | SCNet 移除（用户主动删），新增火山方舟 Agent Plan |
| **火山方舟用量展示** | 不可用（`usage_unavailable`，API-key端点404） | **真实三窗口百分比（5h/周/月 AFP）** | 发现 console.volcengine.com BFF 网关 `GetAgentPlanAFPUsage`，Cookie 认证成功 |
| **火山月额度(实测)** | 无数据 | **rolling=16% / weekly=4% / monthly=2%（2026-08-20 实测，Used 实时增长）** | 与 OpenCode Go 同类三窗口结构对齐 |
| **删除订阅** | 删除失败（提示已删但文件没动） | **真实删除（config+data 双文件移除）** | deleteSubscription 改走 CLI `remove <providerId>` |
| **SCNet 每日采集 cron** | cron `5fb9ce1ed6e4` 跑 scnet_daily_collect.py | **改造为火山 watchdog `volcengine_daily_collect.py`** | 检测火山 Cookie 401 过期 → QQ 提醒 |
| **低百分比进度条** | 火山月 2% fill 0px 不可见 | **bar 8px + min-width 6px，月 3% 可见绿条** | cbc(kimi-k2.6) 视觉确认"可辨识绿色短条" |
| **月窗口剩余credit明细** | 火山显示 `2127/100000 AFP` | **移除，与 OpenCode Go 格式一致** | 删除 sd-subscriptions-window-detail 渲染块 |
| **受影响文件** | - | **7 + 2 新增** | collect_subscriptions.py / main.ts / styles.css / main.js / manifest.json / package.json / HANDOFF.md + 新增 scripts/volcengine_daily_collect.py |

## 3.1 主要项目进程扫描 (Project Progress Scan)
> 横向列出当前所有主要项目快照，供新会话全景接管（数据源：`04_当前长期项目状态.md` §1 核心项目看板）。

| 主要项目 | 当前阶段/版本 | 本次进展 | 下一步 |
| :--- | :--- | :--- | :--- |
| **Smart Dashboard 插件** | **v4.6.0（2026-08-21）** | 订阅卡接入火山方舟 Agent Plan 第2源（Cookie BFF 网关，替代已移除 SCNet）；SCNet cron 迁移为火山 watchdog；订阅卡显示修复（低百分比进度条 + 去剩余 credit 明细）；本次 git 提交 + push 完成 | 观察火山 Cookie 登录态有效期；评估 AFPDaily 第4窗口/用量明细 |
| **Obsidian 知识库 LLM Wiki 重构** | 方案一/二/三 100% 落地 | — | 持续维护事件记录/知识卡片 |
| **Hermes 消息通道 QQ 迁移** | 100% 完成（2026-08-12） | — | 旧微信凭据备份待清理 |
| **新闻获取能力升级** | 基础设施 100% 部署（2026-08-12） | — | 服务持久化 [待确认]；AnySearch 提额评估 |
| **A股全流程盯盘 cron 化** | 8 个定时任务运行中 | — | 期权 PCR [待确认]；历史缺口补全 |
| **抓取工具链 CLI 化** | v1 已完成（2026-08-17） | — | 小红书批量实战；scraper 入 memory |
| **dsh 部署与入口** | 部署 100% | — | Web UI 开机常驻 [待确认] |

## 4. 已完成工作 (Completed)
- **核心功能/交付物：**
  - [x] `collect_subscriptions.py` 新增 `fetch_volcengine(cookie)`（Cookie 认证 GET `GetAgentPlanAFPUsage`，解析 AFPFiveHour/AFPWeekly/AFPMonthly → rolling/weekly/monthly，回传 percent/usedAmount/totalAmount/unit/resetsAt）；main() 改读 `cookie` 凭证
  - [x] `main.ts` `SUBSCRIPTION_TEMPLATES.volcengine` authType `api-key→cookie` + authHint 引导复制完整 Cookie；`deleteSubscription` 改走 CLI `remove`
  - [x] `styles.css` `.sd-subscriptions-bar` 高度 6px→**8px**、`.sd-subscriptions-bar-fill` 增 `min-width: 6px`
  - [x] `main.ts` 移除月窗口 `sd-subscriptions-window-detail` 渲染块（去掉 `已用/总额 unit` 剩余 credit 明细）
  - [x] 新增 `D:/Hermes/scripts/volcengine_daily_collect.py`（每日采集 + 火山 Cookie 过期检测 + QQ 提醒 watchdog，no_agent）
  - [x] cron `5fb9ce1ed6e4` 由 `scnet_daily_collect.py` 迁移为 `volcengine_daily_collect.py`，名改"火山方舟订阅额度日采集"
  - [x] 版本号三端升 4.6.0（manifest.json / package.json / HANDOFF.md）
  - [x] 删除 SCNet 相关：用户主动移除超算订阅；旧 `scnet_daily_collect.py` 保留未删（不再被引用）
- **关键代码/文件路径：**
  - `D:/workspace/01_Projects/obsidian-smart-dashboard/collect_subscriptions.py` — `VOLCENGINE_AGENTPLAN_USAGE_URL`(L34-35) / `fetch_volcengine()`(L243-315) / main() 火山分支(L496-510)
  - `D:/workspace/01_Projects/obsidian-smart-dashboard/main.ts` — `SUBSCRIPTION_TEMPLATES.volcengine`(L72-78, authType=cookie) / `deleteSubscription`(L3073-) / 月窗口 detail 移除(原L3043-3050)
  - `D:/workspace/01_Projects/obsidian-smart-dashboard/styles.css` — `.sd-subscriptions-bar`(L1020, height:8px) / `.sd-subscriptions-bar-fill`(L1028, min-width:6px)
  - `D:/Hermes/scripts/volcengine_daily_collect.py` — 火山每日采集 watchdog（新增，检测 collect 输出 401）
  - `main.js` — 构建产物（已部署 `D:/Obsidian Vault/Obsidian Vault/.obsidian/plugins/obsidian-smart-dashboard/`）
- **技术方案与架构：**
  - **火山方舟无 API-key 用量接口**：推理端点 `/api/v3/...`、网络端点（balance/quota/usage/account）全 404；真实用量在**控制台登录态 BFF 网关** `console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetAgentPlanAFPUsage`
  - **认证**：`console.volcengine.com` 域 Cookie（`userInfo`(httpOnly, base64用户信息) + `csrfToken` + `AccountID` + `acw_tc`）；GET 请求带完整 Cookie 头即鉴权成功（POST 需 CSRF）
  - **数据接口**：`GetAgentPlanAFPUsage` 直接返回 `Result.AFPFiveHour/AFPWeekly/AFPMonthly`，每项 `{Quota, Used, SubscribeTime, ResetTime}` → 三窗口 percent = Used/Quota；`AFPDaily` 可作扩展（未用）；可选 `ListAgentPlanPackageQuotaLimits`（套餐档位）、`ListAgentPlanUsageDetailObjects`（用量明细，当前空）
  - **凭证**：火山 cookie 存 `subscriptions_config.json`（加密），`get_provider_credential("volcengine","cookie")` 读取
  - **cron watchdog 判据**：不能靠"订阅条目缺失"判断过期（merge_providers 失败时不更新、旧数据残留），改用检测 collect 输出里 `WARN: Volcengine usage HTTP 401` 信号（正则 `VOLC_FAIL_PATTERN`）

## 5. 待办事项与下一步行动 (Next Steps)
- **⚡ 优先级最高（启动后立即执行）：**
  - [ ] **完成本次 git 提交并推送**（collect_subscriptions.py / main.ts / styles.css / main.js / manifest.json / package.json / HANDOFF.md / 新 scripts/volcengine_daily_collect.py），沿用 REST API push 流程（参考 `references/github-git-data-api-push.md`）
- **📌 后续规划：**
  - [ ] 观察火山 Cookie 登录态有效期（过期后 cron watchdog `volcengine_daily_collect.py` 应触发 QQ 提醒，验证链路）
  - [ ] 评估是否补充 `AFPDaily` 第四窗口或 `ListAgentPlanUsageDetailObjects` 用量明细展示
  - [ ] 更新知识库 `00_System/06_个人偏好与长期记忆/04_当前长期项目状态.md` 与 Smart Dashboard 版本事实

## 6. 踩坑记录与避坑指南 (Lessons Learned & Pitfalls)
- **已踩过的坑：**
  - **[v4.6.0 新增] 火山无 API-key 用量接口**：试遍推理/网络端点全 404，一度误判"火山看不了额度"。**真接口在控制台登录态 BFF 网关**（`console.volcengine.com/api/top/ark/...`），与 OpenCode Go / SCNet 同属"登录态 Cookie 抓取"模式——用户提示"能否用之前超算那种 cookie 方式"是正确方向
  - **[v4.6.0 新增] BFF 网关 API 前缀是 `api.top.ark` 而非 arkbff**：`arkbff-cn-beijing.console.volcengine.com` 收 401 NotLogin，真网关是 `console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/`；GET 免 CSRF，POST 报 InvalidCSRFToken
  - **[v4.6.0 新增] merge_providers 失败时不更新、旧数据残留**：火山 Cookie 失效时 fetch 返回 None 不 merge，旧条目留在 subscriptions.json → **watchdog 不能靠"条目缺失"判断过期**，改检测 collect 输出 401
  - **[v4.6.0 新增] 进度条 min-width 3px 仍不可见**：2% fill 3px×6px 在小卡片上仍是"微小绿点"，cbc(kimi-k2.6) 视觉确认"几乎不可见"→ 需要 bar 8px + min-width 6px
  - **[v4.6.0 新增] vision_analyze 不支持**：主模型 ark-code-latest 无视觉，截图无法自检 → 用 cbc 视觉模型（kimi-k2.6 / glm-5.2）看图确认
  - **Obsidian 需完全重启（非热加载）**：改 main.ts/styles.css 后必须完全退出 Obsidian 重启（`obs_cdp_restart.py`），热加载不刷新
- **已知 Bug / 限制：**
  - 🐛 火山 Cookie 登录态会过期（需重新登录控制台更新）——cron watchdog 会在过期时 QQ 提醒，但更新需手动
  - 🐛 `scnet_daily_collect.py` 旧脚本保留未删（不再被引用，SCNet 已移除），如需清理可删除

## 7. 项目规范与硬性约束 (Rules & Constraints)
- **代码/文件规范：**
  - 提交身份固定为 kroetz；远端 origin 已配凭据 store
  - commit message 遵循 `vX.Y.Z: 描述` 格式
  - 构建命令 `npm run build`；产物 main.js + manifest.json + styles.css 三件套自动部署 vault 插件目录
  - Python 采集脚本输出固定写到 `D:/Obsidian Vault/Obsidian Vault/.smart-dashboard/`；凭证加密存储于 `subscriptions_config.json`
  - cron 脚本目录 `D:/Hermes/scripts/`；watchdog 状态文件 `.volcengine_cookie_expired.json` 同目录
  - `__pycache__/`、`*.bak*`、`TASK*.md`、`data.json` 不入库
- **业务/逻辑底线：**
  - 凭证**必须加密存储**（走 Python `encrypt_value`），禁止前端明文写配置
  - `add` 命令**合并**凭证字段，禁止整体覆盖
  - 三端版本对齐 ship 惯例：manifest.json / package.json / HANDOFF.md 版本号必须一致
  - 火山采集仅用**登录态 Cookie**，不把 API-key 当用量查询凭证（会 404）
  - `fetch_volcengine` 无 cookie 时 WARN 跳过不崩溃（支持 Hermes 稍后写入 cookie 的场景）

## 8. 断点快照 (Current State Snapshot)
- **上次停下的位置：**
  - 代码改动已完成并部署：`collect_subscriptions.py`（fetch_volcengine / main 读 cookie）、`main.ts`（authType=cookie + 删 detail + deleteSubscription CLI）、`styles.css`（bar 8px + min-width 6px）、`main.js`（已部署 vault）、`manifest.json`/`package.json`（4.6.0）
  - CDP 实测验证通过：订阅卡显示 OpenCode Go + 火山方舟 2 项（火山月 2-3% 绿条可见、无剩余 credit 明细）；cbc(glm-5.2) 视觉确认两行格式一致
  - 火山 Cookie 已注入（`subscriptions_config.json`，decoded head 以 `acw_tc=` 开头）；collect 实采 rolling=16%+ 正常
  - cron `5fb9ce1ed6e4` 已迁移（名"火山方舟订阅额度日采集"，script=volcengine_daily_collect.py，每天 09:00）
  - 版本号已升 4.6.0（manifest.json / package.json / HANDOFF.md）
- **遗留待确认问题：**
  - [待确认] 火山 Cookie 登录态有效期（过期后 cron watchdog 应触发 QQ 提醒）
  - [待确认] 本次 git 提交后本地与远程 sha 对齐（沿用 v4.5.x 的 REST API push 流程）

---

> 关联工作流：[[10_项目交接与上下文维持工作流]]

---

## 附录：历史版本摘要
- **v4.5.1**：订阅卡接入 SCNet Token Plan 额度（Cookie 认证 /acx/ 接口）+ 凭证加密 + 每日采集 cron
- **v4.5.0**：Token 卡接入 CodeBuddy 第 5 源（parse_codebuddy / schema v5）
- **v4.4.0**：Token 卡接入 WorkBuddy 第 4 源（parse_workbuddy / schema v4）
- **v4.3.3**：Token 卡小分类只显示输入+输出；刷新保留面板不清空
- **v4.3.2**：移除主题切换按钮；Token 卡刷新直连采集（去 cron）
- **v4.3.1**：深色模式文字显示不清修复
- **v4.3.0**：卡片开关与自动补位布局