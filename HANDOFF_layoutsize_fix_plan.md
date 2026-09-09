# Smart Dashboard 布局快照修复计划

> 仅分析与计划文件，未修改任何源码。所有行号基于当前 `main.ts`。

---

## §0 现状核实

### 0.1 `getLayoutSize` / `setLayoutSize`（L596-607）

```ts
async getLayoutSize(): Promise<'small' | 'big'> {
    const data = await this.loadData();
    return data?.layoutSize === 'big' ? 'big' : 'small';
}

async setLayoutSize(size: 'small' | 'big'): Promise<void> {
    const data = (await this.loadData()) || {};   // 先取整体
    data.layoutSize = size;                       // 改单字段
    data.cardLayout = undefined;                  // 切换档位清空持久化布局
    await this.saveData(data);                    // 整体写回
}
```

- 合并写已正确（先 `loadData` 再 `saveData`），保留 `skin/cardVisibility/navEntries`。
- **Bug 根因**：L605 把 `cardLayout` 置 `undefined`，导致切档后源档位用户拖拽位置彻底丢失，且无快照机制。
- `layoutSmall` / `layoutBig` 两个字段在当前代码中 **完全未出现**（grep 无匹配），是本次需新增的快照字段。

### 0.2 `loadLayout`（L1759-1764）

```ts
private async loadLayout(): Promise<void> {
    let data: any = null;
    try { data = await this.plugin.loadData(); } catch { }
    this.layoutSize = data?.layoutSize === 'big' ? 'big' : 'small';
    this.layoutData = (data && data.cardLayout) ? data.cardLayout : {...SmartDashboardView.DEFAULT_LAYOUT};
}
```

- 只读 `cardLayout`，**未读 `layoutSmall` / `layoutBig`**。
- `this.layoutData` 即当前档位内存布局，后续 `applyLayout` / `reflowLayoutForVisibleCards` 都基于它。

### 0.3 `applyLayout` / `applyLayoutCompact`（L1766-1775, L1899-1906）

- `applyLayout`：按 `this.layoutData[card.id]` 的 `x/y/w/h` 设 `gridColumn` / `gridRow`。
- `applyLayoutCompact`：清空 `gridColumn` / `gridRow`（窄屏 2 列流式，不读 layoutData）。

### 0.4 `saveLayout`（L1777-1783）

```ts
private async saveLayout(): Promise<void> {
    try {
        const data = (await this.plugin.loadData()) || {};
        data.cardLayout = this.layoutData;
        await this.plugin.saveData(data);
    } catch { }
}
```

- 合并写正确。用户每次拖拽后 `bindCardDrag` 会调 `saveLayout`，故 `data.cardLayout` 始终是当前档位实时布局的可靠副本。
- **未写 `layoutSmall` / `layoutBig`**。

### 0.5 `resetLayout`（L1785-1796）+ 按钮挂载（L1549-1555）

```ts
private async resetLayout(): Promise<void> {
    this.layoutData = {...SmartDashboardView.DEFAULT_LAYOUT};
    const grid = this.contentEl.querySelector('.sd-grid') as HTMLElement;
    const cols = parseInt(grid?.style.getPropertyValue('--sd-cols') || '', 10) || 6;
    if (cols < 4) this.applyLayoutCompact(); else this.applyLayout();
    try {
        const data = (await this.plugin.loadData()) || {};
        data.cardLayout = undefined;              // ← 清空用户位置
        await this.plugin.saveData(data);
    } catch { }
    new Notice('布局已重置为默认');
}
```

按钮在 `onOpen` Hero 行（L1550-1555）：`text: '↺ 重置布局'`，`onclick = () => { this.resetLayout(); }`。

- **Bug**：恢复出厂 `DEFAULT_LAYOUT` 且 `data.cardLayout = undefined`，抹掉用户自定义位置；未读取 `layoutSmall/layoutBig` 快照。

### 0.6 `onOpen` 预置列数（L1582-1586）

```ts
await this.loadLayout();
const grid = content.createDiv('sd-grid');
grid.style.setProperty('--sd-cols', this.layoutSize === 'big' ? '4' : '6');
```

随后 L1593 无条件调用 `await this.reflowLayoutForVisibleCards(visibleIds);`。

### 0.7 `setupGridSizing` 大档分支（L1838-1849）

