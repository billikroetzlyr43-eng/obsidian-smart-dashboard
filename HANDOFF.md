# HANDOFF — Smart Dashboard v4.3.0

## 版本信息
- **版本**: 4.3.0
- **发布日期**: 2026-08-17
- **变更**: 新增卡片开关功能，支持隐藏/显示看板卡片并自动补位布局

---

## 本次更新内容

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

---

## 联系方式
- **作者**: kroetz
- **GitHub**: https://github.com/billikroetzlyr43-eng/obsidian-smart-dashboard
