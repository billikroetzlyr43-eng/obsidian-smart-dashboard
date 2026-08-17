# HANDOFF — Smart Dashboard v4.2.4

## 版本信息
- **版本**: 4.2.4
- **发布日期**: 2026-08-17
- **变更**: 新增订阅额度追踪卡片

---

## 本次更新内容

### 新功能：订阅额度追踪卡片 (`sd-subscriptions-section`)

#### 功能概述
- 在 Smart Dashboard 中新增 2×1 尺寸的订阅额度卡片
- 支持三种 AI 服务订阅：OpenCode Go、智谱 GLM、火山方舟
- 实时显示各订阅的 5h/周/月 配额使用情况
- 支持手动添加/删除订阅
- 凭证加密存储

#### 新增文件
| 文件 | 说明 |
|------|------|
| `collect_subscriptions.py` | 配额采集脚本，支持三种订阅 + 加密存储 |

#### 修改文件
| 文件 | 变更 |
|------|------|
| `main.ts` | 新增 3 个模态框类 + 卡片渲染逻辑 + 数据管理 |
| `styles.css` | 新增模态框、删除按钮、订阅选择列表样式 |
| `manifest.json` | 版本号 4.2.3 → 4.2.4 |
| `package.json` | 版本号 4.2.3 → 4.2.4 |

#### 布局调整
```
原布局 (v4.2.3):
(1,5) 待办  (2,5) 日程  (3,4-5) 交易 2×2

新布局 (v4.2.4):
(1,5) 订阅额度 2×1  (3,5) 日程  (4,5) 待办  (3,4) 交易 2×1
```

---

## 技术实现细节

### 1. 数据存储
```
.smart-dashboard/
  subscriptions.json           ← 配额数据（自动生成）
  subscriptions_config.json    ← 凭证配置（加密存储）
  .secret_key                  ← 加密密钥（机器绑定）
```

### 2. 加密机制
- 使用 XOR + Base64 加密
- 密钥基于机器特征生成（hostname + machine + username）
- 密钥存储在 `.secret_key` 文件中
- 不同机器无法解密其他机器的凭证

### 3. API 接口
| 服务 | API 端点 | 认证方式 |
|------|----------|----------|
| OpenCode Go | `GET https://opencode.ai/zen/go/v1/usage` | Bearer Token |
| 智谱 GLM | `GET https://open.bigmodel.cn/api/monitor/usage/quota/limit` | Cookie |
| 火山方舟 | 待实现 | API Key |

### 4. 模态框类
| 类名 | 功能 |
|------|------|
| `SelectSubscriptionModal` | 选择订阅类型 |
| `AddSubscriptionModal` | 添加订阅（输入凭证） |
| `DeleteConfirmModal` | 删除确认 |

---

## 使用方法

### 添加订阅
1. 点击 `📊 订阅额度` 卡片标题栏的 `➕` 按钮
2. 选择订阅类型（OpenCode Go / 智谱 GLM / 火山方舟）
3. 输入凭证（OpenCode Go 可留空自动读取）
4. 点击确认

### 删除订阅
1. 点击订阅项右侧的 `🗑️` 按钮
2. 在确认窗口点击"确认删除"

### 手动采集
```bash
cd D:\workspace\01_Projects\obsidian-smart-dashboard
python collect_subscriptions.py collect
```

### 管理命令
```bash
# 列出已配置的订阅
python collect_subscriptions.py list

# 添加订阅配置
python collect_subscriptions.py add <provider_id> <key> <value>

# 删除订阅配置
python collect_subscriptions.py remove <provider_id>
```

---

## 已知问题
1. 智谱 GLM Cookie 会过期，需要定期手动更新
2. 火山方舟 API 尚未实现（placeholder）
3. 自动采集 cron 任务未配置

---

## 后续扩展计划
1. 实现火山方舟 API 采集
2. 配置自动采集 cron 任务（每 10 分钟）
3. 支持更多订阅类型（如 GitHub Copilot、Cursor 等）
4. 添加配额告警功能

---

## 构建信息
- **构建命令**: `npm run build`
- **构建产物**: `main.js` (551.4kb)
- **部署位置**: `D:/Obsidian Vault/Obsidian Vault/.obsidian/plugins/obsidian-smart-dashboard/`

---

## Git 提交信息
```
feat: 订阅额度追踪卡片 v4.2.4

- 新增 sd-subscriptions-section 卡片（2×1）
- 支持 OpenCode Go、智谱 GLM、火山方舟三种订阅
- 凭证加密存储（XOR + Base64）
- 支持手动添加/删除订阅
- 新增 collect_subscriptions.py 采集脚本
```

---

## 联系方式
- **作者**: kroetz
- **GitHub**: https://github.com/billikroetzlyr43-eng/obsidian-smart-dashboard