```ts
if (this.layoutSize === 'big') {
    const cell = Math.floor((availW - gap * 3) / 4);   // 4 列 → 3 个 gap
    if (cell < 40) return;
    grid.style.setProperty('--sd-cols', '4');
    grid.style.setProperty('--sd-cell', `${cell}px`);
    this.applyLayout();
    this.applyScale();
    return;
}
```

小档（宽屏）走 L1851 起 6 列正方形分支。窄屏（`availW < 700`）走 L1828 2 列流式 `applyLayoutCompact`。三档列数与档位映射不变。

### 0.8 `reflowLayoutForVisibleCards`（L2067-2126）

- 只在 `onOpen` L1593 调用一次（grep 确认）。
- 读取 `this.layoutData[id]` 的 **`w/h`**（不读 `x/y` 做定位），按 `y/x` 排序后贪心重排，最后 `this.layoutData = next; applyLayout(); saveLayout();`。
- **关键**：即使 `loadLayout` 读到了目标档快照，`reflow` 也会按列数重新贪心摆放，**覆盖快照里的 `x/y`**。因此要让"切档载入快照保留位置"真正生效，必须让 `reflow` 在"已加载合法布局"时跳过重排——见 §2.3。

### 0.9 设置页下拉（L4083-4094）

```ts
new Setting(containerEl)
    .setName('布局规格')
    .setDesc('小=6×4 紧凑（默认，一屏无滚动）；大=4 列可滚动（每格更大，向下滚动查看全部卡片。切换会重置自定义拖拽位置）')
    .addDropdown(dd => {
        dd.addOption('small', '小（6×4 紧凑）');
        dd.addOption('big', '大（4 列可滚动）');
        dd.setValue(currentLayoutSize);
        dd.onChange(async (v: string) => {
            await this.plugin.setLayoutSize(v as 'small' | 'big');
            await this.plugin.refreshView();
        });
    });
```

`onChange` 链路：`setLayoutSize` → `refreshView` → 重新 `onOpen` → `loadLayout` → `reflowLayoutForVisibleCards`。

---

## §1 修复 A — `resetLayout`（L1785-1796）

### 1.1 目标

按钮改为"恢复当前档位对应的用户快照"；快照不存在则回退出厂默认；**不再清空** `cardLayout`。

### 1.2 改后代码（替换 L1785-1796 整个函数体）

```ts
private async resetLayout(): Promise<void> {
    const data = (await this.plugin.loadData()) || {};
    const snapshot = this.layoutSize === 'big' ? data.layoutBig : data.layoutSmall;
    let noticeMsg: string;
    if (snapshot && typeof snapshot === 'object') {
        // 恢复用户保存的当前档位默认布局
        this.layoutData = {...snapshot};
        noticeMsg = '已恢复为你保存的默认布局';
    } else {
        // 无快照，回退出厂默认
        this.layoutData = {...SmartDashboardView.DEFAULT_LAYOUT};
        noticeMsg = '已重置为出厂默认';
    }
    const grid = this.contentEl.querySelector('.sd-grid') as HTMLElement;
    const cols = parseInt(grid?.style.getPropertyValue('--sd-cols') || '', 10) || 6;
    if (cols < 4) this.applyLayoutCompact(); else this.applyLayout();
    try {
        // 合并写：保留 skin/cardVisibility/navEntries/layoutSize/layoutSmall/layoutBig
        // 把恢复后的布局写回 cardLayout，绝不再清空
        data.cardLayout = this.layoutData;
        await this.plugin.saveData(data);
    } catch { /* 持久化失败不阻断 UI 恢复 */ }
    new Notice(noticeMsg);
}
```

### 1.3 数据流

```
读 data → 取 layoutBig/layoutSmall（按当前 layoutSize）
  ├─ 快照存在：layoutData = 快照副本；Notice "已恢复为你保存的默认布局"
  └─ 快照缺失：layoutData = DEFAULT_LAYOUT 副本；Notice "已重置为出厂默认"
按 cols 选择 applyLayoutCompact / applyLayout
合并写：data.cardLayout = layoutData（不再 = undefined）
saveData → data.json
```

### 1.4 字段影响

- `cardLayout`：由 `undefined` 改为写入恢复后的布局（保留用户位置）。
- `layoutSmall` / `layoutBig`：**不动**（resetLayout 只读不写快照，快照由 setLayoutSize 负责）。
- `layoutSize` / `skin` / `cardVisibility` / `navEntries`：不动（合并写保留）。

