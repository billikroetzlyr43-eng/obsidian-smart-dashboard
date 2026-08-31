# Smart Dashboard 卡片大小/布局设置 —— 实现计划

> 任务来源：用户反馈「当前卡片太小看不清」，要求在设置页新增「卡片大小/布局」选择。
> 本文件初版仅探测+计划（§1–§10 为初版探测稿，保留作历史档案）；顶部「用户最终决策与计划纠正」段为落地前用户拍板后的权威规格，**实现以本段为准**。

---

## 0. 用户最终决策与计划纠正（2026-08-27 拍板，权威规格）

### 0.1 计划纠正要点

初版 §2–§4 提出「三档（默认/舒适/大卡）」，**用户最终拍板取消「舒适」第三档，只做两档**：

| 档位 key | 标签 | 网格 | cell 计算 | 滚动 | 占格数 w/h |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `small` | 小（默认） | 6 列 × 4 行（+ 第 5 行 sports） | 现状不变：`cell=min(cellW, cellH)`，一屏无滚动 | 无 | DEFAULT_LAYOUT 完全不动 |
| `big` | 大 | 4 列，行数自然增多 | `cell=(availW-gap*3)/4`，**不走 cellH 高度约束** → 行数增多使网格总高超过滚动容器可视高 | **纵向滚动**（`.sd-tab-content-container` 既有 `overflow-y:auto` 自动触发，不额外加横向滚动） | w/h 原样继承 DEFAULT_LAYOUT，仅按 4 列重排 x/y |

> ⚠️ **「舒适」档取消**：初版 §2.4 / §4.2 提出的 `comfort`（6×4 放大、cell 下限 225）**不再实现**。
> ⚠️ **「3 行×4 列」字面档取消**：初版 §2 / §4.3 提出的 `large`（删卡或合并）**不再实现**——big 档不删卡、不合并、不隐藏任何卡片，全部 13 张保留，靠纵向滚动容纳。

### 0.2 铁律（用户三令五申）

1. **绝对不允许改动每张卡片当前的占格数 w/h**——日历卡 w=2,h=2、用量卡 w=2,h=1 等全部保持原样。切换档位只改网格列数（6→4）并触发重排 x/y，w/h 原样继承 DEFAULT_LAYOUT。
2. **每个格子必须是正方形**——`.sd-grid` 现有 `grid-template-columns: repeat(var(--sd-cols), var(--sd-cell))` + `grid-auto-rows: var(--sd-cell)` 已保证，不破坏、不改 styles.css。
3. **大档滚动靠容器既有 `overflow-y:auto`**——`.sd-tab-content-container` 已 `overflow-y:auto`，big 档行数增多自动出现纵向滚动，不额外加横向滚动、不额外写 CSS。

### 0.3 数据持久化铁律

新字段 `layoutSize`（`'small' | 'big'`，默认 `'small'`）必须沿用现有**合并保存**模式：

```typescript
async setLayoutSize(size: 'small' | 'big'): Promise<void> {
    const data = (await this.loadData()) || {};   // 先取整体
    data.layoutSize = size;                       // 改单字段
    data.cardLayout = undefined;                  // 切换档位清空持久化布局，让新档按新列数重排
    await this.saveData(data);                    // 整体写回
}
```

> 绝对不能用 `saveData({layoutSize})` 整体覆盖（会丢 `cardVisibility` / `cardLayout` / `skin` / `navEntries`）。
> `layoutSize` optional，旧 data.json 无此字段时 `getLayoutSize()` 返回 `'small'`，零迁移运行。

### 0.4 实际改动文件清单（已落地）

