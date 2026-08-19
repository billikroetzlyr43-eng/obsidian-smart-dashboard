# HANDOFF — Smart Dashboard v4.3.2

## 版本信息
- **版本**: 4.3.2
- **发布日期**: 2026-08-19
- **变更**: 移除看板标题栏主题切换按钮（看板纯跟随 Obsidian 全局主题）+ Token 卡刷新按钮直连采集脚本（去掉 cron 依赖）

---

## 本次更新内容

### 1. 移除主题切换按钮（🌙/🌞）

#### 根因
- v4.3.1 深色修复时引入 `themeBtn`（手动固定深/亮色）+ `00_System/theme.json` 持久化机制，与"看板默认跟随 Obsidian 全局主题"的设计意图冲突
- `theme.json` 残留状态会锁死看板主题（如 `{"theme":"light"}` 时看板不随全局切深色），属于交接文档遗留的待清理项

#### 修改内容（main.ts）
- 删除 `themeBtn` 按钮创建与 onclick（仅保留 `↺ 重置布局` + Inbox 徽标）
- 删除死代码 `saveTheme()`，删除 `getTheme()` 定义（调用点已无）
- `onOpen()` 中 `effectiveDark` 简化为直判 `document.body.classList.contains('theme-dark')` → 看板**100% 跟随 Obsidian 全局深浅**

#### 数据清理
- 删除 `00_System/theme.json`（无文件 = auto 跟随全局，不留孤儿配置）

#### 行为变化
- 看板深浅完全由 Obsidian 全局主题决定，移除手动固定入口
- 主题按钮在"Obsidian 全局深色"下无法强制浅色的已知限制已随按钮移除而消失

### 2. Token 卡刷新按钮直连采集（去 cron 依赖）

#### 根因
- 原数据链路：外部 cron（`b9e7918def15`，每 10 分钟）→ `collect_usage.py --quiet` → `.smart-dashboard/usage_daily.json` → 卡片读 JSON
- Token 卡刷新按钮此前**只重读 JSON 渲染、不触发采集脚本**，数据新鲜度完全依赖 cron 是否按时跑

#### 修改内容（main.ts `renderUsageArea`）
- 刷新按钮点击改为：置 `⏳`+禁用 → `exec('python "D:/workspace/01_Projects/obsidian-smart-dashboard/collect_usage.py" --quiet')` → 完成后重读 `usage_daily.json` 渲染 → 恢复 `🔄`
- 采用与订阅额度卡刷新按钮相同的 try/catch/exec/finally 模式（代码风格一致）
- `renderUsageBody` 本身不改（仍是读 JSON 渲染）

#### 数据链路
- 删除了 cron 任务 `b9e7918def15`（Token 用量采集），**不再定时采集**
- 点击 🔄 刷新按钮即主动采集最新数据；卡片打开/5 分钟定时重渲染读的是缓存 JSON（无害兜底）

#### 验证（点击刷新实测）
- 点击前 `usage_daily.json` `updated_at=13:42:08` → 点击后 `13:42:15`（7 秒内被刷新按钮主动更新）✅
- 今日数据 33.5M → 40.3M（重新采集到新消耗），页面渲染最新 ✅

---

## 上一版更新内容（v4.3.1）

### 修复：深色模式文字显示不清（方案A：颜色源统一）

#### 根因
- 插件内部存在两套颜色体系：老卡片（日历/待办/日程等）用自身 `--sd-*` 变量 + 内置🌙开关；新卡片（Token用量/订阅/交易表/图表）直接引用 Obsidian 全局变量（`--text-normal`/`--text-muted` 等）
- 插件深色开关与 Obsidian 全局主题不同步时（如：插件深色 + Obsidian 浅色），新卡片文字（近黑 #1E1E1E）落在深色卡片（#2D2D2D）上 → 对比度仅 **0.8:1**，几乎不可见

