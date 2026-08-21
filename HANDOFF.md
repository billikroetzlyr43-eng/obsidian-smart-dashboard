# HANDOFF — Smart Dashboard 更新文件 v4.6.1（DeepSeek 官方 API 余额接入订阅卡）

> **更新文件**：本文件为 Smart Dashboard（Obsidian 插件 `obsidian-smart-dashboard`）的版本交接文档，记录 v4.6.1 相对 v4.6.0 的版本变更。
> 本次交接聚焦：订阅卡新增 **DeepSeek 官方 API 余额**第 3 个数据源（官方 `/user/balance` 端点，余额型 provider，非百分比窗口）；首次实现订阅卡的**余额型渲染分支**（API Key 认证 → 加密存储 → 显示 `CNY 金额 + 充/赠分解`）；版本号升 4.6.1。三端版本对齐 ship 惯例（manifest.json / package.json / HANDOFF.md 均 4.6.1）。严格套用《06_项目交接文档模板》8 节结构。

---

## 🏷️ 版本变更 (v4.6.1 → CHANGELOG)

> 本文件是 Smart Dashboard 的 **v4.6.1 更新文件**，以下为本版本相对上一版本（v4.6.0）的变更清单：

| 变更模块 | v4.6.0（上一版） | v4.6.1（本版） | 类型 |
| :--- | :---: | :---: | :--- |
| **订阅额度数据源** | OpenCode Go + 火山方舟 | **OpenCode Go + 火山方舟 + DeepSeek** | ✨ 新增 |
| **DeepSeek 余额展示** | 不可用 | **`CNY 金额 + 充/赠分解`（余额型文本，非进度条）** | ✨ 新增 |
| **订阅卡渲染类型** | 仅百分比进度条（type=api/plan） | **新增余额型分支（type=balance）** | ✨ 新增 |
| **DeepSeek 余额(实测)** | 无 | **CNY 0.71（充值 0.71 / 赠金 0.00，2026-08-21）** | 接入 |
| **版本号** | 4.6.0 | **4.6.1**（三端对齐） | ⬆️ 升级 |

**本次变更涉及文件**：`collect_subscriptions.py` / `main.ts` / `styles.css` / `main.js` / `manifest.json` / `package.json` / `HANDOFF.md`（7 文件）。

---

## 1. 项目概况与当前状态
- **项目名称：** Smart Dashboard（Obsidian 插件，id: `obsidian-smart-dashboard`）
- **项目目标：** 在 Obsidian 侧边栏提供统一智能看板，聚合日历/待办/日程/Token 用量/订阅额度等卡片，以 Knowledge OS 方式整合笔记与时间管理。
- **当前阶段：** 订阅卡三源齐备——OpenCode Go（百分比窗口）+ 火山方舟 Agent Plan（登录态 Cookie）+ **DeepSeek 官方 API 余额（API Key，新增）**。DeepSeek 走官方 `/user/balance` 端点，余额型 provider 首次实现并 CDP DOM 实测通过（显示 `CNY 0.71`）。
- **版本：** 交接版本 **v4.6.1**（manifest.json 4.6.1 / package.json 4.6.1 / HANDOFF.md 4.6.1 三端对齐）；日期 **2026-08-21**
- **作者：** kroetz　**仓库：** https://github.com/billikroetzlyr43-eng/obsidian-smart-dashboard　**分支：** main

## 2. 任务执行全流程结构图 (Mermaid Workflow)
```mermaid
flowchart TD
    A[需求: DeepSeek 官方 API 余额能否接入订阅卡] --> B[调研: GitHub 思路 = 官方 /user/balance 端点]
    B --> C[实测: 用 DeepSeek API Key curl /user/balance 返回 CNY 0.71]
    C --> D[方案A: 余额型 provider 文本行 (非百分比进度条)]
    D --> E[collect_subscriptions.py 新增 fetch_deepseek + main 采集分支]
    E --> F[main.ts 新增 SUBSCRIPTION_TEMPLATES.deepseek + 余额型渲染分支]
    F --> G[styles.css 新增余额值样式]
    G --> H[add 加密存储 API Key + collect 实测: DeepSeek CNY 0.71]
    H --> I[npm build 部署 + 重启 Obsidian]
    I --> J[CDP DOM 实测: 订阅卡显示 🐬 DeepSeek CNY 0.71 充0.71]
    J --> K[版本号升4.6.1 + 更新项目状态 + 写HANDOFF]
```