| 文件 | 改动点 | 状态 |
| :--- | :--- | :--- |
| `main.ts` | `SmartDashboardPlugin` 新增 `getLayoutSize()` / `setLayoutSize()`（L596-607，setSkin 之后；合并保存 + 切换时清空 cardLayout） | ✅ |
| `main.ts` | `SmartDashboardView` 新增 `private layoutSize: 'small' \| 'big' = 'small'` 字段（L1325） | ✅ |
| `main.ts` | `loadLayout()` 读取 `data.layoutSize` 存入 `this.layoutSize`，cardLayout 加载逻辑不变（L1743-1747） | ✅ |
| `main.ts` | `onOpen` 在 grid 创建后预置 `--sd-cols`（big=4 / small=6），使随后 `reflowLayoutForVisibleCards` 读取正确列数按 4 列重排 x/y（L1570-1571） | ✅ |
| `main.ts` | `setupGridSizing.compute()` 在窄屏分支后新增 big 分支：`cell=(availW-gap*3)/4`、`--sd-cols=4`、**不走 cellH 高度约束**、`applyLayout`+`applyScale` 后 `return`（L1821-1830） | ✅ |
| `main.ts` | `SmartDashboardSettingTab.display()` 在「主题皮肤」h3 后、「卡片开关」h3 前新增 h3「卡片大小/布局」+ Dropdown（small / big），onChange 调 `setLayoutSize` + `refreshView`（L4052-4065） | ✅ |
| `manifest.json` | 版本号 4.9.3 → 4.9.4 | ✅ |
| `package.json` | 版本号 4.9.3 → 4.9.4 | ✅ |
| `HANDOFF.md` | 标题/总览/进度/§4/§5/§8/附录 同步追加 v4.9.4 记录 | ✅ |
| `styles.css` | **无需改**（正方形格子 + overflow-y:auto 已就绪） | ✅ 未动 |

### 0.5 落地方案要点（与初版计划差异说明）

1. **未新增 `DEFAULT_LAYOUT_LARGE`**：初版 §5 / §4.3 提议为新档建独立布局表，最终方案不建——big 档直接复用 `DEFAULT_LAYOUT` 的 w/h，由现有 `reflowLayoutForVisibleCards`（main.ts:2037）按 4 列重排 x/y，满足「不改占格」铁律。
2. **未改 `getGridMetrics`**：初版 §5 提议同步调整其 cols fallback；最终方案不需要——它读取 `--sd-cols`（由 `onOpen` 预置 + `setupGridSizing` 覆写为 4），自动跟随。
3. **big 档不走 cellH 高度约束**：初版 §0.4/§5 提议「cellH 仍取 min」会在 big 档（7 行左右）把 cell 压到 ~107px（比 small 档 180px 更小），与「大档=每格更大」诉求矛盾。最终方案 big 档 `cell=cellW`（仅按宽度），让网格总高溢出触发纵向滚动，符合用户铁律 #4「大档允许滚动」。small 档 `cell=min(cellW, cellH)` 逻辑完全不变。
4. **切换档位清空 cardLayout**：`setLayoutSize` 内 `data.cardLayout=undefined`，等价 `resetLayout` 的清空逻辑，避免旧 6 列坐标在 4 列网格上错位；副作用是切换会丢失自定义拖拽位置（用户拍板可接受）。

### 0.6 验收要点

- [ ] small 档：现状完全不变（6 列 × 4 行 + sports 第 5 行，一屏无滚动，cell ≈ 180px / scale ≈ 0.60）
- [ ] big 档：4 列网格，每格 cell ≈ (availW-24)/4（1200px 面板 ≈ 294px / scale ≈ 0.98），13 张卡全保留、不重叠、不裁切
- [ ] big 档出现纵向滚动条，可向下滑动查看全部卡片；无横向滚动
- [ ] 切换 small↔big 后看板立即刷新重排，data.json 的 `layoutSize` 字段正确写入，`skin`/`cardVisibility`/`navEntries` 等其他字段不丢失
- [ ] 每张卡 w/h 占格数与 DEFAULT_LAYOUT 完全一致（日历 2×2、用量 2×1 等）

---

## 1. 当前布局现状（实测）

> 本节为初版探测稿，保留作历史档案。实现以 §0「用户最终决策与计划纠正」为准。

### 1.1 关键常量（main.ts:1302-1303）