---

## §2 修复 B — `setLayoutSize`（L602-607）+ 衔接改动

### 2.1 目标

切档时先把当前档位实时布局存进对应快照，再载入目标档位快照（无则 `undefined` 让 `onOpen` 用 `DEFAULT_LAYOUT` + `reflow` 重排），全程不丢位置。

### 2.2 改后代码（替换 L602-607 整个函数体）

```ts
async setLayoutSize(size: 'small' | 'big'): Promise<void> {
    const data = (await this.loadData()) || {};
    const currentSize: 'small' | 'big' = data?.layoutSize === 'big' ? 'big' : 'small';

    // 1) 切走前：把当前档位的实时布局存进源档快照字段
    //    data.cardLayout 由 view.saveLayout 在拖拽时持续更新，即"当前档位实时布局"
    if (currentSize === 'small') {
        data.layoutSmall = data.cardLayout;
    } else {
        data.layoutBig = data.cardLayout;
    }

    // 2) 切换档位
    data.layoutSize = size;

    // 3) 载入目标档位已存快照；无快照则置 undefined，让 onOpen→loadLayout 回退 DEFAULT_LAYOUT
    const targetSnapshot = size === 'big' ? data.layoutBig : data.layoutSmall;
    data.cardLayout = (targetSnapshot && typeof targetSnapshot === 'object')
        ? targetSnapshot
        : undefined;

    await this.saveData(data);
}
```

### 2.3 衔接：`reflowLayoutForVisibleCards` 加"已合法则跳过重排"早返回

**为何必须**：`onOpen` L1593 无条件调 `reflowLayoutForVisibleCards`。该函数读 `layoutData[id].w/h` 后贪心重排，会**覆盖快照里的 `x/y`**。要让"切档载入快照"真正保留用户位置，必须在 `reflow` 开头加早返回——仅当 `layoutData` 已完整覆盖所有可见卡、无重叠、且坐标在当前列数范围内时，直接 `applyLayout` 返回，不重排。

在 `reflowLayoutForVisibleCards`（L2067-2073 的 `if (cols < 4) return;` 之后）插入：

```ts
// 衔接 setLayoutSize 快照：若已加载的布局在当前列数下完整且无重叠，保留用户拖拽位置，不重排
const allHaveCoords = visibleIds.every(id => this.layoutData[id]);
if (allHaveCoords) {
    const placed: Array<{x: number; y: number; w: number; h: number}> = [];
    let collision = false;
    let outOfBounds = false;
    for (const id of visibleIds) {
        const p = this.layoutData[id];
        if (p.x < 1 || p.y < 1 || p.x + p.w - 1 > cols) { outOfBounds = true; break; }
        const cur = {x: p.x, y: p.y, w: p.w, h: p.h};
        if (placed.some(o => cur.x < o.x + o.w && cur.x + cur.w > o.x && cur.y < o.y + o.h && cur.y + cur.h > o.y)) {
            collision = true; break;
        }
        placed.push(cur);
    }
    if (!collision && !outOfBounds) {
        this.applyLayout();
        return;   // 快照合法，保留位置，不重排、不触发 saveLayout
    }
    // 否则继续走原有重排逻辑
}
```

后续原逻辑（`visibleEntries` 收集 → 排序 → 贪心摆放 → `this.layoutData = next; applyLayout(); saveLayout;`）保持不变。

**行为不变性**：
- 首次打开（无 `cardLayout`、无快照）：`loadLayout` 回退 `DEFAULT_LAYOUT` → `reflow` 检测 `DEFAULT_LAYOUT` 在 6 列下合法 → 早返回 `applyLayout`。若 `DEFAULT_LAYOUT` 恰有越界/重叠（理论上不应有），则继续重排，与现状一致。
- 可见性变化（用户隐藏/显示卡）：`visibleIds` 变化 → `allHaveCoords` 可能 false（新显示的卡无坐标）→ 走原有重排。
- 切档有快照：`loadLayout` 读快照 → `reflow` 检测快照在目标列数下合法 → 早返回，位置保留。
- 切档无快照：`loadLayout` 回退 `DEFAULT_LAYOUT` → `reflow` 检测 `DEFAULT_LAYOUT` 在目标列数（4 或 6）下是否合法 → 合法则保留默认布局，否则重排。