#### 修改内容
1. **styles.css**：`:root` 的 7 个 `--sd-*` 变量改为映射 Obsidian 核心变量（`--background-secondary`/`--background-primary`/`--background-modifier-border`/`--text-normal`/`--text-muted`），强调色保留暖橙品牌色；删除全局 `.theme-dark` 覆盖块，改为容器级 `.smart-dashboard-container.theme-dark`（仅手动固定深色时挂）
2. **硬编码色修复**：热力图 lv0-lv4 深色档（GitHub 深色风格）、日历 other-month、`.sd-todo-subtasks` 边框、`.sd-schedule-list::before` 时间轴线、`.sd-timeline-content` 背景/边框、`.sd-grid` 底色 → 全部改用主题变量或 `body.theme-dark` 深色档
3. **main.ts**：`getTheme()` 默认 `'auto'`（跟随 Obsidian 全局）；🌙按钮点击 = 手动固定当前生效色的反向（`refreshView()` 重建；注：手动固定后不再自动跟随，恢复跟随需删除 `00_System/theme.json` 中的 `theme` 字段）；图表 `isDark` 检测双源兜底（`body.theme-dark` + 容器 class）

#### 行为变化
- 看板默认跟随 Obsidian 全局主题（深浅自动适配），不再默认固定浅色
- 手动点过🌙按钮后固定为该值；要恢复跟随全局请删除 `00_System/theme.json` 的 theme 字段（值改回 `auto`）
- 主题切换按钮在"Obsidian 全局深色"下无法强制浅色（单向覆盖，可接受）

#### 验证
- ✅ 已实测四种组合（CDP/DOM 对比度采样 189 项）：全局浅+auto / 全局浅+手动深 / 全局深+auto 全部无真问题（仅统计卡半透明背景假阳性 6 项，实算合成后 ≥3.85:1 达标）
- ✅ 脚本：`D:\Hermes\scripts\obs_theme_check.js`（对比度扫描）、`obs_style_verify.js`（样式生效验证）、`obs_shot_cards.js`（卡片截图）
- ⚠️ 本轮踩坑：手动深色下 Token/订阅卡曾用 Obsidian 浅色变量 → 2.06:1，容器级覆盖需补 Obsidian 核心变量；热力图深色档要先写 `body.theme-dark` + `.smart-dashboard-container.theme-dark` 双选择器（单写 body 在"全局浅+手动深"下不生效）

---

## 上一版更新内容（v4.3.0）

### 新功能：卡片开关与自动补位布局

#### 功能概述
- 在插件设置中新增 10 个卡片的启用/开关控制
- 隐藏的卡片不显示在看板上，其功能（定时刷新、事件监听）暂停
- 卡片隐藏后，其他卡片自动补位，保持布局紧凑
- 重新启用卡片时，放置到第一个可用空位
- 所有更改即时生效，无需重启 Obsidian

#### 卡片列表
| 卡片 ID | 名称 | 默认状态 |
|---------|------|----------|
| `sd-calendar-section` | 日历 | ✅ 启用 |
| `sd-quickjot-section` | 极速随笔 | ✅ 启用 |
| `sd-search-section` | 智能检索 | ✅ 启用 |
| `sd-create-section` | 快捷创建 | ✅ 启用 |
| `sd-stats-section` | 统计分析 | ✅ 启用 |
| `sd-usage-section` | Token 用量 | ✅ 启用 |
| `sd-subscriptions-section` | 订阅额度 | ✅ 启用 |
| `sd-schedule-section` | 日程管理 | ✅ 启用 |
| `sd-todo-section` | 待办事项 | ✅ 启用 |
| `sd-trading-section` | 交易复盘 | ✅ 启用 |

#### 设置界面访问路径
`设置 → 社区插件 → Smart Dashboard → 齿轮图标 → 卡片管理`

---

## 技术实现细节