| 常量 | 值 | 用途 |
| :--- | :--- | :--- |
| `DESIGN_CELL` | **300** | 设计基准每格像素，`.sd-card-body` 按 `w*300 + (w-1)*gap` 设宽 |
| `GRID_GAP` | **8** | 网格 gap（CSS `.sd-grid{gap:8px}` 与常量一致；HANDOFF.md 中"12"已废弃） |

> ⚠️ 注意：任务描述里"GRID_GAP=12"与代码实测（8）不符，以代码为准。

### 1.2 默认布局 DEFAULT_LAYOUT（main.ts:1306-1321）

13 张卡，6 列 × 4 行填满 + 第 5 行扩展：

| 卡片 id | x | y | w | h | 占格 | 说明 |
| :--- | :-: | :-: | :-: | :-: | :-: | :--- |
| sd-countdown-section | 1 | 1 | 1 | 1 | 1 | D-Day 倒计时 |
| sd-quickjot-section | 2 | 1 | 1 | 1 | 1 | 极速随笔 |
| sd-nav-section | 3 | 1 | 1 | 1 | 1 | 导航入口 |
| sd-create-section | 4 | 1 | 1 | 1 | 1 | 快捷创建 |
| sd-schedule-section | 5 | 1 | 1 | 1 | 1 | 日程 |
| sd-todo-section | 6 | 1 | 1 | 1 | 1 | 待办 |
| sd-calendar-section | 1 | 2 | 2 | 2 | 4 | 日历 2×2 |
| sd-stats-section | 3 | 2 | 2 | 2 | 4 | 统计 2×2 |
| sd-search-section | 5 | 2 | 1 | 2 | 2 | 全库检索 1×2（col6 行 2-3 留空） |
| sd-usage-section | 1 | 4 | 2 | 1 | 2 | Token 用量 2×1 |
| sd-trading-section | 3 | 4 | 2 | 1 | 2 | 交易复盘 2×1 |
| sd-subscriptions-section | 5 | 4 | 2 | 1 | 2 | 订阅额度 2×1 |
| sd-sports-section | 1 | 5 | 2 | 1 | 2 | 体育赛事 2×1（第 5 行） |

**总占格数 = 1×6 + 4 + 4 + 2 + 2×3 + 2 = 24 格**，恰好填满 6×4=24 格前 4 行；第 5 行 sports 占 2 格、其余 4 格留空。

### 1.3 网格尺寸自适应 setupGridSizing（main.ts:1799-1857）

```
宽屏分支（availW ≥ 700）：
  rows = max(4, max(layoutData.y+h-1))   // 默认 4，体育卡让其变 5
  cellW = (availW - gap*5) / 6
  cellH = (availH - gap*(rows-1)) / rows   // 滚动容器高度约束
  cell  = min(cellW, cellH)，floor 后写入 --sd-cell
  --sd-cols = 6
```

```
窄屏分支（availW < 700）：
  cell = (availW - gap) / 2，--sd-cols = 2，applyLayoutCompact()（清除显式坐标，流式）
```

### 1.4 缩放机制 applyScale（main.ts:1860-1867）

```
scale = cell / DESIGN_CELL = cell / 300
```
- 写入 `--sd-scale`，由 `.sd-card-body{transform: scale(var(--sd-scale))}` 整体等比缩放
- v4.9.2 实测（HANDOFF.md）：cell ≈ 180px → scale ≈ 0.60

### 1.5 .sd-card-body 设计尺寸（main.ts:1786-1794）

```
body.width  = w * 300 + (w-1) * 8     // 1×1=308, 2×1=616, 2×2=616
body.height = h * 300 + (h-1) * 8     // 1×1=308, 1×2=616, 2×2=616
```
内容按此设计像素渲染，整体 scale 缩放至实际格子。

### 1.6 设置页现状 SmartDashboardSettingTab（main.ts:4019-4092）