> 注：`DEFAULT_LAYOUT` 是 6 列紧凑布局，切到 4 列时 `x+w-1 > 4` 多半越界 → `outOfBounds=true` → 走重排，与现状一致。

### 2.4 数据流（切到 big 为例）

```
源档 small → setLayoutSize('big')
  1. data.layoutSmall = data.cardLayout        // 存小档快照
  2. data.layoutSize = 'big'
  3. targetSnapshot = data.layoutBig
     ├─ 存在：data.cardLayout = layoutBig
     └─ 不存在：data.cardLayout = undefined
  4. saveData
→ refreshView → onOpen
  → loadLayout: layoutSize='big'; layoutData = data.cardLayout 或 DEFAULT_LAYOUT
  → reflowLayoutForVisibleCards:
       allHaveCoords?
         ├─ 是 + 合法：applyLayout 早返回（保留快照位置）
         └─ 否：原有重排（按 4 列贪心摆放）→ saveLayout
```

切回 small 对称：`data.layoutBig = data.cardLayout`（存大档快照）→ `data.cardLayout = data.layoutSmall 或 undefined`。

### 2.5 `cardLayout` 最终值

- 切到 big：`data.cardLayout = data.layoutBig`（若存在），否则 `undefined`。
- 切到 small：`data.cardLayout = data.layoutSmall`（若存在），否则 `undefined`。
- 若 `undefined`，`onOpen→loadLayout` 用 `DEFAULT_LAYOUT`，`reflow` 重排后 `saveLayout` 会写入重排结果。

### 2.6 与 `onOpen` / `loadLayout` 的衔接

- `loadLayout` 无需改动：它已读 `data.cardLayout`，快照在 `setLayoutSize` 阶段已写入 `data.cardLayout`。
- `onOpen` 无需改动：`loadLayout` → `reflowLayoutForVisibleCards` 链路不变，仅在 `reflow` 内部加早返回。
- `saveLayout` 无需改动：拖拽时仍写 `data.cardLayout`，下次切走时由 `setLayoutSize` 把它搬进 `layoutSmall/layoutBig`。

### 2.7 字段影响

- `layoutSmall` / `layoutBig`：由切走时的源档 `cardLayout` 写入（首次切走即建立）。
- `cardLayout`：目标档快照或 `undefined`（与现状的 `undefined` 行为一致地让 `loadLayout` 回退，但语义从"清空丢位置"变为"无快照才回退"）。
- `layoutSize` / `skin` / `cardVisibility` / `navEntries`：不动。

---

## §3 文案更新 — 设置页下拉描述（L4085）

### 3.1 改动

`setDesc` 当前文案：

> 小=6×4 紧凑（默认，一屏无滚动）；大=4 列可滚动（每格更大，向下滚动查看全部卡片。切换会重置自定义拖拽位置）

改为：

> 小=6×4 紧凑（默认，一屏无滚动）；大=4 列可滚动（每格更大，向下滚动查看全部卡片。切换会保存当前尺寸布局并载入目标尺寸已存布局）

### 3.2 改后片段（L4083-4094）

```ts
new Setting(containerEl)
    .setName('布局规格')
    .setDesc('小=6×4 紧凑（默认，一屏无滚动）；大=4 列可滚动（每格更大，向下滚动查看全部卡片。切换会保存当前尺寸布局并载入目标尺寸已存布局）')
    .addDropdown(dd => {
        dd.addOption('small', '小（6×4 紧凑）');
        dd.addOption('big', '大（4 列可滚动）');
        dd.setValue(currentLayoutSize);
        dd.onChange(async (v: string) => {
            await this.plugin.setLayoutSize(v as 'small' | 'big');
            await this.plugin.refreshView();
        });
    });
```

仅改 `setDesc` 字符串，其余不动。

---

## §4 验证方案

### 4.1 构建

1. `npm run build`（或仓库 `package.json` 指定的构建命令）通过，无 TS 报错。
2. 在 Obsidian 中加载插件，确认无 console 报错。

### 4.2 切档不丢位置（修复 B）

1. 进入看板，默认 small 档。手动拖拽若干卡片到自定义位置（例如把 `sd-calendar-section` 拖到右下角）。
2. 打开 `data.json`，记录 `cardLayout` 与 `layoutSize='small'`。此时 `layoutSmall`/`layoutBig` 应仍不存在。
3. 设置页切到 **big**。
   - 预期 `data.json`：`layoutSmall` = 切换前的 `cardLayout`；`layoutSize='big'`；`cardLayout` = `layoutBig`（首次切换应为 `undefined`）。
   - UI：big 档 4 列，卡片按 DEFAULT 重排（首次无快照）。