## 3. 治理/交付核心成果与数据对比 (Metrics & Data Comparison)
| 指标/维度 | 执行前状态 | 执行后状态 | 优化效果与说明 |
| :--- | :---: | :---: | :--- |
| **订阅额度数据源** | OpenCode Go + 火山方舟 | **OpenCode Go + 火山方舟 + DeepSeek** | DeepSeek 官方 API 余额成为第 3 源 |
| **DeepSeek 余额展示** | 不可用 | **`CNY 0.71` + `充0.71` 文本** | 余额型 provider（type=balance）首次实现 |
| **订阅卡渲染** | 仅百分比进度条（type=api/plan） | **新增余额型分支：金额 + 充/赠分解** | 预付费余额服务语义更贴切，非硬塞进度条 |
| **DeepSeek 余额(实测)** | 无数据 | **CNY 0.71（充值 0.71 / 赠金 0.00，2026-08-21）** | CDP DOM 实测确认渲染 |
| **采集脚本** | 无 DeepSeek 支持 | **`fetch_deepseek()` 调官方 `/user/balance`** | API Key Bearer 认证，异常 WARN 跳过不崩溃 |
| **凭证** | 无 | **DeepSeek API Key 加密存储**（机器绑定 XOR+Base64） | 与其余订阅凭证同机制 |
| **受影响文件** | - | **7** | collect_subscriptions.py / main.ts / styles.css / main.js / manifest.json / package.json / HANDOFF.md |

## 3.1 主要项目进程扫描 (Project Progress Scan)
> 横向列出当前所有主要项目快照，供新会话全景接管（数据源：`04_当前长期项目状态.md` §1 核心项目看板）。

| 主要项目 | 当前阶段/版本 | 本次进展 | 下一步 |
| :--- | :--- | :--- | :--- |
| **Smart Dashboard 插件** | **v4.6.1（2026-08-21）** | 订阅卡接入 **DeepSeek 官方 API 余额**第 3 源（官方 `/user/balance`，余额型 provider 首现）；CDP DOM 实测显示 `CNY 0.71` | v4.6.1 git 提交与 push；观察 DeepSeek 余额随使用变化 |
| **Obsidian 知识库 LLM Wiki 重构** | 方案一/二/三 100% 落地 | — | 持续维护事件记录/知识卡片 |
| **Hermes 消息通道 QQ 迁移** | 100% 完成（2026-08-12） | — | 旧微信凭据备份待清理 |
| **新闻获取能力升级** | 基础设施 100% 部署（2026-08-12） | — | 服务持久化 [待确认]；AnySearch 提额评估 |
| **A股全流程盯盘 cron 化** | 8 个定时任务运行中 | — | 期权 PCR [待确认]；历史缺口补全 |
| **抓取工具链 CLI 化** | v1 已完成（2026-08-17） | — | 小红书批量实战；scraper 入 memory |
| **dsh 部署与入口** | 部署 100% | — | Web UI 开机常驻 [待确认] |

## 4. 已完成工作 (Completed)
- **核心功能/交付物：**
  - [x] `collect_subscriptions.py` 新增 `fetch_deepseek(api_key)`（GET 官方 `https://api.deepseek.com/user/balance`，Bearer 认证，解析 `balance_infos[0]` 的 total/granted/topped_up → 余额型 provider `type: balance`）；main() 新增 DeepSeek 采集分支（读 `apiKey` 凭证），统计打印对 balance 型显示 `CNY 金额` 而非 `rolling=?%`
  - [x] `main.ts` `SUBSCRIPTION_TEMPLATES` 新增 `deepseek`（api-key 类型，🐬 图标）；`renderSubscriptionsBody` 新增**余额型渲染分支**（`provider.type === 'balance'` → 显示 `余额 | CNY x.xx | 充x.xx/赠x.xx`，非进度条）
  - [x] `styles.css` 新增 `.sd-subscriptions-balance-value`（14px 加粗）+ `.sd-subscriptions-balance-detail`（9px 明细）
  - [x] DeepSeek API Key 通过 `add` 命令加密存储进 `subscriptions_config.json`（机器绑定 XOR+Base64，非明文）
  - [x] `collect` 实测成功：DeepSeek CNY 0.71（granted 0.00 / topped_up 0.71）
  - [x] `npm run build` 部署 + Obsidian 完全重启
  - [x] CDP DOM 实测确认：订阅卡显示 `🐬 DeepSeek | 余额 | CNY 0.71 | 充0.71`（与 OpenCode Go、火山方舟并存）
  - [x] 版本号三端升 4.6.1（manifest.json / package.json / HANDOFF.md）
  - [x] 更新 `04_当前长期项目状态.md` §1 看板 Smart Dashboard 行 → v4.6.1