```
h2「Smart Dashboard 卡片管理」
├─ h3「主题皮肤」+ dropdown（4 套预设：warm/violet/gold/terminal）
├─ h3「卡片开关」+ 遍历 CARD_LABELS（13 张）→ 13 个 Setting+toggle
└─ h3「导航入口」+ 遍历 navEntries → 5 个 Setting+text 输入
```
**新设置项最佳插入位置**：在「主题皮肤」与「卡片开关」之间，新增 `h3「卡片大小/布局」+ dropdown`，类比皮肤 dropdown 实现。

### 1.7 data.json 持久化模式（main.ts:572-607, 1742-1778）

现有所有 setter 都是**合并保存**模式（先 loadData 取整体 → 改单字段 → saveData 整体写回）：
- `setCardVisibility`: loadData → data.cardVisibility[id]=visible → saveData
- `setSkin`: loadData → data.skin=skin → saveData
- `setNavEntries`: loadData → data.navEntries=entries → saveData
- `saveLayout`: loadData → data.cardLayout=layoutData → saveData
- `resetLayout`: loadData → data.cardLayout=undefined → saveData

**已有字段**：`cardVisibility` / `cardLayout` / `skin` / `navEntries`
**新增字段**：`layoutSize`（字符串枚举），沿用同样合并模式即可，无覆盖风险。

---

## 2. 「3 行×4 列」档位可行性分析（核心结论）

### 2.1 字面解读

「3 行×4 列」= 3 行 × 4 列 = **12 格**（横铺，4 列宽 × 3 行高）。

当前 13 张卡占 **24 格**，是 12 格的 2 倍——**字面意义的 4×3 装不下现有卡片**。

### 2.2 每卡变大 vs 装不下的矛盾

若强行改 4×3，假设面板宽 1200px、可用高 800px：
```
cellW = (1200 - 8*3) / 4 = 294
cellH = (800  - 8*2) / 3 = 261
cell  = min(294, 261) = 261
scale = 261 / 300 = 0.87   ← 比当前 0.60 大 45%，确实"看得清"
```

**每张卡会显著变大**——方向上解决"看不清"，但代价是：
- 必须重排 DEFAULT_LAYOUT 至 4×3
- 必须删除/合并卡片（13 张→约 6~8 张），或允许 4×3 模式下出现滚动条（违反"磁贴铁律一屏无滚动"）

### 2.3 核心结论

> **「3 行×4 列」字面档位能让每卡变大（scale 0.60→0.87），但 12 格装不下当前 13 张 24 格卡片。**
> **若直接照搬现有 DEFAULT_LAYOUT，会出现大量重叠/溢出/裁切；若强行重排为 4×3，必须牺牲卡片（删/合并）或放弃"一屏无滚动"。**

### 2.4 替代档位建议（推荐方案）

为同时满足"卡片变大"与"不删卡/不滚"，建议提供**三档**：

| 档位 key | 标签 | 网格 | 每格 cell 估算 | scale 估算 | 适配策略 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `default` | 默认（6×4 紧凑） | 6 列 × 4 行 | ~180px | ~0.60 | 现状，DEFAULT_LAYOUT 不动 |
| `comfort` | 舒适（6×4 放大） | 6 列 × 4 行 | ~225px | ~0.75 | 仅提升 cell 下限，DEFAULT_LAYOUT 不动；可能略溢出触发轻量滚动 |
| `large` | 大卡（3 行×4 列） | 4 列 × 3 行 | ~260px | ~0.87 | **需重排 DEFAULT_LAYOUT 至 4×3 + 删除/合并卡，或允许滚动** |

> 推荐用户首选 `comfort`（无破坏性、肉眼明显变大）；`large` 档需用户决策"牺牲哪些卡"或"接受滚动"。

---

## 3. 拟新增设置项 UI

### 3.1 位置

`SmartDashboardSettingTab.display()` 中，在「主题皮肤」h3 之后、「卡片开关」h3 之前插入：