### 1. 数据结构
在 `data.json` 中新增 `cardVisibility` 字段：
```json
{
  "cardLayout": { ... },
  "cardVisibility": {
    "sd-calendar-section": true,
    "sd-quickjot-section": false,
    ...
  }
}
```
- 缺省值：未定义的卡片视为 `true`（向后兼容）

### 2. 设置界面
- 新增 `SmartDashboardSettingTab` 类，继承 `PluginSettingTab`
- 遍历所有卡片 ID，为每个卡片生成一个开关
- 开关切换时调用 `plugin.setCardVisibility()` 并刷新视图

### 3. 渲染逻辑修改
在 `SmartDashboardView.onOpen()` 中：
1. 获取 `visibility` 对象
2. 调用 `reflowLayoutForVisibleCards(visibleIds)` 重排布局
3. 为每个可见卡片创建 DOM，跳过隐藏卡片

### 4. 布局自动补位算法
新增 `reflowLayoutForVisibleCards()` 方法：
- 收集所有可见卡片的尺寸（优先使用现有布局，否则用默认尺寸）
- 按 `(y, x)` 顺序排序
- 从 `(1,1)` 开始逐格扫描，放置到第一个不重叠的空位
- 确保布局紧凑，无空洞
- 与拖拽推挤算法一致

### 5. 功能暂停机制
- **定时器**：5 分钟刷新 Token 用量和订阅额度的定时器会检查 DOM 是否存在，隐藏卡片的 DOM 不存在，刷新自动跳过
- **事件监听**：卡片 DOM 被移除后，其上的事件监听器自动垃圾回收
- **数据采集**：后台 cron 任务持续运行，数据持久化在 JSON 文件中，卡片重新启用时直接读取最新数据

### 6. 修改文件列表
| 文件 | 变更 |
|------|------|
| `main.ts` | 新增设置标签页、卡片可见性检查、自动补位布局算法 |
| `manifest.json` | 版本号 4.2.4 → 4.3.0 |
| `package.json` | 版本号 4.2.4 → 4.3.0 |

---

## 使用方法

### 隐藏/显示卡片
1. 打开 Smart Dashboard 看板
2. 进入插件设置（齿轮图标）
3. 在“卡片管理”部分，切换对应卡片的开关
4. 看板立即更新，隐藏的卡片消失，其他卡片自动补位

### 布局重置
- 点击看板右上角的“↺ 重置布局”按钮
- 所有卡片恢复默认位置和尺寸

---

## 已知问题
1. 隐藏卡片后，其原有布局坐标被删除；启用时卡片会放置到第一个可用空位，可能改变用户自定义布局
2. 窄模式（列数 < 4）下不触发自动补位，避免破坏流式布局
3. 卡片开关状态存储在 `data.json` 中，手动删除该文件会重置所有开关为默认状态

---

## 后续扩展计划
1. 支持批量启用/禁用卡片
2. 支持卡片分组管理（如“金融类”、“效率类”）
3. 支持导出/导入卡片配置
4. 添加卡片搜索功能（当卡片数量较多时）

---

## 构建信息
- **构建命令**: `npm run build`
- **构建产物**: `main.js` (556.3kb)
- **部署位置**: `D:/Obsidian Vault/Obsidian Vault/.obsidian/plugins/obsidian-smart-dashboard/`

---

## Git 提交信息
```
feat: 卡片开关功能 v4.3.0

- 新增 SmartDashboardSettingTab 设置界面
- 支持 10 个卡片的启用/禁用开关
- 实现自动补位布局算法（reflowLayoutForVisibleCards）
- 隐藏卡片时功能暂停，启用时恢复
- 版本号升级至 4.3.0
```

**远程 Commit**: [`e106542`](https://github.com/billikroetzlyr43-eng/obsidian-smart-dashboard/commit/e1065424249303460175dfc0d51eb96b22adf4e0)

---

## 联系方式
- **作者**: kroetz
- **GitHub**: https://github.com/billikroetzlyr43-eng/obsidian-smart-dashboard