4. 在 big 档拖拽几张卡片到自定义位置 → `data.json` 的 `cardLayout` 更新。
5. 切回 **small**。
   - 预期：`layoutBig` = 步骤 4 的 big 布局；`cardLayout` = 步骤 2 保存的 `layoutSmall`；`layoutSize='small'`。
   - UI：small 档 6 列，卡片回到步骤 1-2 的自定义位置（**关键验证点**）。
6. 再切到 **big** → 应回到步骤 4 的 big 自定义位置。
7. 反复切换 small ↔ big 各两次，确认 `layoutSmall` / `layoutBig` / `cardLayout` 三者始终不丢、各档位置稳定。

### 4.3 重置按钮恢复快照（修复 A）

1. small 档下拖拽卡片到自定义位置 → 切 big → 切回 small（让 `layoutSmall` 建立并保留 small 自定义布局）。
2. 在 small 档再拖拽一次（让 `cardLayout` 偏离 `layoutSmall`）。
3. 点看板顶部「↺ 重置布局」按钮。
   - 预期：Notice **"已恢复为你保存的默认布局"**；UI 回到 `layoutSmall` 保存的位置（步骤 1-2 的位置，不是步骤 2 之后的新拖拽）。
   - `data.json`：`cardLayout` = `layoutSmall`（不再 `undefined`）。
4. 清空 `layoutSmall` / `layoutBig`（手动改 `data.json` 删除字段）后重载插件，small 档点重置。
   - 预期：Notice **"已重置为出厂默认"**；UI 回到 `DEFAULT_LAYOUT`；`data.json` 的 `cardLayout` = `DEFAULT_LAYOUT` 副本。
5. big 档重复 1-4，验证 `layoutBig` 分支对称行为。

### 4.4 CDP 实测（13 张卡无重叠、列数正确）

1. Obsidian 开发者工具（Ctrl+Shift+I）Console：
   ```js
   // 确认当前列数
   getComputedStyle(document.querySelector('.sd-grid')).getPropertyValue('--sd-cols')
   // 应为 '6'（small）或 '4'（big），窄屏 '2'
   ```
2. 切 small：`--sd-cols=6`；切 big：`--sd-cols=4`。
3. 遍历所有 `.sd-card[id]`，读 `gridColumn` / `gridRow`，**13 张卡两两无重叠**（脚本检查 `x,y,w,h` 矩形相交）。
4. 每张卡的 `w/h` 与 `DEFAULT_LAYOUT` 中定义的占格数一致（约束：未改卡片占格数）。
5. small 档一屏无滚动、big 档纵向可滚动（`.sd-tab-content-container` 的 `overflow-y:auto` 触发）。

### 4.5 回归检查

- 切档后 `skin` / `cardVisibility` / `navEntries` 字段保持不变（合并写未覆盖）。
- 窄屏（`availW < 700`）仍走 2 列流式 `applyLayoutCompact`，不读快照。
- 拖拽后 `saveLayout` 仍只写 `cardLayout`，不动快照字段；下次切档时由 `setLayoutSize` 搬运到快照。
- 重置按钮在窄屏下（`cols < 4`）仍走 `applyLayoutCompact`，但 `data.cardLayout` 仍写入恢复后的布局（供下次宽屏使用）。

---

## 附：改动清单（仅列待改位置，不在本计划阶段执行）

| 位置 | 函数 | 改动类型 |
|------|------|----------|
| L602-607 | `setLayoutSize` | 重写函数体（存源档快照 + 载目标档快照） |
| L1785-1796 | `resetLayout` | 重写函数体（读快照恢复 + 不清空 cardLayout） |
| L2067-2073 之后 | `reflowLayoutForVisibleCards` | 插入"已合法则跳过重排"早返回 |
| L4085 | 设置页 `setDesc` | 改文案 |

不动：`getLayoutSize` / `loadLayout` / `applyLayout` / `applyLayoutCompact` / `saveLayout` / `onOpen` 预置列数 / `setupGridSizing` 各分支 / 卡片 `w/h` / `DEFAULT_LAYOUT`。