```typescript
containerEl.createEl('h3', { text: '卡片大小/布局' });
const currentSize = await this.plugin.getLayoutSize();
new Setting(containerEl)
    .setName('布局规格')
    .setDesc('切换看板卡片显示尺寸/网格密度。改动后看板立即刷新。')
    .addDropdown(dd => {
        dd.addOption('default', '默认（6×4 紧凑）');
        dd.addOption('comfort', '舒适（6×4 放大）');
        dd.addOption('large', '大卡（3 行×4 列）');
        dd.setValue(currentSize);
        dd.onChange(async (v) => {
            await this.plugin.setLayoutSize(v);
            await this.plugin.refreshView();
        });
    });
```

### 3.2 控件类型

`Dropdown`（与「主题皮肤」一致，复用 obsidian Setting API，符合现有视觉风格）。
不选分段按钮（SegmentedControl）——Obsidian 原生 Setting 无此组件，自实现成本高于收益。

---

## 4. 各档位具体布局参数与渲染效果预估

### 4.1 档位 1：`default`（默认 6×4 紧凑）

| 参数 | 值 |
| :--- | :--- |
| 网格 | 6 列 × 4 行（+ 第 5 行 sports） |
| DEFAULT_LAYOUT | 现有，不动 |
| cell 估算 | ~180px |
| scale 估算 | ~0.60 |
| 占格 | 24/24 填满 |
| 滚动 | 无 |
| 改动点 | 零（保持现状） |

### 4.2 档位 2：`comfort`（6×4 放大，推荐）

| 参数 | 值 |
| :--- | :--- |
| 网格 | 6 列 × 4 行（+ 第 5 行 sports） |
| DEFAULT_LAYOUT | 现有，不动 |
| cell 估算 | ~225px（强制下限） |
| scale 估算 | ~0.75 |
| 占格 | 24/24 填满 |
| 滚动 | 视面板高度可能轻量纵向溢出（可接受） |
| 改动点 | `setupGridSizing` 中新增 cell 下限逻辑：`if (layoutSize==='comfort') cell = Math.max(cell, 225)` |

**实现思路**：在 `setupGridSizing.compute()` 末尾、写入 `--sd-cell` 之前，按 `layoutSize` 提升下限。`applyScale` 不动，自动跟随。

**风险**：cell 强制放大后，若面板高度不够会触发纵向滚动条——但用户诉求正是"宁可滚动也要看清"，可接受。若用户反馈不接受滚动，回退至 `default`。

### 4.3 档位 3：`large`（3 行×4 列大卡，需用户决策）

| 参数 | 值 |
| :--- | :--- |
| 网格 | 4 列 × 3 行 |
| DEFAULT_LAYOUT | **需重排为新表 `DEFAULT_LAYOUT_LARGE`** |
| cell 估算 | ~260px |
| scale 估算 | ~0.87 |
| 占格 | 12 格 |
| 滚动 | 视重排方案，可能纵向溢出 |
| 改动点 | 新增 `DEFAULT_LAYOUT_LARGE` + `setupGridSizing` 4 列分支 + `applyLayout` 选表 |

**重排方案 A（删除部分卡）**：
保留 8 张核心卡（4+4）：
- 行 1：4 个 1×1（countdown / quickjot / schedule / todo）
- 行 2：2 个 2×2（calendar / stats）
- 行 3：2 个 2×1（usage / trading）

**删除**：nav / create / search / subscriptions / sports（5 张）——设置页关掉即可，不丢数据。

**重排方案 B（保留全部 13 张，启用滚动）**：
- 4×3=12 格不足，第 4 行起自然延展，触发纵向滚动
- 违反"一屏无滚动"铁律，不推荐

**重排方案 C（合并顶行 6 个 1×1 为 3 个 2×1）**：
- 行 1：3 个 2×1（countdown+quickjot / nav+create / schedule+todo）——但每张 2×1 仍各为独立卡，"合并"=改变占格 w=2 → 卡内仍需重排内容，违反"内容完整不变形"铁律
- 不推荐