- **关键代码/文件路径：**
  - `D:/workspace/01_Projects/obsidian-smart-dashboard/collect_subscriptions.py` — `DEEPSEEK_BALANCE_URL`(L39-40) / `fetch_deepseek()` / main() DeepSeek 分支
  - `D:/workspace/01_Projects/obsidian-smart-dashboard/main.ts` — `SUBSCRIPTION_TEMPLATES.deepseek` / `renderSubscriptionsBody` 余额型分支（`type === 'balance'`）
  - `D:/workspace/01_Projects/obsidian-smart-dashboard/styles.css` — `.sd-subscriptions-balance-value` / `.sd-subscriptions-balance-detail`
  - `main.js` — 构建产物（已部署 `D:/Obsidian Vault/Obsidian Vault/.obsidian/plugins/obsidian-smart-dashboard/`）
- **技术方案与架构：**
  - **DeepSeek 官方余额端点**：`GET https://api.deepseek.com/user/balance`，`Authorization: Bearer <API_KEY>` → `{is_available, balance_infos:[{currency, total_balance, granted_balance, topped_up_balance}]}`。**官方文档明确支持**（GitHub 多项目复用，如 CodexBar/Deepseek-API-Balance-Checker）
  - **余额型 provider 设计**：DeepSeek 是预付费余额（非百分比用量窗口），故新增 `type: balance` 顶层字段，携带 `currency`/`balance`/`balances{total,granted,topped_up}`；渲染层按 type 分支显示金额文本，不硬塞进度条
  - **认证与凭证**：API Key 走现有 `add_provider_config` 加密通道存 `subscriptions_config.json`；`fetch_deepseek` 从 `get_provider_credential("deepseek","apiKey")` 读取
  - **键值安全**：API Key 仅环境变量/加密存储传递，不落明文（本次会话 key 未写入任何非加密文件）

## 5. 待办事项与下一步行动 (Next Steps)
- **⚡ 优先级最高（启动后立即执行）：**
  - [ ] **完成 v4.6.1 git 提交并推送**（collect_subscriptions.py / main.ts / styles.css / main.js / manifest.json / package.json / HANDOFF.md），沿用 REST API push 流程（参考 `references/github-git-data-api-push.md`）
- **📌 后续规划：**
  - [ ] 观察 DeepSeek 余额随使用变化（调 API 扣费后订阅卡刷新是否同步减少）
  - [ ] 将本次 DeepSeek 余额接入同步到知识库订阅卡数据源表（`04_当前长期项目状态.md` 已更新；`obsidian-smart-dashboard-dev` skill 的 §8 数据源表也应补一行）
  - [ ] 评估火山 Cookie 登录态有效期 + AFPDaily 第四窗口（v4.6.0 遗留）