> **`large` 档必须由用户在设置页外另行确认采用方案 A（删卡）还是接受滚动**。本轮 plan 仅产出机制，落地 `large` 时需追加用户决策环节。

---

## 5. 涉及文件与改动点清单

| 文件 | 改动点 | 行号参考 |
| :--- | :--- | :--- |
| `main.ts` | `SmartDashboardPlugin` 新增 `getLayoutSize()` / `setLayoutSize()` 方法（类比 `getSkin/setSkin`） | 584-594 后插入 |
| `main.ts` | `SmartDashboardView` 新增静态 `DEFAULT_LAYOUT_LARGE`（仅 `large` 档用） | 1306 后插入 |
| `main.ts` | `loadLayout()` 按 `layoutSize` 选表（default/comfort 用 `DEFAULT_LAYOUT`，large 用 `DEFAULT_LAYOUT_LARGE`） | 1742-1746 |
| `main.ts` | `setupGridSizing.compute()` 新增按 `layoutSize` 切分支：`comfort` 提升 cell 下限；`large` 改 4 列计算 | 1799-1857 |
| `main.ts` | `getGridMetrics` 默认 cols fallback 同步按 `layoutSize` 调整（避免拖拽坐标错位） | 1888-1889 |
| `main.ts` | `SmartDashboardSettingTab.display()` 新增 h3「卡片大小/布局」+ dropdown | 4048 后插入 |
| `styles.css` | 无需改动（`.sd-grid` 已用 `var(--sd-cols)`/`var(--sd-cell)` 变量驱动） | — |
| `manifest.json` | 版本号 4.9.3 → 4.9.4（如需发版） | 4 |
| `package.json` | 版本号同步 | — |
| `HANDOFF.md` | 追加 v4.9.4 变更记录 | — |

> 严格作用域：本轮只动上表列出文件与字段，不顺手重构其他代码、不加无关注释。

---

## 6. saveData 合并保存方案

**沿用现有合并模式，零风险**：

```typescript
// SmartDashboardPlugin 类内（类比 setSkin）
async getLayoutSize(): Promise<string> {
    const data = await this.loadData();
    return data?.layoutSize || 'default';
}

async setLayoutSize(size: string): Promise<void> {
    const data = (await this.loadData()) || {};   // 先取整体
    data.layoutSize = size;                       // 改单字段
    await this.saveData(data);                    // 整体写回
}
```

**保证**：`cardVisibility` / `cardLayout` / `skin` / `navEntries` 等已有字段全部保留，绝不覆盖丢失。

**向后兼容铁律**：`layoutSize` 字段 optional，旧 data.json 无此字段时 `getLayoutSize()` 返回 `'default'`，零迁移运行。

---

## 7. 相邻卡片重叠排查方案

`reflowLayoutForVisibleCards`（main.ts:2040-2096）已有首适装配箱算法（按 y/x 排序 → 逐个找空位 → `overlaps()` 检测）。切换档位时排查流程：

1. **default → comfort**：DEFAULT_LAYOUT 不变，无重叠风险，跳过排查。
2. **default → large**：DEFAULT_LAYOUT 切换为 `DEFAULT_LAYOUT_LARGE`，必须**手工逐卡核对**：
   - 拟定 `DEFAULT_LAYOUT_LARGE` 后，按 y/x 排序，逐卡验证 `(x,y,w,h)` 与已放置卡是否重叠（`overlaps()` 公式：`p.x < o.x+o.w && p.x+p.w > o.x && p.y < o.y+o.h && p.y+p.h > o.y`）
   - 重点检查右下相邻卡：每张 2×2 右侧/下方是否有 1×1 突入
   - 第 4 列与第 3 列 2×2 的边界（x=3,w=2 → 占 col3-4，下一张必须 x=1 或新行）
3. **拖拽后切换**：切换档位时调用 `resetLayout()` 等价逻辑（清空 `cardLayout` 持久化、按新 DEFAULT_LAYOUT 重新落盘），避免旧坐标在新表上错位。
4. **窄屏 2 列模式**：`applyLayoutCompact` 已清除显式坐标，不受档位影响，无需排查。

**验收清单**（`large` 档落地后必须 CDP 实测）：
- [ ] 每张卡 `clipped=false`（无内容裁切）
- [ ] 每张卡无内部滚动条（`.sd-card-body` overflow:hidden 兜住，但内容不应溢出）
- [ ] 卡片间无视觉重叠（gap 8px 可见）
- [ ] 拖拽正常（`getGridMetrics` 4 列分支 offsetX 计算正确）

---

## 8. 构建与验证步骤

> 本轮仅探测+计划，**不执行** build。落地实施时按以下步骤：

1. 备份：`cp main.ts main.ts.bak_YYYYMMDD` / `cp styles.css styles.css.bak_YYYYMMDD`
2. 按 §5 改动点修改 `main.ts`
3. `npm run build`（esbuild 自动部署三件套进 `D:/Obsidian Vault/Obsidian Vault/.obsidian/plugins/obsidian-smart-dashboard/`）
4. 用户**完全退出并重启 Obsidian**（插件不热加载）
5. 打开 Smart Dashboard 看板 → 设置页 → 切换三档，逐档验证：
   - default：现状不变
   - comfort：卡片肉眼变大、无横向滚动条、轻量纵向滚动可接受
   - large：4×3 布局生效、按 §7 验收清单核对
6. CDP 实测（可选）：`document.querySelectorAll('.sd-card-body').forEach(b => console.log(b.parentElement.id, b.getBoundingClientRect()))` 核对每卡实际尺寸
7. 同步版本号：manifest.json / package.json / HANDOFF.md → 4.9.4
8. git commit `v4.9.4: 新增卡片大小/布局设置（默认/舒适/大卡三档）`

---

## 9. 风险点

| 风险 | 等级 | 缓解 |
| :--- | :--- | :--- |
| `large` 档 12 格装不下 13 张卡 | 🔴 高 | 必须删卡或允许滚动，**需用户决策**；本轮 plan 不擅自定 |
| `comfort` 档 cell 强制 225 可能触发纵向滚动 | 🟡 中 | 可接受（用户诉求即"宁可滚动也要看清"）；不满意可回退 default |
| `getGridMetrics` 拖拽坐标在 4 列分支下错位 | 🟡 中 | `large` 档落地时必须 CDP 实测拖拽 4 个角点 |
| 切换档位时 `cardLayout` 旧持久化坐标错位 | 🟡 中 | 切换时调用 `resetLayout()` 清空 `cardLayout`，按新 DEFAULT_LAYOUT 重建 |
| 旧 data.json 无 `layoutSize` 字段 | 🟢 低 | optional + fallback `'default'`，零迁移 |
| 用户口径歧义（"3 行×4 列" 是否 = 4 列×3 行） | 🟡 中 | 本 plan 按"3 行高 × 4 列宽"解读；落地前与用户确认 |
| `GRID_GAP` 任务描述为 12、实测为 8 | 🟢 低 | 以代码为准（8），HANDOFF.md 一致 |
| esbuild 不做类型检查 | 🟢 低 | 新字段一律 optional 渐进，运行期暴露类型错误 |

---

## 10. 落地决策待用户确认项

本轮 plan 已完成探测与方案设计，**实施前需用户确认**：

1. **`large` 档采用哪种重排方案**？
   - A：删除 5 张卡（nav/create/search/subscriptions/sports）保留 8 张
   - B：保留全部 13 张、接受纵向滚动
   - C：合并顶行 1×1 为 2×1（违反"内容不变形"铁律，不推荐）
2. **`comfort` 档 cell 下限**：225px（scale 0.75）是否合适？或调 200/240？
3. **版本号**：4.9.4 还是直接 4.10.0？
4. **是否本轮即开始实施**？任务要求"只探测+写计划"，若用户后续指示实施再动手。

---

> 计划文件路径：`D:\workspace\01_Projects\obsidian-smart-dashboard\HANDOFF_layout_size_plan.md`