## 6. 踩坑记录与避坑指南 (Lessons Learned & Pitfalls)
- **已踩过的坑：**
  - **[v4.6.1 新增] DeepSeek 官方 key 测试时的 dsh 青山路由不适用**（前序 dsh 会话）：dsh 曾尝试把火山方舟 ark 当路由失败（400 developer role），但 DeepSeek 官方 `/user/balance` 用 API Key Bearer 直连即可，无需登录 Cookie —— 与火山/SCNet 的\"登录态抓取\"模式不同，DeepSeek 有公开余额 API
  - **[v4.6.1 新增] 余额值为字符串需转 float**：`/user/balance` 的 `total_balance` 等是字符串（`"0.71"`），浮现才 `float()` 转换；渲染层也要防 number/string 两种来源（已做 `typeof === 'number' ? x : parseFloat(x)`）
  - **[v4.6.1 新增] 订阅卡原渲染只支持百分比进度条**：直接把余额塞进 windows 进度条会失真，需新增 `type: balance` 顶层分支走文本渲染——预付费余额服务（DeepSeek/OpenAI 皆余额式）未来接入同类服务可复用此分支
  - [v4.6.0] 火山无 API-key 用量接口（试遍端点 404，真接口在控制台 BFF 网关）
  - [v4.6.0] BFF 网关 API 前缀是 `api.top.ark` 而非 arkbff（后者 401）
  - [v4.6.0] merge_providers 失败不更新、旧数据残留 → watchdog 检测 collect 输出 401 而非\"条目缺失\"
  - [v4.6.0] 进度条 min-width 3px 仍不可见 → bar 8px + min-width 6px
  - [v4.6.0] 主模型 ark-code-latest 无视觉 → 用 cbc 视觉模型确认截图
  - **Obsidian 需完全重启（非热加载）**：改 main.ts/styles.css 后必须完全退出 Obsidian 重启（`obs_cdp_restart.py`），热加载不刷新
- **已知 Bug / 限制：**
  - 🐛 火山 Cookie 登录态会过期（需重新登录控制台更新）——cron watchdog 在过期时 QQ 提醒，更新需手动
  - 🐛 DeepSeek 官方 key 余额仅 0.71 CNY（2026-08-21），极低——若作 dsh 主路由需充值

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
  - DeepSeek 用**官方 `/user/balance` + API Key Bearer**（有公开余额 API，无需登录 Cookie）；凭证键 `apiKey`
  - 余额型 provider 必须声明 `type: balance` 顶层字段（而非塞 windows 进度条），渲染层按 type 分支

## 8. 断点快照 (Current State Snapshot)
- **上次停下的位置：**
  - 代码改动已完成并部署：`collect_subscriptions.py`（`fetch_deepseek` / main DeepSeek 分支 / balance 统计打印）、`main.ts`（`SUBSCRIPTION_TEMPLATES.deepseek` + 余额型渲染分支）、`styles.css`（`.sd-subscriptions-balance-value`/`-detail`）、`main.js`（已部署 vault）、`manifest.json`/`package.json`（4.6.1）
  - CDP DOM 实测验证通过：订阅卡显示 `🐬 DeepSeek | 余额 | CNY 0.71 | 充0.71`（与 OpenCode Go、火山方舟 3 项并存）
  - DeepSeek API Key 已加密存入 `subscriptions_config.json`（decoded head `RBEAA21HNnwtAXx...`，非明文）；collect 实采 `CNY 0.71 (granted 0.00, topped_up 0.71)`
  - 版本号已升 4.6.1（manifest.json / package.json / HANDOFF.md）
  - `04_当前长期项目状态.md` §1 看板 Smart Dashboard 行已更新 → v4.6.1
- **遗留待确认问题：**
  - [待确认] 本次 git 提交后本地与远程 sha 对齐（沿用 v4.5.x 的 REST API push 流程）
  - [待确认] DeepSeek 余额极低（0.71 CNY），若作为可长时间路由需充值；当前仅作订阅卡展示

---

> 关联工作流：[[10_项目交接与上下文维持工作流]]

---

## 附录：历史版本摘要
- **v4.6.0**：订阅卡接入火山方舟 Agent Plan 第 2 源（登录态 Cookie BFF 网关 GetAgentPlanAFPUsage，替代已移除 SCNet）；SCNet cron 迁移为火山 watchdog；订阅卡显示修复（低百分比进度条 + 去 credit 明细）
- **v4.5.1**：订阅卡接入 SCNet Token Plan 额度（Cookie 认证 /acx/ 接口）+ 凭证加密 + 每日采集 cron
- **v4.5.0**：Token 卡接入 CodeBuddy 第 5 源（parse_codebuddy / schema v5）
- **v4.4.0**：Token 卡接入 WorkBuddy 第 4 源（parse_workbuddy / schema v4）
- **v4.3.3**：Token 卡小分类只显示输入+输出；刷新保留面板不清空
- **v4.3.2**：移除主题切换按钮；Token 卡刷新直连采集（去 cron）
- **v4.3.1**：深色模式文字显示不清修复
- **v4.3.0**：卡片开关与自动补位布局