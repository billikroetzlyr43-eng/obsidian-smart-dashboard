import { Plugin, ItemView, WorkspaceLeaf, TFile, Notice, Modal, Setting, App, moment, PluginSettingTab } from 'obsidian';
import Chart from 'chart.js/auto';

export const VIEW_TYPE_SMART_DASHBOARD = "smart-dashboard-view";

type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface ScheduleItem {
    id: string;
    date: string;
    endDate?: string;
    time: string;
    endTime?: string;
    title: string;
    content: string;
    repeat?: RepeatType;
}

interface SubTask {
    id: string;
    text: string;
    completed: boolean;
}

interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    date?: string;
    time?: string;
    deadline?: string;
    subtasks?: SubTask[];
    priority?: 'high' | 'mid' | 'low';
    repeat?: RepeatType;      // 周期待办：如每年生日
    lastCompleted?: string;   // 周期待办最近一次完成日期（YYYY-MM-DD）
}

interface MoodItem {
    emoji: string;
    text: string;
}

// ===== D-Day 倒计时 =====
interface CountdownItem {
    id: string;
    title: string;
    targetDate: string; // YYYY-MM-DD
}

// ===== 导航入口卡片 =====
interface NavEntry {
    id: string;
    icon: string;
    name: string;
    desc: string;
    path: string; // 库内文件夹或 md 文件路径
}

const DAILY_DIR = '05_事件记录';

const DEFAULT_NAV_ENTRIES: NavEntry[] = [
    { id: 'nav-inbox', icon: '📦', name: '收集箱', desc: '待处理速记与随笔', path: '01_Inbox' },
    { id: 'nav-wiki', icon: '📚', name: '知识库', desc: '沉淀后的常青笔记', path: '02_Wiki' },
    { id: 'nav-personal', icon: '👤', name: '个人空间', desc: '交易复盘/想法/踩坑', path: '04_个人空间' },
    { id: 'nav-events', icon: '📅', name: '事件记录', desc: '日记与事件归档', path: DAILY_DIR },
    { id: 'nav-archive', icon: '🗄️', name: '归档', desc: '不再活跃的资料', path: '03_Archive' },
];

// ===== 主题皮肤预设（灵感：小红书九大流派调色板） =====
const SD_SKINS: Record<string, { label: string; accent: string; accentHover: string }> = {
    warm:     { label: '🌅 暖橙（默认）', accent: '#F4A261', accentHover: '#E76F51' },
    violet:   { label: '🟣 香芋紫',       accent: '#8b6cef', accentHover: '#7C4DFF' },
    gold:     { label: '🥇 暗棕金',       accent: '#c9a15e', accentHover: '#d9b36c' },
    terminal: { label: '💠 金融终端蓝',   accent: '#58a6ff', accentHover: '#79b8ff' },
};

// ===== 公历固定节日（MM-DD → 名称，按年展开）=====
const FESTIVALS: Record<string, string> = {
    '01-01': '元旦',   '02-14': '情人节', '03-08': '妇女节', '03-12': '植树节',
    '04-01': '愚人节', '05-01': '劳动节', '05-04': '青年节', '06-01': '儿童节',
    '07-01': '建党节', '08-01': '建军节', '09-10': '教师节', '10-01': '国庆节',
    '10-31': '万圣夜', '12-24': '平安夜', '12-25': '圣诞节',
};

// ===== 二十四节气（寿星公式推算日期，21世纪 C 值；个别年份可能有 ±1 天误差）=====
const SOLAR_TERMS_21C: Array<{ name: string; month: number; c: number; lAdj: boolean }> = [
    { name: '小寒', month: 1,  c: 5.4055, lAdj: true  }, { name: '大寒', month: 1,  c: 20.12,  lAdj: true  },
    { name: '立春', month: 2,  c: 3.87,   lAdj: true  }, { name: '雨水', month: 2,  c: 18.73,  lAdj: true  },
    { name: '惊蛰', month: 3,  c: 5.63,   lAdj: false }, { name: '春分', month: 3,  c: 20.646, lAdj: false },
    { name: '清明', month: 4,  c: 4.81,   lAdj: false }, { name: '谷雨', month: 4,  c: 20.1,   lAdj: false },
    { name: '立夏', month: 5,  c: 5.52,   lAdj: false }, { name: '小满', month: 5,  c: 21.04,  lAdj: false },
    { name: '芒种', month: 6,  c: 5.678,  lAdj: false }, { name: '夏至', month: 6,  c: 21.37,  lAdj: false },
    { name: '小暑', month: 7,  c: 7.108,  lAdj: false }, { name: '大暑', month: 7,  c: 22.83,  lAdj: false },
    { name: '立秋', month: 8,  c: 7.5,    lAdj: false }, { name: '处暑', month: 8,  c: 23.13,  lAdj: false },
    { name: '白露', month: 9,  c: 7.646,  lAdj: false }, { name: '秋分', month: 9,  c: 23.042, lAdj: false },
    { name: '寒露', month: 10, c: 8.318,  lAdj: false }, { name: '霜降', month: 10, c: 23.438, lAdj: false },
    { name: '立冬', month: 11, c: 7.438,  lAdj: false }, { name: '小雪', month: 11, c: 22.36,  lAdj: false },
    { name: '大雪', month: 12, c: 7.18,   lAdj: false }, { name: '冬至', month: 12, c: 21.94,  lAdj: false },
];

function solarTermDate(year: number, term: {month: number; c: number; lAdj: boolean}): string {
    const y = year % 100;
    const L = term.lAdj ? Math.floor((y - 1) / 4) : Math.floor(y / 4);
    const day = Math.floor(0.2422 * y + term.c) - L;
    return `${year}-${String(term.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 节日+节气合并查询表（按年缓存）
const holidayCacheByYear = new Map<number, Map<string, {name: string; kind: 'festival' | 'term'}>>();
function getHolidayMap(year: number): Map<string, {name: string; kind: 'festival' | 'term'}> {
    let m = holidayCacheByYear.get(year);
    if (!m) {
        m = new Map<string, {name: string; kind: 'festival' | 'term'}>();
        for (const [md, name] of Object.entries(FESTIVALS)) m.set(`${year}-${md}`, {name, kind: 'festival'});
        for (const t of SOLAR_TERMS_21C) m.set(solarTermDate(year, t), {name: t.name, kind: 'term'});
        holidayCacheByYear.set(year, m);
    }
    return m;
}
function getHolidayName(dateStr: string): {name: string; kind: 'festival' | 'term'} | undefined {
    const year = parseInt(dateStr.substring(0, 4));
    return getHolidayMap(year).get(dateStr);
}
/** 今天（含）之后的所有节日/节气，按日期升序 */
function upcomingHolidays(fromDate: string): Array<{date: string; name: string; kind: 'festival' | 'term'}> {
    const results: Array<{date: string; name: string; kind: 'festival' | 'term'}> = [];
    const y0 = parseInt(fromDate.substring(0, 4));
    for (const y of [y0, y0 + 1]) {
        getHolidayMap(y).forEach((v, date) => { if (date >= fromDate) results.push({date, ...v}); });
    }
    results.sort((a, b) => a.date.localeCompare(b.date));
    return results;
}

// ===== 订阅模板配置 =====
const SUBSCRIPTION_TEMPLATES: Record<string, {
    name: string;
    icon: string;
    authType: 'api-key' | 'cookie';
    authHint: string;
    authPlaceholder: string;
    autoDetect?: () => string;
}> = {
    'opencode-go': {
        name: 'OpenCode Go',
        icon: '🤖',
        authType: 'api-key',
        authHint: 'API Key 会自动从 auth.json 读取',
        authPlaceholder: '留空则自动读取',
        autoDetect: () => {
            try {
                const fs = require('fs');
                const path = require('path');
                const authFile = path.join(require('os').homedir(), '.local/share/opencode/auth.json');
                if (fs.existsSync(authFile)) {
                    const auth = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
                    return auth['opencode-go']?.key || '';
                }
            } catch {}
            return '';
        }
    },
    'zhipu-glm': {
        name: '智谱 GLM',
        icon: '🔍',
        authType: 'cookie',
        authHint: '从浏览器登录 open.bigmodel.cn 后，F12 → Network → 复制 Cookie',
        authPlaceholder: '粘贴 Cookie 值'
    },
    'volcengine': {
        name: '火山方舟',
        icon: '🌋',
        authType: 'cookie',
        authHint: '登录 console.volcengine.com 后，F12 → Application → Cookies，复制 console.volcengine.com 域完整 Cookie（含 userInfo/csrfToken/AccountID）',
        authPlaceholder: '粘贴 Cookie 值'
    },
    'scnet-tokenplan': {
            name: '超算 Token Plan',
            icon: '🖥️',
            authType: 'cookie',
            authHint: '登录 scnet.cn 控制台后，F12 → Console → document.cookie，复制 Token= 后面的值',
            authPlaceholder: '粘贴 Token 值'
        },
        'deepseek': {
            name: 'DeepSeek',
            icon: '🐬',
            authType: 'api-key',
            authHint: 'DeepSeek 官方 API Key（platform.deepseek.com 创建，sk- 开头）',
            authPlaceholder: '粘贴 API Key'
        }
    };

// ===== 添加订阅模态框 =====
class AddSubscriptionModal extends Modal {
    private providerId: string;
    private credentialValue: string = '';
    private onSubmit: (providerId: string, credential: string) => void;

    constructor(app: App, providerId: string, onSubmit: (providerId: string, credential: string) => void) {
        super(app);
        this.providerId = providerId;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        const template = SUBSCRIPTION_TEMPLATES[this.providerId];
        
        if (!template) {
            contentEl.createDiv({ text: '未知的订阅类型' });
            return;
        }

        // 标题
        const header = contentEl.createDiv({ cls: 'sd-modal-header' });
        header.createDiv({ text: template.icon, cls: 'sd-modal-icon' });
        header.createDiv({ text: `添加 ${template.name}`, cls: 'sd-modal-title' });

        // 认证方式说明
        contentEl.createDiv({ 
            text: template.authHint, 
            cls: 'sd-modal-hint' 
        });

        // 输入框
        const inputSetting = new Setting(contentEl)
            .setName(template.authType === 'api-key' ? 'API Key' : 'Cookie')
            .addText(text => {
                text.setPlaceholder(template.authPlaceholder);
                text.inputEl.style.width = '100%';
                text.onChange(value => this.credentialValue = value);
            });

        // 如果有自动检测功能，尝试填充
        if (template.autoDetect) {
            const autoValue = template.autoDetect();
            if (autoValue) {
                inputSetting.setDesc('✅ 已自动检测到 API Key');
            }
        }

        // 按钮
        const buttonDiv = contentEl.createDiv({ cls: 'sd-modal-buttons' });
        
        buttonDiv.createEl('button', { text: '取消', cls: 'sd-btn' })
            .addEventListener('click', () => this.close());
        
        buttonDiv.createEl('button', { text: '确认添加', cls: 'sd-btn primary' })
            .addEventListener('click', () => {
                this.onSubmit(this.providerId, this.credentialValue);
                this.close();
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ===== 删除确认模态框 =====
class DeleteConfirmModal extends Modal {
    private providerName: string;
    private providerIcon: string;
    private onConfirm: () => void;

    constructor(app: App, providerName: string, providerIcon: string, onConfirm: () => void) {
        super(app);
        this.providerName = providerName;
        this.providerIcon = providerIcon;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;

        // 标题
        const header = contentEl.createDiv({ cls: 'sd-modal-header' });
        header.createDiv({ text: '⚠️', cls: 'sd-modal-icon' });
        header.createDiv({ text: '确认删除', cls: 'sd-modal-title' });

        // 内容
        contentEl.createDiv({ 
            text: `确定要删除 ${this.providerIcon} ${this.providerName} 吗？`, 
            cls: 'sd-modal-content' 
        });
        contentEl.createDiv({ 
            text: '此操作不可撤销，需要重新添加才能恢复。', 
            cls: 'sd-modal-warning' 
        });

        // 按钮
        const buttonDiv = contentEl.createDiv({ cls: 'sd-modal-buttons' });
        
        buttonDiv.createEl('button', { text: '取消', cls: 'sd-btn' })
            .addEventListener('click', () => this.close());
        
        buttonDiv.createEl('button', { text: '确认删除', cls: 'sd-btn danger' })
            .addEventListener('click', () => {
                this.onConfirm();
                this.close();
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ===== 选择订阅类型模态框 =====
class SelectSubscriptionModal extends Modal {
    private onSelect: (providerId: string) => void;

    constructor(app: App, onSelect: (providerId: string) => void) {
        super(app);
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;

        // 标题
        contentEl.createDiv({ text: '选择要添加的订阅', cls: 'sd-modal-title' });

        // 订阅列表
        const list = contentEl.createDiv({ cls: 'sd-subscription-select-list' });
        
        for (const [id, template] of Object.entries(SUBSCRIPTION_TEMPLATES)) {
            const item = list.createDiv({ cls: 'sd-subscription-select-item' });
            item.createDiv({ text: template.icon, cls: 'sd-subscription-select-icon' });
            item.createDiv({ text: template.name, cls: 'sd-subscription-select-name' });
            
            item.addEventListener('click', () => {
                this.onSelect(id);
                this.close();
            });
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

class CreateTradeModal extends Modal {
    plugin: SmartDashboardPlugin;
    tickers: string[];
    onSubmit: (date: string, ticker: string, action: string, price: string, volume: string) => void;
    
    constructor(app: App, plugin: SmartDashboardPlugin, tickers: string[], onSubmit: (date: string, ticker: string, action: string, price: string, volume: string) => void) {
        super(app);
        this.plugin = plugin;
        this.tickers = tickers;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.createEl('h2', {text: `💹 快捷录入交易复盘`});

        let tradeDate = moment().format('YYYY-MM-DD');
        let ticker = '';
        let action = '买入';
        let price = '';
        let volume = '';

        // Datalist for tickers
        const datalistId = 'tickers-datalist-' + Date.now();
        const datalist = contentEl.createEl('datalist', {attr: {id: datalistId}});
        this.tickers.forEach(t => datalist.createEl('option', {attr: {value: t}}));

        new Setting(contentEl)
            .setName('交易日期')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(tradeDate);
                text.onChange(value => tradeDate = value);
            });

        new Setting(contentEl)
            .setName('交易标的')
            .addText(text => {
                text.setPlaceholder('如: 贵州茅台 (600519)');
                text.inputEl.setAttribute('list', datalistId);
                text.onChange(value => ticker = value);
            });
            
        new Setting(contentEl)
            .setName('操作类型')
            .addDropdown(drop => {
                drop.addOption('买入', '买入');
                drop.addOption('卖出', '卖出');
                drop.onChange(value => action = value);
            });
            
        new Setting(contentEl)
            .setName('成交价格')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.step = '0.01';
                text.setPlaceholder('如: 15.2');
                text.onChange(value => price = value);
            });
            
        new Setting(contentEl)
            .setName('成交数量/金额')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.step = '100';
                text.setPlaceholder('如: 1000 (股)');
                text.onChange(value => volume = value);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('一键生成')
                .setCta()
                .onClick(() => {
                    if (!ticker) {
                        new Notice('请输入交易标的！');
                        return;
                    }
                    this.close();
                    this.onSubmit(tradeDate, ticker, action, price, volume);
                })
            );
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

class EditTradeModal extends Modal {
    plugin: SmartDashboardPlugin;
    trade: any;
    tickers: string[];
    onSubmit: (updatedTrade: any) => void;
    
    constructor(app: App, plugin: SmartDashboardPlugin, trade: any, tickers: string[], onSubmit: (updatedTrade: any) => void) {
        super(app);
        this.plugin = plugin;
        this.trade = trade;
        this.tickers = tickers;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.createEl('h2', {text: `✏️ 编辑交易记录`});

        let tradeDate = this.trade.date || moment(this.trade.timestamp).format('YYYY-MM-DD');
        let ticker = this.trade.ticker || '';
        let action = this.trade.action || '买入';
        let price = this.trade.price || '';
        let volume = this.trade.volume || '';

        // Datalist for tickers
        const datalistId = 'tickers-datalist-edit-' + Date.now();
        const datalist = contentEl.createEl('datalist', {attr: {id: datalistId}});
        this.tickers.forEach(t => datalist.createEl('option', {attr: {value: t}}));

        new Setting(contentEl)
            .setName('交易日期')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(tradeDate);
                text.onChange(value => tradeDate = value);
            });

        new Setting(contentEl)
            .setName('交易标的')
            .addText(text => {
                text.inputEl.setAttribute('list', datalistId);
                text.setValue(ticker);
                text.onChange(value => ticker = value);
            });
            
        new Setting(contentEl)
            .setName('操作类型')
            .addDropdown(drop => {
                drop.addOption('买入', '买入');
                drop.addOption('卖出', '卖出');
                drop.setValue(action);
                drop.onChange(value => action = value);
            });
            
        new Setting(contentEl)
            .setName('成交价格')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.step = '0.01';
                text.setValue(price.toString());
                text.onChange(value => price = value);
            });
            
        new Setting(contentEl)
            .setName('成交数量/金额')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.step = '100';
                text.setValue(volume.toString());
                text.onChange(value => volume = value);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('保存')
                .setCta()
                .onClick(() => {
                    if (!ticker) {
                        new Notice('请输入交易标的！');
                        return;
                    }
                    this.close();
                    const updatedTrade = { ...this.trade, date: tradeDate, ticker, action, price: parseFloat(price.toString()), volume: parseFloat(volume.toString()) };
                    this.onSubmit(updatedTrade);
                })
            );
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

export default class SmartDashboardPlugin extends Plugin {
    async onload() {
        try {
            this.registerView(
                VIEW_TYPE_SMART_DASHBOARD,
                (leaf) => new SmartDashboardView(leaf, this)
            );

            this.addSettingTab(new SmartDashboardSettingTab(this.app, this));

            const ribbonIconEl = this.addRibbonIcon('layout-dashboard', `Smart Dashboard ${this.manifest.version}`, () => {
                this.activateView();
            });
            
            // Automatically open the dashboard on startup if not already open
            this.app.workspace.onLayoutReady(() => {
                try {
                    if (ribbonIconEl && ribbonIconEl.parentElement && ribbonIconEl.parentElement.firstChild !== ribbonIconEl) {
                        ribbonIconEl.parentElement.insertBefore(ribbonIconEl, ribbonIconEl.parentElement.firstChild);
                    }
                    this.activateView();
                } catch (e) {
                    console.error("SmartDashboard onLayoutReady warning:", e);
                }
            });
        } catch (e) {
            console.error("SmartDashboard onload error:", e);
        }
    }

    async activateView() {
        try {
            const { workspace } = this.app;
            let leaf = workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD)[0];
            if (!leaf) {
                leaf = workspace.getLeaf('tab');
                await leaf.setViewState({ type: VIEW_TYPE_SMART_DASHBOARD, active: true });
            }
            workspace.revealLeaf(leaf);
        } catch (e) {
            console.error("SmartDashboard activateView error:", e);
        }
    }

    async getCardVisibility(): Promise<Record<string, boolean>> {
        const data = await this.loadData();
        return data?.cardVisibility ?? {};
    }

    async setCardVisibility(cardId: string, visible: boolean): Promise<void> {
        const data = (await this.loadData()) || {};
        if (!data.cardVisibility) data.cardVisibility = {};
        data.cardVisibility[cardId] = visible;
        await this.saveData(data);
    }

    // ===== 主题皮肤 =====
    async getSkin(): Promise<string> {
        const data = await this.loadData();
        return (data?.skin && SD_SKINS[data.skin]) ? data.skin : 'warm';
    }

    async setSkin(skin: string): Promise<void> {
        const data = (await this.loadData()) || {};
        data.skin = skin;
        await this.saveData(data);
    }

    // ===== 导航入口配置 =====
    async getNavEntries(): Promise<NavEntry[]> {
        const data = await this.loadData();
        return Array.isArray(data?.navEntries) && data.navEntries.length > 0
            ? data.navEntries : DEFAULT_NAV_ENTRIES.map(e => ({ ...e }));
    }

    async setNavEntries(entries: NavEntry[]): Promise<void> {
        const data = (await this.loadData()) || {};
        data.navEntries = entries;
        await this.saveData(data);
    }

    async refreshView(): Promise<void> {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD);
        for (const leaf of leaves) {
            const view = leaf.view as any;
            if (view) {
                await view.onClose();
                await view.onOpen();
            }
        }
    }
}

class CreatePaperModal extends Modal {
    onSubmitManual: (subject: string) => void;
    
    constructor(app: App, onSubmitManual: (subject: string) => void) {
        super(app);
        this.onSubmitManual = onSubmitManual;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.createEl('h2', {text: `创建 论文`});

        new Setting(contentEl)
            .setName('通过 Zotero 导入')
            .setDesc('唤起 Zotero 插件导入文献')
            .addButton(btn => btn
                .setButtonText('导入')
                .setCta()
                .onClick(() => {
                    this.close();
                    try {
                        const commands = (this.app as any).commands.listCommands();
                        const targetCommand = commands.find((c: any) => c.id.includes('obsidian-zotero-desktop-connector') && c.id.toLowerCase().includes('dashboardimport'));
                        if (targetCommand) {
                            (this.app as any).commands.executeCommandById(targetCommand.id);
                            new Notice('已唤起 Zotero DashboardImport 模板');
                        } else {
                            (this.app as any).commands.executeCommandById('obsidian-zotero-desktop-connector:zdc-import-notes');
                            new Notice('已尝试唤起 Zotero 默认导入命令');
                        }
                    } catch (e) {
                        new Notice('无法调用 Zotero 插件命令');
                    }
                }));

        let subject = '';
        new Setting(contentEl)
            .setName('手动创建')
            .setDesc('输入论文名称，生成标准模板')
            .addText(text => text.onChange(value => subject = value))
            .addButton(btn => btn
                .setButtonText('创建')
                .onClick(() => {
                    if (!subject) {
                        new Notice('请输入论文名称');
                        return;
                    }
                    this.close();
                    this.onSubmitManual(subject);
                }));
    }
    onClose() { this.contentEl.empty(); }
}

class CreateOtherModal extends Modal {
    plugin: SmartDashboardPlugin;
    onCreateNormal: () => void;
    
    constructor(app: App, plugin: SmartDashboardPlugin, onCreateNormal: () => void) {
        super(app);
        this.plugin = plugin;
        this.onCreateNormal = onCreateNormal;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.createEl('h2', {text: `创建 其他笔记`});

        new Setting(contentEl)
            .setName('导入小红书笔记')
            .setDesc('唤起 Xiaohongshu Importer Plus 插件')
            .addButton(btn => btn
                .setButtonText('导入')
                .setCta()
                .onClick(() => {
                    this.close();
                    try {
                        (this.app as any).commands.executeCommandById('xhs-importer:import');
                        new Notice('已唤起小红书导入器');
                    } catch (e) {
                        new Notice('无法调用小红书导入插件，请确保已安装并启用');
                    }
                }));

        new Setting(contentEl)
            .setName('从微信公众号导入')
            .setDesc('唤起微信公众号抓取插件')
            .addButton(btn => btn
                .setButtonText('导入')
                .setCta()
                .onClick(() => {
                    this.close();
                    try {
                        (this.app as any).commands.executeCommandById('obsidian-wechat-fetcher:fetch-wechat-article');
                    } catch (e) {
                        new Notice('无法调用微信导入插件，请确保已安装并启用');
                    }
                }));

        new Setting(contentEl)
            .setName('新建普通空白笔记')
            .addButton(btn => btn
                .setButtonText('新建')
                .onClick(() => {
                    this.close();
                    this.onCreateNormal();
                }));
    }
    onClose() { this.contentEl.empty(); }
}

class CreateNoteModal extends Modal {
    type: string;
    options: string[];
    onSubmit: (subject: string) => void;
    
    constructor(app: App, type: string, options: string[], onSubmit: (subject: string) => void) {
        super(app);
        this.type = type;
        this.options = options;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.createEl('h2', {text: `创建 ${this.type}`});

        let subject = this.options.length > 0 ? this.options[0] : '';
        const label = this.type === '读书笔记' ? '书名' : '学科名称';

        if (this.options.length > 0) {
            new Setting(contentEl).setName(`选择已有${label}`).addDropdown(drop => {
                this.options.forEach(opt => drop.addOption(opt, opt));
                drop.onChange(value => subject = value);
            });
        }
        new Setting(contentEl).setName(`或者输入新的${label}`).addText(text => text.onChange(value => subject = value));
        new Setting(contentEl).addButton(btn => btn.setButtonText('创建').setCta().onClick(() => {
            this.close();
            this.onSubmit(subject);
        }));
    }
    onClose() { this.contentEl.empty(); }
}

class ManageTodoModal extends Modal {
    todo: TodoItem | null;
    plugin: SmartDashboardPlugin;
    onSave: () => void;

    constructor(app: App, plugin: SmartDashboardPlugin, todo: TodoItem | null, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.todo = todo;
        this.onSave = onSave;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.createEl('h2', {text: this.todo ? '编辑待办' : '新建待办'});

        let text = this.todo?.text || '';
        let hasTime = !!(this.todo?.date || this.todo?.time);
        let date = this.todo?.date || moment().format('YYYY-MM-DD');
        let time = this.todo?.time || '';
        let syncSchedule = true;
        let deadline = this.todo?.deadline || '';
        let subtasks = this.todo?.subtasks ? [...this.todo.subtasks] : [];
        let priority: string = this.todo?.priority || 'low';
        let repeat: string = this.todo?.repeat || 'none';

        new Setting(contentEl).setName('内容').addTextArea(ta => {
            ta.setValue(text).onChange(v => text = v);
            ta.inputEl.style.width = '100%';
        });

        new Setting(contentEl).setName('优先级').setDesc('🔴 紧急 / 🟠 重要 / 🔵 常规').addDropdown(dd => {
            dd.addOption('high', '🔴 紧急');
            dd.addOption('mid', '🟠 重要');
            dd.addOption('low', '🔵 常规');
            dd.setValue(priority);
            dd.onChange(v => priority = v);
        });

        // 周期待办（如每年生日提醒）：完成后自动进入下一周期
        new Setting(contentEl).setName('重复').setDesc('周期待办：完成后按周期自动重置').addDropdown(dd => {
            dd.addOption('none', '不重复');
            dd.addOption('daily', '每天');
            dd.addOption('weekly', '每周');
            dd.addOption('monthly', '每月');
            dd.addOption('yearly', '每年');
            dd.setValue(repeat);
            dd.onChange(v => repeat = v);
        });

        const hasTimeSetting = new Setting(contentEl).setName('是否有具体时间？');
        const timeSetting = new Setting(contentEl).setName('时间');
        timeSetting.settingEl.style.display = hasTime ? 'flex' : 'none';
        
        hasTimeSetting.addToggle(toggle => {
            toggle.setValue(hasTime).onChange(v => {
                hasTime = v;
                timeSetting.settingEl.style.display = v ? 'flex' : 'none';
                if (!v) { date = ''; time = ''; }
            });
        });

        timeSetting.addText(t => t.inputEl.type = 'date').addText(t => {
            t.inputEl.type = 'date';
            t.setValue(date).onChange(v => date = v);
        });
        timeSetting.addText(t => {
            t.inputEl.type = 'time';
            t.setValue(time).onChange(v => time = v);
        });

        new Setting(contentEl).setName('截止日期 (Deadline)').addText(t => {
            t.inputEl.type = 'date';
            t.setValue(deadline).onChange(v => deadline = v);
        });

        const subtasksContainer = contentEl.createDiv('sd-subtasks-manage');
        subtasksContainer.createEl('h4', {text: '子任务', attr: {style: 'margin-top: 15px; margin-bottom: 5px'}});
        const subtasksList = subtasksContainer.createDiv();
        
        const renderSubtasks = () => {
            subtasksList.empty();
            subtasks.forEach((st, i) => {
                const row = subtasksList.createDiv({attr: {style: 'display:flex; gap:10px; margin-bottom: 5px'}});
                const input = row.createEl('input', {type: 'text'});
                input.value = st.text;
                input.style.flexGrow = '1';
                input.onchange = () => st.text = input.value;
                const delBtn = row.createEl('button', {text: '❌'});
                delBtn.onclick = () => { subtasks.splice(i, 1); renderSubtasks(); };
            });
        };
        renderSubtasks();

        new Setting(contentEl).addButton(btn => btn.setButtonText('+ 添加子任务').onClick(() => {
            subtasks.push({id: Date.now().toString(), text: '', completed: false});
            renderSubtasks();
        }));

        let syncSetting: Setting | null = null;
        if (!this.todo) {
            syncSetting = new Setting(contentEl).setName('同时添加到日程').setDesc('勾选后自动在日程列表中创建');
            syncSetting.addToggle(toggle => toggle.setValue(syncSchedule).onChange(v => syncSchedule = v));
            syncSetting.settingEl.style.display = hasTime ? 'flex' : 'none';
            hasTimeSetting.components[0].onChange(v => {
                hasTime = v;
                timeSetting.settingEl.style.display = v ? 'flex' : 'none';
                if(syncSetting) syncSetting.settingEl.style.display = v ? 'flex' : 'none';
            });
        }

        const btns = new Setting(contentEl);
        btns.addButton(btn => btn.setButtonText('保存').setCta().onClick(async () => {
            if (!text) { new Notice('内容不能为空'); return; }
            let view = (this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD)[0]?.view as SmartDashboardView);
            if (!view) return;
            
            let todos = await view.getTodos();
            const prio = (priority === 'high' || priority === 'mid' || priority === 'low') ? priority as TodoItem['priority'] : 'low';
            const rep = (['none','daily','weekly','monthly','yearly'].includes(repeat) ? repeat : 'none') as TodoItem['repeat'];
            if (this.todo) {
                const idx = todos.findIndex(t => t.id === this.todo!.id);
                // 从周期改为不重复时，把 lastCompleted 状态物化为 completed
                const wasRepeating = !!this.todo.repeat && this.todo.repeat !== 'none';
                const extra = (!wasRepeating && rep === 'none') ? {} : {};
                const base: TodoItem = { ...this.todo, ...extra };
                if (wasRepeating && rep === 'none') {
                    base.completed = view.todoEffectiveCompleted(base);
                    base.lastCompleted = undefined;
                }
                if (idx >= 0) todos[idx] = { ...base, text, date: hasTime?date:undefined, time: hasTime?time:undefined, deadline: deadline||undefined, subtasks, priority: prio, repeat: rep };
            } else {
                todos.unshift({ id: Date.now().toString(), text, completed: false, date: hasTime?date:undefined, time: hasTime?time:undefined, deadline: deadline||undefined, subtasks, priority: prio, repeat: rep });
                
                if (hasTime && syncSchedule) {
                    let schedules = await view.getSchedules();
                    schedules.push({ id: Date.now().toString()+'_s', date, time, title: text, content: '' });
                    await view.saveSchedules(schedules);
                }
            }
            await view.saveTodos(todos);
            this.close();
            this.onSave();
        }));

        if (this.todo) {
            btns.addButton(btn => btn.setButtonText('删除').setWarning().onClick(async () => {
                let view = (this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD)[0]?.view as SmartDashboardView);
                let todos = await view.getTodos();
                todos = todos.filter(t => t.id !== this.todo!.id);
                await view.saveTodos(todos);
                this.close();
                this.onSave();
            }));
        }
    }
    onClose() { this.contentEl.empty(); }
}

class ManageScheduleModal extends Modal {
    schedule: ScheduleItem | null;
    plugin: SmartDashboardPlugin;
    onSave: () => void;

    constructor(app: App, plugin: SmartDashboardPlugin, schedule: ScheduleItem | null, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.schedule = schedule;
        this.onSave = onSave;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.createEl('h2', {text: this.schedule ? '编辑日程' : '新建日程'});

        let date = this.schedule ? this.schedule.date : moment().format('YYYY-MM-DD');
        let endDate = this.schedule?.endDate || date;
        let time = this.schedule?.time || '';
        let hasEndTime = !!this.schedule?.endTime;
        let endTime = this.schedule?.endTime || '';
        let title = this.schedule?.title || '';
        let contentStr = this.schedule?.content || '';
        let syncTodo = false;
        let repeat: string = this.schedule?.repeat || 'none';

        // 周期日程（如每年生日）
        new Setting(contentEl).setName('重复').setDesc('周期日程：如「每年」生日、纪念日').addDropdown(dd => {
            dd.addOption('none', '不重复');
            dd.addOption('daily', '每天');
            dd.addOption('weekly', '每周');
            dd.addOption('monthly', '每月');
            dd.addOption('yearly', '每年');
            dd.setValue(repeat);
            dd.onChange(v => repeat = v);
        });

        new Setting(contentEl).setName('开始日期').addText(text => {
            text.inputEl.type = 'date';
            text.setValue(date).onChange(v => {
                date = v;
                if (!endDate || endDate < date) {
                    endDate = v;
                    // If we had a reference to the endDate input, we'd update it here.
                }
            });
        });
        
        new Setting(contentEl).setName('结束日期').addText(text => {
            text.inputEl.type = 'date';
            text.setValue(endDate).onChange(v => endDate = v);
        });

        new Setting(contentEl).setName('开始时间').addText(text => {
            text.inputEl.type = 'time';
            text.setValue(time).onChange(v => time = v);
        });
        
        const hasEndSetting = new Setting(contentEl).setName('有结束时间？');
        const endSetting = new Setting(contentEl).setName('结束时间');
        endSetting.settingEl.style.display = hasEndTime ? 'flex' : 'none';

        hasEndSetting.addToggle(toggle => {
            toggle.setValue(hasEndTime).onChange(v => {
                hasEndTime = v;
                endSetting.settingEl.style.display = v ? 'flex' : 'none';
                if (!v) endTime = '';
            });
        });
        
        endSetting.addText(text => {
            text.inputEl.type = 'time';
            text.setValue(endTime).onChange(v => endTime = v);
        });

        new Setting(contentEl).setName('标题').addText(text => text.setValue(title).onChange(v => title = v));
        new Setting(contentEl).setName('详情').addTextArea(text => text.setValue(contentStr).onChange(v => contentStr = v));

        if (!this.schedule) {
            new Setting(contentEl).setName('同时添加到待办').setDesc('勾选后自动在待办列表中创建').addToggle(toggle => toggle.setValue(syncTodo).onChange(v => syncTodo = v));
        }

        const btns = new Setting(contentEl);
        btns.addButton(btn => btn.setButtonText('保存').setCta().onClick(async () => {
            if (!title) { new Notice('标题不能为空'); return; }
            let view = (this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD)[0]?.view as SmartDashboardView);
            if (!view) return;
            
            let schedules = await view.getSchedules();
            const rep = (['none','daily','weekly','monthly','yearly'].includes(repeat) ? repeat : 'none') as ScheduleItem['repeat'];
            if (this.schedule) {
                const idx = schedules.findIndex(s => s.id === this.schedule!.id);
                if (idx >= 0) schedules[idx] = { ...this.schedule, date, endDate, time, endTime: hasEndTime ? endTime : undefined, title, content: contentStr, repeat: rep };
            } else {
                schedules.push({ id: Date.now().toString(), date, endDate, time, endTime: hasEndTime ? endTime : undefined, title, content: contentStr, repeat: rep });
                
                if (syncTodo) {
                    let todos = await view.getTodos();
                    todos.unshift({ id: Date.now().toString()+'_t', text: title, completed: false, date, time });
                    await view.saveTodos(todos);
                }
            }
            await view.saveSchedules(schedules);
            this.close();
            this.onSave();
        }));

        if (this.schedule) {
            btns.addButton(btn => btn.setButtonText('删除').setWarning().onClick(async () => {
                let view = (this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD)[0]?.view as SmartDashboardView);
                let schedules = await view.getSchedules();
                schedules = schedules.filter(s => s.id !== this.schedule!.id);
                await view.saveSchedules(schedules);
                this.close();
                this.onSave();
            }));
        }
    }
    onClose() { this.contentEl.empty(); }
}

class LogMoodModal extends Modal {
    plugin: SmartDashboardPlugin;
    onSave: () => void;
    date: string;
    
    constructor(app: App, plugin: SmartDashboardPlugin, date: string, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.date = date;
        this.onSave = onSave;
    }

    async onOpen() {
        const {contentEl} = this;
        contentEl.createEl('h2', {text: `打卡状态: ${this.date}`});

        let view = (this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD)[0]?.view as SmartDashboardView);
        let moods = await view.getMoods();
        let existing = moods[this.date];

        let emoji = existing?.emoji || '😀';
        let text = existing?.text || '开心';

        const PRESETS = [
            {
                group: '🌟 常用状态',
                items: [
                    { e: '😀', t: '开心' },
                    { e: '🥲', t: '伤心' },
                    { e: '🤡', t: '小丑' },
                    { e: '🚀', t: '高效' },
                    { e: '😴', t: '摆烂' },
                    { e: '😎', t: '自信' },
                    { e: '😤', t: '抓狂' },
                    { e: '😇', t: '平静' }
                ]
            },
            {
                group: '💻 学习与工作',
                items: [
                    { e: '🤯', t: '烧脑' },
                    { e: '🎯', t: '专注' },
                    { e: '📚', t: '苦读' },
                    { e: '💡', t: '灵感' },
                    { e: '✍️', t: '死磕' },
                    { e: '💼', t: '会议' }
                ]
            },
            {
                group: '🔋 能量与健康',
                items: [
                    { e: '🔋', t: '满电' },
                    { e: '🪫', t: '耗尽' },
                    { e: '🤒', t: '生病' },
                    { e: '💪', t: '鸡血' },
                    { e: '🧘', t: '禅定' }
                ]
            },
            {
                group: '☕ 生活与休闲',
                items: [
                    { e: '☕', t: '摸鱼' },
                    { e: '🎮', t: '游戏' },
                    { e: '🏃', t: '运动' },
                    { e: '🎬', t: '观影' },
                    { e: '🥂', t: '社交' },
                    { e: '🛌', t: '躺平' }
                ]
            }
        ];

        let currentGroup = PRESETS.find(g => g.items.some(x => x.e === emoji)) || PRESETS[0];

        const settingItem = new Setting(contentEl)
            .setName('选择预设状态')
            .setDesc('先选择类别，再选择具体状态');

        let emojiDropdown: any;

        settingItem.addDropdown(drop => {
            PRESETS.forEach(g => drop.addOption(g.group, g.group));
            drop.setValue(currentGroup.group);
            drop.onChange(v => {
                currentGroup = PRESETS.find(g => g.group === v) || PRESETS[0];
                emojiDropdown.selectEl.empty();
                currentGroup.items.forEach(p => emojiDropdown.addOption(p.e, `${p.e} ${p.t}`));
                const first = currentGroup.items[0];
                emoji = first.e;
                text = first.t;
                emojiDropdown.setValue(emoji);
                textInput.setValue(text);
            });
        });

        settingItem.addDropdown(drop => {
            emojiDropdown = drop;
            currentGroup.items.forEach(p => drop.addOption(p.e, `${p.e} ${p.t}`));
            drop.setValue(emoji);
            drop.onChange(v => {
                emoji = v;
                const found = currentGroup.items.find(x => x.e === v);
                if (found) {
                    text = found.t;
                    textInput.setValue(text);
                }
            });
        });

        const textInputWrapper = new Setting(contentEl).setName('自定义文本');
        let textInput: any = null;
        textInputWrapper.addText(t => {
            textInput = t;
            t.setValue(text).onChange(v => text = v);
        });

        new Setting(contentEl).setName('自定义 Emoji (可选)').addText(t => {
            t.setPlaceholder('输入一个Emoji').onChange(v => {
                if (v) emoji = v;
            });
        });

        new Setting(contentEl).addButton(btn => btn.setButtonText('保存打卡').setCta().onClick(async () => {
            moods[this.date] = { emoji, text };
            await view.saveMoods(moods);
            this.close();
            this.onSave();
        }));
    }
    onClose() { this.contentEl.empty(); }
}

class DayDetailModal extends Modal {
    plugin: SmartDashboardPlugin;
    date: string;
    onSave: () => void;

    constructor(app: App, plugin: SmartDashboardPlugin, date: string, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.date = date;
        this.onSave = onSave;
    }

    async onOpen() {
        const {contentEl} = this;
        contentEl.createEl('h2', {text: `${this.date} 详情`});

        let view = (this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD)[0]?.view as SmartDashboardView);
        let schedules = await view.getSchedules();
        let todos = await view.getTodos();
        let moods = await view.getMoods();

        // 主页日记联动：直达/创建当日日记
        const dailySetting = new Setting(contentEl).setName('当日日记').setDesc(view.dailyNotePath(this.date));
        dailySetting.addButton(b => b.setButtonText('📖 打开/创建日记').setCta().onClick(async () => {
            this.close();
            await view.openOrCreateDailyNote(this.date);
        }));

        const daySchedules = schedules.filter(s => view.scheduleOccursOn(s, this.date));
        const dayTodos = todos.filter(t => view.todoOccursOn(t, this.date) && !view.todoEffectiveCompleted(t));

        const files = this.app.vault.getMarkdownFiles();
        let dayNotes = files.filter(f => {
            const cache = this.app.metadataCache.getFileCache(f);
            let created = cache?.frontmatter?.created ? moment(cache.frontmatter.created) : moment(f.stat.ctime);
            return created.format('YYYY-MM-DD') === this.date;
        });

        contentEl.createEl('h3', {text: `当前状态`});
        if (moods[this.date]) {
            contentEl.createEl('div', {text: `${moods[this.date].emoji} ${moods[this.date].text}`, attr: {style: 'margin-bottom: 10px'}});
        } else {
            contentEl.createEl('div', {text: `尚未打卡。`, attr: {style: 'margin-bottom: 10px; color: gray'}});
        }
        new Setting(contentEl).addButton(b => b.setButtonText('设置/修改当日状态').onClick(() => {
            this.close();
            new LogMoodModal(this.app, this.plugin, this.date, () => this.onSave()).open();
        }));

        const header1 = contentEl.createEl('div', {attr: {style: 'display:flex; justify-content:space-between; align-items:center'}});
        header1.createEl('h3', {text: `日程 (${daySchedules.length})`, attr: {style: 'margin:0'}});
        const addSchedBtn = header1.createEl('button', {text: '+', cls: 'sd-btn secondary', attr: {style: 'padding:2px 8px; font-size: 1.2em'}});
        addSchedBtn.onclick = () => {
            this.close();
            new ManageScheduleModal(this.app, this.plugin, { id: '', date: this.date, time: '', title: '', content: '' }, () => {
                new DayDetailModal(this.app, this.plugin, this.date, this.onSave).open();
            }).open();
        };

        if (daySchedules.length) {
            const ul = contentEl.createEl('ul', {attr: {style: 'padding-left: 20px; cursor: pointer;'}});
            daySchedules.forEach(s => {
                const li = ul.createEl('li', {text: `${s.time || '全天'} ${s.title}`});
                li.onclick = () => {
                    this.close();
                    new ManageScheduleModal(this.app, this.plugin, s, () => {
                        new DayDetailModal(this.app, this.plugin, this.date, this.onSave).open();
                    }).open();
                };
            });
        } else { contentEl.createEl('div', {text: '无日程', attr: {style: 'color: gray; margin-bottom: 15px;'}}); }

        const header2 = contentEl.createEl('div', {attr: {style: 'display:flex; justify-content:space-between; align-items:center; margin-top: 10px'}});
        header2.createEl('h3', {text: `待办 (${dayTodos.length})`, attr: {style: 'margin:0'}});
        const addTodoBtn = header2.createEl('button', {text: '+', cls: 'sd-btn secondary', attr: {style: 'padding:2px 8px; font-size: 1.2em'}});
        addTodoBtn.onclick = () => {
            this.close();
            new ManageTodoModal(this.app, this.plugin, { id: '', text: '', completed: false, date: this.date }, () => {
                new DayDetailModal(this.app, this.plugin, this.date, this.onSave).open();
            }).open();
        };

        if (dayTodos.length) {
            const ul = contentEl.createEl('ul', {attr: {style: 'padding-left: 20px; cursor: pointer;'}});
            dayTodos.forEach(s => {
                const li = ul.createEl('li', {text: `[${s.completed ? 'x' : ' '}] ${s.text}`});
                li.onclick = () => {
                    this.close();
                    new ManageTodoModal(this.app, this.plugin, s, () => {
                        new DayDetailModal(this.app, this.plugin, this.date, this.onSave).open();
                    }).open();
                };
            });
        } else { contentEl.createEl('div', {text: '无待办', attr: {style: 'color: gray; margin-bottom: 15px;'}}); }

        let totalWords = 0;
        for (const note of dayNotes) {
            const content = await this.app.vault.read(note);
            totalWords += content.replace(/\s+/g, '').length;
        }

        contentEl.createEl('h3', {text: `新建笔记 (${dayNotes.length}篇, 约 ${totalWords} 字)`, attr: {style: 'margin-top: 15px'}});
        if (dayNotes.length) {
            const ul = contentEl.createEl('ul', {attr: {style: 'padding-left: 20px;'}});
            dayNotes.forEach(s => {
                const li = ul.createEl('li');
                const a = li.createEl('a', {text: s.basename});
                a.onclick = () => { this.close(); this.app.workspace.getLeaf(false).openFile(s); };
            });
        } else { contentEl.createEl('div', {text: '无笔记', attr: {style: 'color: gray'}}); }
    }
    onClose() { this.contentEl.empty(); }
}

class SmartDashboardView extends ItemView {
    plugin: SmartDashboardPlugin;
    lineChart: any = null;
    pieChart: any = null;
    currentMonth: moment.Moment = moment().startOf('month');
    currentMode = '7days';
    currentTab: 'overview' | 'calendar' | 'stats' = 'overview';
    calendarViewMode: 'month' | 'week' = 'month';

    // 磁贴内容等比缩放：设计基准每格 300px，网格 gap 8px
    private static DESIGN_CELL = 300;
    private static GRID_GAP = 8;

    // 卡片 id → 默认格数与坐标（x,y 从 1 开始；w=列数 h=行数）
    private static DEFAULT_LAYOUT: Record<string, {x: number; y: number; w: number; h: number}> = {
        // ===== 6 列 × 4 行填满 + 第 5 行扩展（setupGridSizing 按布局数据自动扩行）=====
        'sd-countdown-section': {x: 1, y: 1, w: 1, h: 1},   // D-Day 倒计时
        'sd-quickjot-section':  {x: 2, y: 1, w: 1, h: 1},   // 极速随笔
        'sd-nav-section':       {x: 3, y: 1, w: 1, h: 1},   // 导航入口
        'sd-create-section':    {x: 4, y: 1, w: 1, h: 1},   // 快捷创建
        'sd-schedule-section':  {x: 5, y: 1, w: 1, h: 1},   // 日程
        'sd-todo-section':      {x: 6, y: 1, w: 1, h: 1},   // 待办
        'sd-calendar-section':  {x: 1, y: 2, w: 2, h: 2},   // 日历 2×2
        'sd-stats-section':     {x: 3, y: 2, w: 2, h: 2},   // 统计 2×2
        'sd-search-section':    {x: 5, y: 2, w: 1, h: 2},   // 全库检索 1×2 纵向（右侧留空）
        'sd-usage-section':     {x: 1, y: 4, w: 2, h: 1},   // Token 用量 2×1
        'sd-trading-section':   {x: 3, y: 4, w: 2, h: 1},   // 交易复盘 2×1
        'sd-subscriptions-section': {x: 5, y: 4, w: 2, h: 1}, // 订阅额度 2×1
        'sd-sports-section':     {x: 1, y: 5, w: 2, h: 1},   // 体育赛事 2×1（第 5 行新行）
    };

    private layoutData: Record<string, {x: number; y: number; w: number; h: number}> = {};
    // 拖拽结束后吞掉紧随的一次 click，避免误触卡片内元素（如日历格）的点击
    private suppressClick = false;
    
    // Trade Filters
    tradeFilter = {
        keyword: '',
        tradeType: 'all',
        startDate: '',
        endDate: ''
    };
    
    constructor(leaf: WorkspaceLeaf, plugin: SmartDashboardPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_SMART_DASHBOARD; }
    getDisplayText() { return `Smart Dashboard ${this.plugin.manifest.version}`; }
    getIcon() { return "layout-dashboard"; }

    async getSchedules(): Promise<ScheduleItem[]> {
        const path = '00_System/schedules.json';
        if (!(await this.app.vault.adapter.exists(path))) return [];
        try { return JSON.parse(await this.app.vault.adapter.read(path)); } catch { return []; }
    }
    async saveSchedules(schedules: ScheduleItem[]) {
        const path = '00_System/schedules.json';
        if (!(await this.app.vault.adapter.exists('00_System'))) await this.app.vault.createFolder('00_System');
        await this.app.vault.adapter.write(path, JSON.stringify(schedules, null, 2));
    }
    async getTodos(): Promise<TodoItem[]> {
        const path = '00_System/todos.json';
        if (!(await this.app.vault.adapter.exists(path))) return [];
        try { return JSON.parse(await this.app.vault.adapter.read(path)); } catch { return []; }
    }
    async saveTodos(todos: TodoItem[]) {
        const path = '00_System/todos.json';
        if (!(await this.app.vault.adapter.exists('00_System'))) await this.app.vault.createFolder('00_System');
        await this.app.vault.adapter.write(path, JSON.stringify(todos, null, 2));
    }
    async getMoods(): Promise<Record<string, MoodItem>> {
        const path = '00_System/moods.json';
        if (!(await this.app.vault.adapter.exists(path))) return {};
        try { return JSON.parse(await this.app.vault.adapter.read(path)); } catch { return {}; }
    }
    async saveMoods(moods: Record<string, MoodItem>) {
        const path = '00_System/moods.json';
        if (!(await this.app.vault.adapter.exists('00_System'))) await this.app.vault.createFolder('00_System');
        await this.app.vault.adapter.write(path, JSON.stringify(moods, null, 2));
    }

    // ===== 连续活跃天数：当天有心情打卡 或 笔记新建/修改，任一即算 =====
    async getStreakDays(): Promise<number> {
        try {
            const moods = await this.getMoods();
            const activeDays = new Set<string>(Object.keys(moods));
            const todayStr = moment().format('YYYY-MM-DD');
            for (const f of this.app.vault.getMarkdownFiles()) {
                activeDays.add(moment(Math.max(f.stat.ctime, f.stat.mtime)).format('YYYY-MM-DD'));
            }
            let streak = 0;
            const cur = moment();
            if (!activeDays.has(todayStr)) cur.subtract(1, 'day'); // 今天尚未活跃则从昨天起算
            while (activeDays.has(cur.format('YYYY-MM-DD')) && streak < 3650) {
                streak++;
                cur.subtract(1, 'day');
            }
            return streak;
        } catch { return 0; }
    }

    // ===== 当日日记路径与联动（05_事件记录/YYYY/MM/YYYY-MM-DD.md）=====
    dailyNotePath(dateStr: string): string {
        const d = moment(dateStr);
        return `${DAILY_DIR}/${d.format('YYYY')}/${d.format('MM')}/${dateStr}.md`;
    }

    private async ensureDailyNoteFile(dateStr: string): Promise<TFile> {
        const path = this.dailyNotePath(dateStr);
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof TFile) return existing;
        const folder = path.substring(0, path.lastIndexOf('/'));
        if (!(await this.app.vault.adapter.exists(folder))) await this.app.vault.createFolder(folder);
        const content = `---\ncreated: ${dateStr}\ntype: 日记\n---\n\n`;
        return await this.app.vault.create(path, content);
    }

    /** 打开当日日记；不存在则按模板创建后打开 */
    async openOrCreateDailyNote(dateStr: string): Promise<void> {
        try {
            const file = await this.ensureDailyNoteFile(dateStr);
            await this.app.workspace.getLeaf(false).openFile(file);
        } catch (e) {
            new Notice('打开日记失败: ' + String(e));
        }
    }

    /** 随笔追加到当日日记文末（无日记则自动按模板创建） */
    async appendToDailyNote(text: string, tag = '随笔'): Promise<void> {
        const dateStr = moment().format('YYYY-MM-DD');
        const file = await this.ensureDailyNoteFile(dateStr);
        const old = await this.app.vault.read(file);
        const stamp = moment().format('HH:mm');
        const next = old.replace(/\s*$/, '') + `\n\n## ${stamp} ${tag}\n${text}\n`;
        await this.app.vault.modify(file, next);
        new Notice(`已写入今日日记：${file.basename}`);
    }

    // ===== D-Day 倒计时数据 =====
    async getCountdowns(): Promise<CountdownItem[]> {
        const path = '00_System/countdowns.json';
        if (!(await this.app.vault.adapter.exists(path))) return [];
        try { return JSON.parse(await this.app.vault.adapter.read(path)); } catch { return []; }
    }
    async saveCountdowns(items: CountdownItem[]) {
        const path = '00_System/countdowns.json';
        if (!(await this.app.vault.adapter.exists('00_System'))) await this.app.vault.createFolder('00_System');
        await this.app.vault.adapter.write(path, JSON.stringify(items, null, 2));
    }

    // ===== 周期日程/待办 =====

    /** 日程是否在 dateStr 发生（周期日程按模式匹配；普通日程按日期区间） */
    scheduleOccursOn(s: ScheduleItem, dateStr: string): boolean {
        if (s.repeat && s.repeat !== 'none') {
            const base = moment(s.date);
            const cur = moment(dateStr);
            switch (s.repeat) {
                case 'daily':   return true;
                case 'weekly':  return cur.isoWeekday() === base.isoWeekday();
                case 'monthly': return cur.date() === base.date();
                case 'yearly':  return cur.month() === base.month() && cur.date() === base.date();
                default: return false;
            }
        }
        const end = s.endDate || s.date;
        return dateStr >= s.date && dateStr <= end;
    }

    /** 日程的下一次发生日期（今天起算，含今天）；非周期返回原 date */
    nextScheduleDate(s: ScheduleItem): string {
        const todayStr = moment().format('YYYY-MM-DD');
        if (!s.repeat || s.repeat === 'none') return s.date;
        const d = moment(todayStr);
        for (let i = 0; i < 400; i++) {
            const key = d.format('YYYY-MM-DD');
            if (this.scheduleOccursOn(s, key)) return key;
            d.add(1, 'day');
        }
        return s.date;
    }

    /** 周期待办是否在 dateStr 出现 */
    todoOccursOn(t: TodoItem, dateStr: string): boolean {
        if (!t.repeat || t.repeat === 'none') return t.date === dateStr;
        const cur = moment(dateStr);
        const base = moment(t.date || moment().format('YYYY-MM-DD'));
        if (cur.isBefore(base, 'day')) return false; // 不早于起始日
        switch (t.repeat) {
            case 'daily':   return true;
            case 'weekly':  return cur.isoWeekday() === base.isoWeekday();
            case 'monthly': return cur.date() === base.date();
            case 'yearly':  return cur.month() === base.month() && cur.date() === base.date();
            default: return false;
        }
    }

    /** 待办在当前周期内是否已完成：普通待办看 completed；周期待办看 lastCompleted 是否落入本周期 */
    todoEffectiveCompleted(t: TodoItem): boolean {
        if (!t.repeat || t.repeat === 'none') return !!t.completed;
        if (!t.lastCompleted) return false;
        const lc = moment(t.lastCompleted);
        const now = moment();
        switch (t.repeat) {
            case 'daily':   return lc.isSame(now, 'day');
            case 'weekly':  return lc.isSame(now, 'isoWeek');
            case 'monthly': return lc.isSame(now, 'month');
            case 'yearly':  return lc.isSame(now, 'year');
            default: return false;
        }
    }

    
    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('smart-dashboard-container');

        const effectiveDark = document.body.classList.contains('theme-dark');
        if (effectiveDark) container.addClass('theme-dark');

        // 应用主题皮肤（香芋紫/暗棕金/金融终端蓝，默认暖橙）
        container.addClass('sd-skin-' + (await this.plugin.getSkin()));

        // 连续活跃天数（心情打卡 或 笔记创建/修改，任一即算）
        const streakDays = await this.getStreakDays();

        const scrollContainer = container.createDiv('sd-tab-content-container');
        const content = scrollContainer.createDiv('sd-tab-content fade-in');
        
        // ===== Hero 欢迎行：问候语 + 实时时钟 + 连续活跃徽章 +（右端）重置布局 / Inbox 徽章 =====
        const heroRow = content.createDiv('sd-hero-row');
        const greetEl = heroRow.createDiv({cls: 'sd-hero-greet'});
        const clockEl = heroRow.createSpan({cls: 'sd-hero-clock'});
        heroRow.createDiv({
            text: `🔥 连续 ${streakDays} 天`,
            cls: 'sd-badge sd-badge-success sd-hero-streak',
            attr: {title: '当天有心情打卡或笔记新建/修改即算活跃'}
        });

        // ↺ 重置布局按钮（原顶部标题栏移入欢迎行，推至行尾）
        const resetLayoutBtn = heroRow.createEl('button', {
            text: '↺ 重置布局',
            cls: 'sd-btn secondary',
            attr: {style: 'padding: 2px 8px; font-size: 0.75em; margin-left: auto; flex-shrink: 0;'}
        });
        resetLayoutBtn.onclick = () => { this.resetLayout(); };

        // 📦 Inbox 徽章
        const inboxFiles = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith('01_Inbox'));
        if (inboxFiles.length > 0) {
            let oldestFile = inboxFiles[0];
            let oldestTime = oldestFile.stat.ctime;
            for (let f of inboxFiles) {
                if (f.stat.ctime < oldestTime) { oldestTime = f.stat.ctime; oldestFile = f; }
            }
            const daysOld = moment().diff(moment(oldestTime), 'days');
            const badgeCls = daysOld >= 7 ? 'sd-badge-danger' : daysOld >= 3 ? 'sd-badge-warning' : 'sd-badge-success';
            heroRow.createDiv({text: `📦 Inbox: ${inboxFiles.length}篇 (最长 ${daysOld} 天)`, cls: `sd-badge ${badgeCls}`, attr: {style: 'flex-shrink: 0;'}});
        }
        const refreshHero = () => {
            const h = moment().hour();
            let g = '夜深了 🌌';
            if (h >= 5 && h < 11) g = '早上好 ☀️';
            else if (h >= 11 && h < 14) g = '中午好 🍱';
            else if (h >= 14 && h < 18) g = '下午好 🍵';
            else if (h >= 18 && h < 23) g = '晚上好 🌙';
            greetEl.setText(g);
            clockEl.setText(moment().format('YYYY-MM-DD HH:mm:ss'));
        };
        refreshHero();
        this.registerInterval(window.setInterval(refreshHero, 1000));

        await this.loadLayout();

        const grid = content.createDiv('sd-grid');

        const cards: HTMLElement[] = [];
        const visibility = await this.plugin.getCardVisibility();

        const allCardIds = Object.keys(SmartDashboardView.DEFAULT_LAYOUT);
        const visibleIds = allCardIds.filter(id => visibility[id] !== false);
        await this.reflowLayoutForVisibleCards(visibleIds);

        if (visibility['sd-calendar-section'] !== false) {
            const calendarCard = grid.createDiv('sd-card');
            calendarCard.id = 'sd-calendar-section';
            this.applyCardSize(calendarCard);
            const calendarBody = this.createCardBody(calendarCard);
            cards.push(calendarCard);
            await this.renderCalendarArea(calendarBody);
        }

        if (visibility['sd-quickjot-section'] !== false) {
            const quickJotCard = grid.createDiv('sd-card');
            quickJotCard.id = 'sd-quickjot-section';
            this.applyCardSize(quickJotCard);
            const quickJotBody = this.createCardBody(quickJotCard);
            cards.push(quickJotCard);
            this.renderQuickJotArea(quickJotBody);
        }

        if (visibility['sd-search-section'] !== false) {
            const searchCard = grid.createDiv('sd-card');
            searchCard.id = 'sd-search-section';
            this.applyCardSize(searchCard);
            const searchBody = this.createCardBody(searchCard);
            cards.push(searchCard);
            this.renderSearchArea(searchBody);
        }

        if (visibility['sd-create-section'] !== false) {
            const createCard = grid.createDiv('sd-card');
            createCard.id = 'sd-create-section';
            this.applyCardSize(createCard);
            const createBody = this.createCardBody(createCard);
            cards.push(createCard);
            this.renderCreateArea(createBody);
        }

        if (visibility['sd-stats-section'] !== false) {
            const statsCard = grid.createDiv('sd-card');
            statsCard.id = 'sd-stats-section';
            this.applyCardSize(statsCard);
            const statsBody = this.createCardBody(statsCard);
            cards.push(statsCard);
            await this.renderStatsArea(statsBody, streakDays);
        }

        if (visibility['sd-usage-section'] !== false) {
            const usageCard = grid.createDiv('sd-card');
            usageCard.id = 'sd-usage-section';
            this.applyCardSize(usageCard);
            const usageBody = this.createCardBody(usageCard);
            cards.push(usageCard);
            await this.renderUsageArea(usageBody);
        }

        if (visibility['sd-subscriptions-section'] !== false) {
            const subscriptionsCard = grid.createDiv('sd-card');
            subscriptionsCard.id = 'sd-subscriptions-section';
            this.applyCardSize(subscriptionsCard);
            const subscriptionsBody = this.createCardBody(subscriptionsCard);
            cards.push(subscriptionsCard);
            await this.renderSubscriptionsArea(subscriptionsBody);
        }

        if (visibility['sd-sports-section'] !== false) {
            const sportsCard = grid.createDiv('sd-card');
            sportsCard.id = 'sd-sports-section';
            this.applyCardSize(sportsCard);
            const sportsBody = this.createCardBody(sportsCard);
            cards.push(sportsCard);
            await this.renderSportsArea(sportsBody);
        }

        if (visibility['sd-schedule-section'] !== false) {
            const scheduleCard = grid.createDiv('sd-card');
            scheduleCard.id = 'sd-schedule-section';
            this.applyCardSize(scheduleCard);
            const scheduleBody = this.createCardBody(scheduleCard);
            cards.push(scheduleCard);
            await this.renderScheduleArea(scheduleBody);
        }

        if (visibility['sd-todo-section'] !== false) {
            const todoCard = grid.createDiv('sd-card');
            todoCard.id = 'sd-todo-section';
            this.applyCardSize(todoCard);
            const todoBody = this.createCardBody(todoCard);
            cards.push(todoCard);
            await this.renderTodoArea(todoBody);
        }

        if (visibility['sd-trading-section'] !== false) {
            const tradingCard = grid.createDiv('sd-card');
            tradingCard.id = 'sd-trading-section';
            this.applyCardSize(tradingCard);
            const tradingBody = this.createCardBody(tradingCard);
            cards.push(tradingCard);
            this.renderTradingArea(tradingBody);
        }

        if (visibility['sd-countdown-section'] !== false) {
            const countdownCard = grid.createDiv('sd-card');
            countdownCard.id = 'sd-countdown-section';
            this.applyCardSize(countdownCard);
            const countdownBody = this.createCardBody(countdownCard);
            cards.push(countdownCard);
            await this.renderCountdownArea(countdownBody);
        }

        if (visibility['sd-nav-section'] !== false) {
            const navCard = grid.createDiv('sd-card');
            navCard.id = 'sd-nav-section';
            this.applyCardSize(navCard);
            const navBody = this.createCardBody(navCard);
            cards.push(navCard);
            await this.renderNavArea(navBody);
        }

        // 先应用布局，再绑定拖拽、启动网格尺寸自适应
        this.applyLayout();
        this.applyScale();
        cards.forEach(c => this.bindCardDrag(c));
        this.setupGridSizing(grid);

        const floatingNav = container.createDiv('sd-floating-nav');
        const createNavBtn = (icon: string, targetId: string, title: string) => {
            const btn = floatingNav.createEl('button', {text: icon, cls: 'sd-floating-nav-btn', attr: {title}});
            btn.onclick = () => {
                const target = grid.querySelector(`#${targetId}`);
                if (target) {
                    target.scrollIntoView({behavior: 'smooth', block: 'start'});
                }
            };
        };

        createNavBtn('🔍', 'sd-search-section', '智能搜索');
        createNavBtn('📈', 'sd-stats-section', '统计分析');
        createNavBtn('📅', 'sd-calendar-section', '日历');
        createNavBtn('✅', 'sd-schedule-section', '日程待办');
        createNavBtn('➕', 'sd-create-section', '快速创建');
        createNavBtn('💹', 'sd-trading-section', '交易复盘');
        createNavBtn('🎯', 'sd-countdown-section', 'D-Day 倒计时');
        createNavBtn('🧭', 'sd-nav-section', '导航入口');

        this.registerInterval(window.setInterval(() => {
            const el = document.getElementById('sd-usage-section');
            if (el) {
                const body = el.querySelector('.sd-usage-body') as HTMLElement | null;
                if (body) { body.empty(); this.renderUsageBody(body); }
            }
            const subEl = document.getElementById('sd-subscriptions-section');
            if (subEl) {
                const subBody = subEl.querySelector('.sd-subscriptions-body') as HTMLElement | null;
                if (subBody) { subBody.empty(); this.renderSubscriptionsBody(subBody); }
            }
        }, 300000));
    }

    async onClose() {
        if (this.lineChart) this.lineChart.destroy();
        if (this.pieChart) this.pieChart.destroy();
    }

    // ===== 磁贴布局：默认布局 / 持久化 / 重置 =====

    private async loadLayout(): Promise<void> {
        let data: any = null;
        try { data = await this.plugin.loadData(); } catch { /* 数据缺失或损坏时退回默认布局 */ }
        this.layoutData = (data && data.cardLayout) ? data.cardLayout : {...SmartDashboardView.DEFAULT_LAYOUT};
    }

    private applyLayout(): void {
        const grid = this.contentEl.querySelector('.sd-grid') as HTMLElement;
        if (!grid) return;
        grid.querySelectorAll<HTMLElement>('.sd-card[id]').forEach(card => {
            const pos = this.layoutData[card.id];
            if (!pos) return;
            card.style.gridColumn = `${pos.x} / span ${pos.w}`;
            card.style.gridRow = `${pos.y} / span ${pos.h}`;
        });
    }

    private async saveLayout(): Promise<void> {
        try {
            const data = (await this.plugin.loadData()) || {};
            data.cardLayout = this.layoutData;
            await this.plugin.saveData(data);
        } catch { /* 持久化失败不阻断拖拽 */ }
    }

    private async resetLayout(): Promise<void> {
        this.layoutData = {...SmartDashboardView.DEFAULT_LAYOUT};
        const grid = this.contentEl.querySelector('.sd-grid') as HTMLElement;
        const cols = parseInt(grid?.style.getPropertyValue('--sd-cols') || '', 10) || 6;
        if (cols < 4) this.applyLayoutCompact(); else this.applyLayout();
        try {
            const data = (await this.plugin.loadData()) || {};
            data.cardLayout = undefined;
            await this.plugin.saveData(data);
        } catch { /* 清空持久化失败时保留内存中的默认布局 */ }
        new Notice('布局已重置为默认');
    }

    private applyCardSize(card: HTMLElement): void {
        const pos = this.layoutData[card.id];
        if (!pos) return;
        card.addClass(`sd-size-${pos.w}x${pos.h}`);
    }

    // 创建等比缩放的内容容器：按设计尺寸（每格 300px + GRID_GAP）设定固定宽高，整体由 --sd-scale 缩放
    private createCardBody(card: HTMLElement): HTMLElement {
        const pos = this.layoutData[card.id];
        const w = pos?.w ?? 1;
        const h = pos?.h ?? 1;
        const body = card.createDiv('sd-card-body');
        body.style.width = `${w * SmartDashboardView.DESIGN_CELL + (w - 1) * SmartDashboardView.GRID_GAP}px`;
        body.style.height = `${h * SmartDashboardView.DESIGN_CELL + (h - 1) * SmartDashboardView.GRID_GAP}px`;
        return body;
    }

    // ===== 网格尺寸自适应（ResizeObserver）=====

    private setupGridSizing(grid: HTMLElement): void {
        const compute = () => {
            // 读取 .sd-grid 真实 padding，精确计算可用内容宽度
            const gcs = getComputedStyle(grid);
            const padL = parseFloat(gcs.paddingLeft) || 0;
            const padR = parseFloat(gcs.paddingRight) || 0;
            const padV = (parseFloat(gcs.paddingTop) || 0) + (parseFloat(gcs.paddingBottom) || 0);
            const availW = grid.clientWidth - padL - padR;
            if (availW <= 0) return;               // 容器未就绪，等待下次回调
            const gap = SmartDashboardView.GRID_GAP;

            if (availW < 700) {
                // 窄屏：2 列流式（格子近似正方形，仅受宽度约束）
                const cell = Math.floor((availW - gap) / 2);
                if (cell < 40) return;
                grid.style.setProperty('--sd-cols', '2');
                grid.style.setProperty('--sd-cell', `${cell}px`);
                this.applyLayoutCompact();
                this.applyScale();
                return;
            }

            // 宽屏：固定 6 列 × 当前布局占用行数，格子恒为正方形（宽高约束取较小值）
            let rows = 4; // 默认布局即 4 行
            for (const p of Object.values(this.layoutData)) {
                if (!p) continue;
                rows = Math.max(rows, p.y + p.h - 1);
            }
            const cellW = (availW - gap * 5) / 6;
            let cell = cellW;
            const scroller = this.containerEl.querySelector('.sd-tab-content-container') as HTMLElement | null;
            if (scroller) {
                const scRect = scroller.getBoundingClientRect();
                const gRect = grid.getBoundingClientRect();
                // 滚动容器底部 padding 必须计入，否则内容溢出会出现滚动条
                const scPadB = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
                // 网格顶部到滚动容器顶部的布局距离（补偿滚动量，结果与当前滚动位置无关）
                const topOffset = Math.max(0, gRect.top - scRect.top + scroller.scrollTop);
                const availH = scroller.clientHeight - topOffset - padV - scPadB - 2;
                if (availH > 120 && rows >= 1) {
                    const cellH = (availH - gap * (rows - 1)) / rows;
                    if (cellH > 60) cell = Math.min(cell, cellH);
                }
            }

            cell = Math.floor(cell);
            if (cell < 40) return;                 // 异常小值保护
            grid.style.setProperty('--sd-cols', '6');
            grid.style.setProperty('--sd-cell', `${cell}px`);
            this.applyLayout();
            this.applyScale();
        };
        compute();                                  // 立即尝试一次（此时可能 width=0，会被 return）
        requestAnimationFrame(() => compute());     // 布局完成后强制重算
        // 观察滚动容器而非网格本身：网格尺寸随缩放变化不再触发回调，避免反馈循环
        const roTarget = (this.containerEl.querySelector('.sd-tab-content-container') as HTMLElement) || grid;
        const ro = new ResizeObserver(compute);
        ro.observe(roTarget);
    }

    // 统一缩放：实际格子尺寸 / 设计基准，写入 --sd-scale 供 .sd-card-body 整体 scale
    private applyScale(): void {
        const grid = this.contentEl.querySelector('.sd-grid') as HTMLElement;
        if (!grid) return;
        const cell = parseFloat(grid.style.getPropertyValue('--sd-cell')) || 300;
        if (cell <= 0) return;
        const scale = cell / SmartDashboardView.DESIGN_CELL;
        grid.style.setProperty('--sd-scale', scale.toFixed(4));
    }

    private applyLayoutCompact(): void {
        const grid = this.contentEl.querySelector('.sd-grid') as HTMLElement;
        if (!grid) return;
        grid.querySelectorAll<HTMLElement>('.sd-card[id]').forEach(card => {
            card.style.gridColumn = '';
            card.style.gridRow = '';
        });
    }

    // ===== 长按拖拽引擎 =====

    private getGrid(): HTMLElement | null {
        return this.contentEl.querySelector('.sd-grid') as HTMLElement | null;
    }

    private getGridMetrics(): { cols: number; cell: number; gap: number; rect: DOMRect; offsetX: number } | null {
        const grid = this.getGrid();
        if (!grid) return null;
        const rect = grid.getBoundingClientRect();
        const cols = parseInt(grid.style.getPropertyValue('--sd-cols'), 10) || 6;
        const cell = parseFloat(grid.style.getPropertyValue('--sd-cell')) || 280;
        // 轨道总宽（不含 padding）；justify-content:center 时计算水平居中偏移
        const trackW = cols * cell + (cols - 1) * SmartDashboardView.GRID_GAP;
        const mgcs = getComputedStyle(grid);
        const mpadL = parseFloat(mgcs.paddingLeft) || 0;
        const mpadR = parseFloat(mgcs.paddingRight) || 0;
        const offsetX = Math.max(0, (rect.width - mpadL - mpadR - trackW) / 2);
        return { cols, cell, gap: SmartDashboardView.GRID_GAP, rect, offsetX };
    }

    private bindCardDrag(card: HTMLElement): void {
        let timer: number | null = null;
        let dragging = false;
        let startX = 0, startY = 0;

        const isInteractive = (t: EventTarget | null): boolean => {
            // textarea/input/select/button/a 及待办条目上不触发卡片拖拽
            if (!(t instanceof HTMLElement)) return true;
            if (t.closest('textarea, input, select, button, a, .sd-todo-item, .sd-todo-drag-handle')) return true;
            return false;
        };

        card.addEventListener('pointerdown', (e) => {
            if (isInteractive(e.target)) return;
            if (e.button !== 0) return;
            startX = e.clientX; startY = e.clientY;
            timer = window.setTimeout(() => {
                timer = null;
                dragging = true;
                card.addClass('sd-dragging');
                try { card.setPointerCapture(e.pointerId); } catch { /* 指针已失效时忽略 */ }
                e.preventDefault();
            }, 500);
        });

        const cancel = () => {
            if (timer) { clearTimeout(timer); timer = null; }
            if (dragging) {
                dragging = false;
                card.removeClass('sd-dragging');
                this.clearDropTarget();
            }
        };

        card.addEventListener('pointermove', (e) => {
            if (!dragging) {
                // 500ms 内移动超阈值 → 取消长按
                if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
                    clearTimeout(timer); timer = null;
                }
                return;
            }
            e.preventDefault();
            this.showDropTarget(card, e.clientX, e.clientY);
        });

        card.addEventListener('pointerup', (e) => {
            if (!dragging) { if (timer) { clearTimeout(timer); timer = null; } return; }
            dragging = false;
            card.removeClass('sd-dragging');
            this.suppressClick = true;
            setTimeout(() => { this.suppressClick = false; }, 0);  // click 未派发时的兜底复位
            void this.commitDrop(card, e.clientX, e.clientY);
            this.clearDropTarget();
        });

        card.addEventListener('pointercancel', cancel);
        card.addEventListener('pointerleave', () => { if (dragging) this.clearDropTarget(); });

        // 拖拽结束后吞掉紧随的一次 click（pointer 手势在 pointerup 后仍会派发 click）
        card.addEventListener('click', (e) => {
            if (this.suppressClick) {
                e.stopPropagation();
                e.preventDefault();
                this.suppressClick = false;
            }
        }, true);
    }

    private showDropTarget(dragged: HTMLElement, clientX: number, clientY: number): void {
        const grid = this.getGrid();
        if (!grid) return;
        const m = this.getGridMetrics();
        if (!m) return;
        const { cols, cell, gap, rect, offsetX } = m;
        const pos = this.layoutData[dragged.id];
        if (!pos) return;
        const w = pos.w, h = pos.h;
        // 坐标换算：content 起点在 padding(12px)+居中偏移 内侧；clamp 列范围使 w×h 不越出网格
        const col = Math.min(Math.max(Math.floor((clientX - rect.left - 12 - offsetX) / (cell + gap)) + 1, 1), cols - w + 1);
        const row = Math.max(Math.floor((clientY - rect.top - 12) / (cell + gap)) + 1, 1);
        this.clearDropTarget();
        const ph = grid.createDiv('sd-drop-target');
        ph.style.width = `${w * cell + (w - 1) * gap}px`;
        ph.style.height = `${h * cell + (h - 1) * gap}px`;
        ph.style.left = `${12 + offsetX + (col - 1) * (cell + gap)}px`;
        ph.style.top = `${12 + (row - 1) * (cell + gap)}px`;
    }

    private clearDropTarget(): void {
        const grid = this.getGrid();
        if (!grid) return;
        grid.querySelectorAll('.sd-drop-target').forEach(el => el.remove());
    }

    private async commitDrop(dragged: HTMLElement, clientX: number, clientY: number): Promise<void> {
        const grid = this.getGrid();
        if (!grid) return;
        const m = this.getGridMetrics();
        if (!m) return;
        const { cols, cell, gap, rect, offsetX } = m;
        if (cols < 4) return;  // 窄模式坐标属于宽模式布局空间，禁止重排
        const dragPos = this.layoutData[dragged.id];
        if (!dragPos) return;
        const w = dragPos.w, h = dragPos.h;
        const col = Math.min(Math.max(Math.floor((clientX - rect.left - 12 - offsetX) / (cell + gap)) + 1, 1), cols - w + 1);
        const row = Math.max(Math.floor((clientY - rect.top - 12) / (cell + gap)) + 1, 1);

        // 向后推挤重排：其余卡片按 (y, x) 排序，从 (1,1) 起逐格扫描第一个不重叠空位
        const others = Object.entries(this.layoutData)
            .filter(([id]) => id !== dragged.id)
            .sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x);

        const placed: {x: number; y: number; w: number; h: number}[] = [{ x: col, y: row, w, h }];
        const overlaps = (p: {x: number; y: number; w: number; h: number}): boolean =>
            placed.some(o => p.x < o.x + o.w && p.x + p.w > o.x && p.y < o.y + o.h && p.y + p.h > o.y);

        const next: Record<string, {x: number; y: number; w: number; h: number}> = {};
        next[dragged.id] = { x: col, y: row, w, h };

        for (const [id, p] of others) {
            let spot: {x: number; y: number; w: number; h: number} | null = null;
            for (let yy = 1; yy <= 500 && !spot; yy++) {
                for (let xx = 1; xx <= cols - p.w + 1; xx++) {
                    const cand = { x: xx, y: yy, w: p.w, h: p.h };
                    if (!overlaps(cand)) { spot = cand; break; }
                }
            }
            if (!spot) spot = { x: 1, y: 501, w: p.w, h: p.h };
            placed.push(spot);
            next[id] = { x: spot.x, y: spot.y, w: p.w, h: p.h };
        }

        this.layoutData = next;
        this.applyLayout();  // CSS transition 平滑过渡
        await this.saveLayout();
    }

    private async reflowLayoutForVisibleCards(visibleIds: string[]): Promise<void> {
        const grid = this.getGrid();
        if (!grid) return;
        const m = this.getGridMetrics();
        if (!m) return;
        const { cols } = m;
        if (cols < 4) return;  // 窄模式不重排

        // 收集可见卡片的当前布局信息（如果存在），否则使用默认尺寸
        const visibleEntries: Array<{id: string; w: number; h: number}> = [];
        for (const id of visibleIds) {
            const existing = this.layoutData[id];
            if (existing) {
                visibleEntries.push({id, w: existing.w, h: existing.h});
            } else {
                // 使用默认尺寸
                const defaultPos = SmartDashboardView.DEFAULT_LAYOUT[id];
                if (defaultPos) {
                    visibleEntries.push({id, w: defaultPos.w, h: defaultPos.h});
                } else {
                    //未知卡片，默认1x1
                    visibleEntries.push({id, w: 1, h: 1});
                }
            }
        }

        // 按 y、x 排序（保持原有顺序，如果没有则按 id 排序）
        // 新增卡无持久化坐标时回退到 DEFAULT_LAYOUT 坐标，避免排到最前挤占首行
        visibleEntries.sort((a, b) => {
            const posA = this.layoutData[a.id] || SmartDashboardView.DEFAULT_LAYOUT[a.id] || {y: 0, x: 0};
            const posB = this.layoutData[b.id] || SmartDashboardView.DEFAULT_LAYOUT[b.id] || {y: 0, x: 0};
            return posA.y - posB.y || posA.x - posB.x;
        });

        // 重新排列
        const placed: Array<{x: number; y: number; w: number; h: number}> = [];
        const overlaps = (p: {x: number; y: number; w: number; h: number}): boolean =>
            placed.some(o => p.x < o.x + o.w && p.x + p.w > o.x && p.y < o.y + o.h && p.y + p.h > o.y);

        const next: Record<string, {x: number; y: number; w: number; h: number}> = {};
        for (const {id, w, h} of visibleEntries) {
            let spot: {x: number; y: number; w: number; h: number} | null = null;
            for (let yy = 1; yy <= 500 && !spot; yy++) {
                for (let xx = 1; xx <= cols - w + 1; xx++) {
                    const cand = {x: xx, y: yy, w, h};
                    if (!overlaps(cand)) {
                        spot = cand;
                        break;
                    }
                }
            }
            if (!spot) spot = {x: 1, y: 501, w, h};
            placed.push(spot);
            next[id] = spot;
        }

        this.layoutData = next;
        this.applyLayout();
        await this.saveLayout();
    }

    getUniqueFrontmatterField(field: string): string[] {
        const set = new Set<string>();
        const files = this.app.vault.getMarkdownFiles();
        files.forEach(f => {
            const cache = this.app.metadataCache.getFileCache(f);
            const val = cache?.frontmatter?.[field];
            if (val) set.add(val);
        });
        return Array.from(set).sort();
    }


    renderSearchArea(container: Element) {
        container.createEl('h3', {text: '🔍 全库智能检索', cls: 'sd-section-title'});
        const searchControls = container.createDiv('sd-search-controls');
        
        const locSelect = searchControls.createEl('select');
        locSelect.createEl('option', {value: 'default', text: '位置: 全局'});
        locSelect.createEl('option', {value: 'notes', text: '位置: 笔记 (03_Archive)'});
        locSelect.createEl('option', {value: 'cards', text: '位置: 卡片 (02_Wiki)'});
        locSelect.createEl('option', {value: 'inbox', text: '位置: 收件箱 (01_Inbox)'});

        const typeSelect = searchControls.createEl('select');
        ['默认', '学科', '读书笔记', '论文', '日记', '随笔', '其他'].forEach(t => {
            typeSelect.createEl('option', {value: t, text: `来源: ${t}`});
        });

        const startDate = searchControls.createEl('input', {type: 'date'});
        startDate.title = '开始日期';
        const endDate = searchControls.createEl('input', {type: 'date'});
        endDate.title = '结束日期';

        const input = searchControls.createEl('input', {type: 'text', placeholder: '搜索标题或正文...'});
        const searchBtn = searchControls.createEl('button', {text: '搜索', cls: 'sd-btn'});
        const resultsArea = container.createDiv('sd-search-results');

        searchBtn.onclick = async () => {
            resultsArea.empty();
            resultsArea.createEl('div', {text: '搜索中...'});
            const loc = locSelect.value;
            const type = typeSelect.value;
            const query = input.value.toLowerCase();
            const sd = startDate.value;
            const ed = endDate.value;
            
            const files = this.app.vault.getMarkdownFiles();
            let matchedFiles = [];

            for (const file of files) {
                if (loc === 'notes' && !file.path.startsWith('03_Archive')) continue;
                if (loc === 'cards' && !file.path.startsWith('02_Wiki')) continue;
                if (loc === 'inbox' && !file.path.startsWith('01_Inbox')) continue;

                const cache = this.app.metadataCache.getFileCache(file);
                if (type !== '默认') {
                    if (cache?.frontmatter?.type !== type) continue;
                }

                if (sd || ed) {
                    let created = cache?.frontmatter?.created ? moment(cache.frontmatter.created).format('YYYY-MM-DD') : moment(file.stat.ctime).format('YYYY-MM-DD');
                    if (sd && created < sd) continue;
                    if (ed && created > ed) continue;
                }

                if (query) {
                    if (file.basename.toLowerCase().includes(query)) matchedFiles.push(file);
                    else {
                        const content = await this.app.vault.cachedRead(file);
                        if (content.toLowerCase().includes(query)) matchedFiles.push(file);
                    }
                } else matchedFiles.push(file);
            }

            resultsArea.empty();
            if (matchedFiles.length === 0) { resultsArea.createEl('div', {text: '未找到匹配笔记。'}); return; }
            matchedFiles.slice(0, 20).forEach(file => {
                const item = resultsArea.createDiv('sd-search-result-item');
                item.createEl('div', {text: file.basename, cls: 'sd-schedule-title'});
                item.createEl('div', {text: file.path, cls: 'sd-schedule-time'});
                item.onclick = () => this.app.workspace.getLeaf(false).openFile(file);
            });
        };
    }

    renderCreateArea(container: Element) {
        container.createEl('h3', {text: '✨ 快捷创建笔记', cls: 'sd-section-title'});
        const createArea = container.createDiv('sd-create-area');

        const types = [
            { id: '智能新建', requiresInput: false },
            { id: '学科', requiresInput: true, field: 'subject' },
            { id: '读书笔记', requiresInput: true, field: 'book' },
            { id: '论文', requiresInput: 'paper', field: 'paper' },
            { id: '日记', requiresInput: false },
            { id: '其他', requiresInput: false }
        ];

        types.forEach(t => {
            const btn = createArea.createEl('button', {text: `+ ${t.id}`, cls: 'sd-btn secondary'});
            btn.onclick = () => {
                if (t.id === '论文') {
                    new CreatePaperModal(this.app, (subject) => this.createNote(t.id, subject)).open();
                } else if (t.id === '其他') {
                    new CreateOtherModal(this.app, this.plugin, () => this.createNote(t.id)).open();
                } else if (t.requiresInput) {
                    const options = this.getUniqueFrontmatterField(t.field!);
                    new CreateNoteModal(this.app, t.id, options, (subject) => this.createNote(t.id, subject)).open();
                } else {
                    this.createNote(t.id);
                }
            };
        });
    }

    renderQuickJotArea(container: Element) {
        container.createEl('h3', {text: '⚡ 极速随笔', cls: 'sd-section-title'});
        const textWrapper = container.createDiv({attr: {style: 'display: flex; flex-direction: column; flex-grow: 1; margin-bottom: 10px;'}});
        const textarea = textWrapper.createEl('textarea', {attr: {style: 'width: 100%; min-height: 100px; padding: 10px; border: 1px solid var(--sd-warm-border); border-radius: 6px; resize: none; font-family: inherit; background: transparent; color: inherit;'}});
        textarea.placeholder = "随时记录灵感闪现...";

        const controls = container.createDiv({attr: {style: 'display: flex; gap: 10px; align-items: center; justify-content: flex-end; margin-top: auto;'}});
        const typeSelect = controls.createEl('select');
        typeSelect.style.padding = '8px 12px';
        typeSelect.style.borderRadius = '6px';
        typeSelect.style.border = '1px solid var(--sd-warm-border)';
        typeSelect.style.background = 'var(--sd-warm-bg)';
        
        ['未定', '随笔', '日记', '其他', '读书笔记', '学科'].forEach(t => typeSelect.createEl('option', {value: t, text: t}));
        
        const saveBtn = controls.createEl('button', {text: '一键落笔', cls: 'sd-btn mod-cta', attr: {style: 'background-color: var(--sd-warm-accent) !important; color: white !important;'}});
        saveBtn.onclick = async () => {
            const val = textarea.value.trim();
            if (!val) { new Notice('随笔内容不能为空！'); return; }
            const type = typeSelect.value;
            const dateStr = moment().format('YYYY-MM-DD');
            const timeStr = moment().format('HHmmss');
            const folderPath = '01_Inbox';
            if (!(await this.app.vault.adapter.exists(folderPath))) await this.app.vault.createFolder(folderPath);

            const filePath = `${folderPath}/${type}-${dateStr}-${timeStr}.md`;
            let content = `---\ncreated: ${dateStr}\ntype: ${type}\n---\n\n${val}\n`;
            const file = await this.app.vault.create(filePath, content);
            new Notice('随笔已保存');
            textarea.value = '';
        };

        // 主页日记联动：追加到当日日记（无日记按模板创建，有则文末 append）
        const dailyBtn = controls.createEl('button', {text: '📝 写入今日日记', cls: 'sd-btn secondary'});
        dailyBtn.onclick = async () => {
            const val = textarea.value.trim();
            if (!val) { new Notice('随笔内容不能为空！'); return; }
            try {
                await this.appendToDailyNote(val, typeSelect.value === '未定' ? '随笔' : typeSelect.value);
                textarea.value = '';
            } catch (e) {
                new Notice('写入日记失败: ' + String(e));
            }
        };
    }

    async createNote(type: string, subject?: string) {
        let actualType = type === '智能新建' ? '未定' : type;
        const dateStr = moment().format('YYYY-MM-DD');
        const timeStr = moment().format('HHmmss');
        let title = `${actualType}-${dateStr}-${timeStr}`;
        if (subject) title = `${subject}-${title}`;

        const folderPath = '01_Inbox';
        if (!(await this.app.vault.adapter.exists(folderPath))) await this.app.vault.createFolder(folderPath);

        const filePath = `${folderPath}/${title}.md`;
        let content = `---\ncreated: ${dateStr}\ntype: ${actualType}\n`;
        if (type === '学科') content += `subject: ${subject}\n---\n\n## 知识点\n\n## 做题技巧\n\n## 注意事项\n`;
        else if (type === '读书笔记') content += `book: ${subject}\nauthor: \n---\n\n## 批注\n`;
        else if (type === '论文') content += `paper: ${subject}\nauthor: \nyear: \njournal: \n---\n\n## 研究背景\n\n## 核心假设\n\n## 数据与模型\n\n## 研究结论\n\n## 我的思考\n`;
        else content += `---\n\n## 正文\n`;

        const file = await this.app.vault.create(filePath, content);
        new Notice(`已创建笔记: ${title}`);
        this.app.workspace.getLeaf(false).openFile(file);
    }

    async renderCalendarArea(container: Element) {
        container.empty();
        const headerContainer = container.createDiv('sd-calendar-header');
        headerContainer.createEl('h3', {text: '📅 我的日历', cls: 'sd-section-title', attr: {style: 'border:none'}});  // margin 交给 CSS（#sd-calendar-section .sd-section-title）压缩
        
        const controls = headerContainer.createDiv('sd-calendar-controls');
        
        const modeToggle = controls.createEl('button', {
            text: this.calendarViewMode === 'month' ? '月视图' : '周视图', 
            cls: 'sd-btn secondary',
            attr: {style: 'margin-right: 10px; font-size: 0.85em; padding: 4px 8px;'}
        });
        modeToggle.onclick = async () => {
            this.calendarViewMode = this.calendarViewMode === 'month' ? 'week' : 'month';
            if (this.calendarViewMode === 'week') {
                this.currentMonth = moment();
            }
            await this.renderCalendarArea(container);
        };
        
        const prevBtn = controls.createEl('button', {text: '←', cls: 'sd-btn secondary'});
        
        const getWeekStart = (m: moment.Moment) => m.clone().subtract(m.isoWeekday() - 1, 'days').startOf('day');
        const getWeekEnd = (m: moment.Moment) => m.clone().add(7 - m.isoWeekday(), 'days').endOf('day');

        const displayLabel = this.calendarViewMode === 'month' 
            ? this.currentMonth.format('YY年MM月') 
            : getWeekStart(this.currentMonth).format('MM.DD') + ' - ' + getWeekEnd(this.currentMonth).format('MM.DD');
            
        const monthLabel = controls.createEl('span', {text: displayLabel, attr: {style: 'font-weight: bold; font-size: 0.9em;'}});
        const nextBtn = controls.createEl('button', {text: '→', cls: 'sd-btn secondary'});
        const todayBtn = controls.createEl('button', {text: '📌 打卡', cls: 'sd-btn', attr: {style: 'padding: 6px 10px; font-size: 0.85em;'}});

        prevBtn.onclick = async () => { 
            this.currentMonth.subtract(1, this.calendarViewMode === 'month' ? 'month' : 'week'); 
            await this.renderCalendarArea(container); 
        };
        nextBtn.onclick = async () => { 
            this.currentMonth.add(1, this.calendarViewMode === 'month' ? 'month' : 'week'); 
            await this.renderCalendarArea(container); 
        };
        todayBtn.onclick = () => { new LogMoodModal(this.app, this.plugin, moment().format('YYYY-MM-DD'), () => this.renderCalendarArea(container)).open(); };

        const gridWrapper = container.createDiv('sd-calendar-grid-wrapper');
        const grid = gridWrapper.createDiv(`sd-calendar-grid ${this.calendarViewMode === 'week' ? 'week-mode' : ''}`);
        
        let numDays = this.calendarViewMode === 'week' ? 35 : 7;
        grid.style.gridTemplateColumns = `repeat(${numDays}, ${this.calendarViewMode === 'week' ? 'minmax(140px, 1fr)' : 'minmax(0, 1fr)'})`;
        
        const headerDays = ['一', '二', '三', '四', '五', '六', '日'];
        for (let i = 0; i < numDays; i++) {
            grid.createDiv({text: headerDays[i % 7], cls: 'sd-calendar-day-name'});
        }

        const moods = await this.getMoods();
        const todos = await this.getTodos();
        const schedules = await this.getSchedules();
        
        const startDate = this.calendarViewMode === 'month' 
            ? getWeekStart(this.currentMonth.clone().startOf('month'))
            : getWeekStart(this.currentMonth.clone().subtract(2, 'weeks'));
            
        const endDate = this.calendarViewMode === 'month'
            ? getWeekEnd(this.currentMonth.clone().endOf('month'))
            : getWeekEnd(this.currentMonth.clone().add(2, 'weeks'));

        const day = startDate.clone();
        let moodCounts: Record<string, number> = {};

        while (day.isSameOrBefore(endDate, 'day')) {
            const dateStr = day.format('YYYY-MM-DD');
            const isToday = day.isSame(moment(), 'day');
            const isOtherMonth = this.calendarViewMode === 'month' && !day.isSame(this.currentMonth, 'month');
            const dayCell = grid.createDiv(`sd-calendar-day ${isToday ? 'today' : ''} ${isOtherMonth ? 'other-month' : ''}`);
            dayCell.setAttribute('data-date', dateStr);
            
            dayCell.createDiv({text: day.format('D')});
            
            const indicators = dayCell.createDiv('sd-calendar-indicators');

            // ③ 节日 / 节气角标（每年自动生成）
            const hol = getHolidayName(dateStr);
            if (hol && !isOtherMonth) {
                const holEl = dayCell.createDiv({
                    text: `${hol.kind === 'term' ? '☀' : '🏮'}${hol.name}`,
                    cls: hol.kind === 'term' ? 'sd-calendar-term' : 'sd-calendar-festival'
                });
                holEl.setAttribute('title', `${hol.name}${hol.kind === 'term' ? '（节气）' : '（节日）'}`);
            }

            const dayTodos = todos.filter(t => this.todoOccursOn(t, dateStr) && !this.todoEffectiveCompleted(t));
            const daySchedules = schedules.filter(s => this.scheduleOccursOn(s, dateStr));
            const dayNotes = this.app.vault.getMarkdownFiles().filter(f => moment(f.stat.ctime).format('YYYY-MM-DD') === dateStr);
            
            if (daySchedules.length > 0) {
                const barsContainer = dayCell.createDiv('sd-schedule-bar-container');
                daySchedules.forEach((s, idx) => {
                    const bar = barsContainer.createDiv('sd-schedule-bar');
                    // 周期日程的每次发生都视为独立单日事件
                    const isRecurring = !!(s.repeat && s.repeat !== 'none');
                    const isStartDay = isRecurring || dateStr === s.date;
                    const isEndDay = isRecurring || dateStr === (s.endDate || s.date);
                    
                    // Display title only on the first day if it spans, or always if it doesn't span
                    bar.innerText = isStartDay ? s.title : ' ';
                    
                    if (!isStartDay) bar.addClass('continue-left');
                    if (!isEndDay) bar.addClass('continue-right');

                    const colors = ['#2A9D8F', '#F4A261', '#E76F51', '#457B9D', '#E9C46A'];
                    bar.style.backgroundColor = colors[idx % colors.length];
                    
                    let widthStr = '';
                    let marginStr = '';
                    
                    if (this.calendarViewMode === 'week' && (s.time || s.endTime)) {
                        const parseTime = (t: string) => {
                            if (!t) return null;
                            const [h, m] = t.split(':').map(Number);
                            return ((h || 0) + (m || 0) / 60) / 24 * 100;
                        };
                        let startPct = 0;
                        let endPct = 100;

                        if (isStartDay && s.time) {
                            startPct = parseTime(s.time) || 0;
                        }
                        if (isEndDay && s.endTime) {
                            endPct = parseTime(s.endTime) || 100;
                        }

                        marginStr = !isStartDay ? `calc(${startPct}% - 5px)` : `${startPct}%`;
                        let ext = 0;
                        if (!isStartDay) ext += 5;
                        if (!isEndDay) ext += 5;
                        widthStr = `calc(${Math.max(endPct - startPct, 5)}% + ${ext}px)`;
                    } else {
                        marginStr = !isStartDay ? '-5px' : '0';
                        let ext = 0;
                        if (!isStartDay) ext += 5;
                        if (!isEndDay) ext += 5;
                        widthStr = `calc(100% + ${ext}px)`;
                    }
                    
                    bar.style.marginLeft = marginStr;
                    bar.style.width = widthStr;
                    bar.onclick = (e) => {
                        e.stopPropagation();
                        new ManageScheduleModal(this.app, this.plugin, s, () => this.renderCalendarArea(container)).open();
                    };
                });
            }

            if (dayTodos.length > 0) indicators.createSpan({cls: 'sd-dot todo-dot', title: `${dayTodos.length} 个待办`});
            if (dayNotes.length > 0) indicators.createSpan({cls: 'sd-dot note-dot', title: `${dayNotes.length} 篇笔记`});
            
            if (moods[dateStr]) {
                const e = moods[dateStr].emoji;
                dayCell.createDiv({text: e, cls: 'sd-calendar-emoji'});
                dayCell.title = `状态: ${e} ${moods[dateStr].text}\n点击查看详情`; 
                if (!isOtherMonth) {
                    moodCounts[e] = (moodCounts[e] || 0) + 1;
                }
            } else {
                dayCell.title = `点击查看或打卡: ${dateStr}`;
            }

            dayCell.onclick = () => {
                new DayDetailModal(this.app, this.plugin, dateStr, () => this.renderCalendarArea(container)).open();
            };

            day.add(1, 'day');
        }

        if (this.calendarViewMode === 'week') {
            setTimeout(() => {
                const todayStr = moment().format('YYYY-MM-DD');
                const todayEl = gridWrapper.querySelector(`[data-date="${todayStr}"]`);
                if (todayEl) {
                    todayEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                } else {
                    gridWrapper.scrollLeft = 14 * 140;
                }
            }, 50);
        }

        const statsArea = container.createDiv('sd-mood-stats');
        Object.entries(moodCounts).forEach(([emoji, count]) => {
            statsArea.createDiv({text: `${emoji} x ${count}`, cls: 'sd-mood-stat-item'});
        });
    }

    async renderTodoArea(container: Element) {
        const header = container.createDiv({attr: {style: 'display:flex; justify-content:space-between; align-items:center'}});
        header.createEl('h3', {text: '✅ 待办事项', cls: 'sd-section-title', attr: {style: 'margin:0; border:none'}});
        const addBtn = header.createEl('button', {text: '+ 添加待办', cls: 'sd-btn'});
        container.createEl('hr', {attr: {style: 'border:none; border-top:1px dashed var(--sd-warm-border); margin-top:5px'}});

        const tabs = container.createDiv('sd-schedule-tabs');
        const listArea = container.createDiv('sd-todo-list');
        let currentTab = 'uncompleted'; 

        const renderList = async () => {
            listArea.empty();
            let todos = await this.getTodos();

            let displayTodos = todos.filter(t => currentTab === 'completed' ? this.todoEffectiveCompleted(t) : !this.todoEffectiveCompleted(t));
            // 排序：逾期置顶 → 优先级 高/中/低 → 同级保持原有（拖拽）顺序
            const priRank: Record<string, number> = { high: 0, mid: 1, low: 2 };
            const todayStr = moment().format('YYYY-MM-DD');
            displayTodos.sort((a, b) => {
                const aOver = (!a.completed && !!a.deadline && a.deadline < todayStr) ? 0 : 1;
                const bOver = (!b.completed && !!b.deadline && b.deadline < todayStr) ? 0 : 1;
                if (aOver !== bOver) return aOver - bOver;
                const pa = priRank[a.priority || 'low'] ?? 2;
                const pb = priRank[b.priority || 'low'] ?? 2;
                if (pa !== pb) return pa - pb;
                return 0; // 稳定排序，保持拖拽顺序
            });

            if (displayTodos.length === 0) {
                listArea.createEl('div', {text: '无事项。', attr: {style: 'padding: 10px; color: var(--sd-text-light)'}});
                return;
            }

            displayTodos.forEach(t => {
                const item = listArea.createDiv(`sd-todo-item ${t.completed ? 'completed' : ''}`);
                item.draggable = true;
                item.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/plain', t.id); item.addClass('dragging'); });
                item.addEventListener('dragend', () => item.removeClass('dragging'));
                item.addEventListener('dragover', (e) => e.preventDefault());
                item.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    const draggedId = e.dataTransfer?.getData('text/plain');
                    if (draggedId && draggedId !== t.id) {
                        let currentTodos = await this.getTodos();
                        const draggedIdx = currentTodos.findIndex(x => x.id === draggedId);
                        const dropIdx = currentTodos.findIndex(x => x.id === t.id);
                        if(draggedIdx > -1 && dropIdx > -1) {
                            const [draggedItem] = currentTodos.splice(draggedIdx, 1);
                            currentTodos.splice(dropIdx, 0, draggedItem);
                            await this.saveTodos(currentTodos);
                            renderList();
                        }
                    }
                });

                item.createSpan({text: '≡', cls: 'sd-todo-drag-handle'});
                const cb = item.createEl('input', {type: 'checkbox', cls: 'sd-todo-checkbox'});
                cb.checked = this.todoEffectiveCompleted(t);
                cb.onclick = async (e) => {
                    e.stopPropagation();
                    let currentTodos = await this.getTodos();
                    const target = currentTodos.find(x => x.id === t.id);
                    if (target) {
                        // 周期待办：完成写 lastCompleted（进入下一周期自动重置）；普通待办直接置 completed
                        if (target.repeat && target.repeat !== 'none') {
                            if (cb.checked) target.lastCompleted = moment().format('YYYY-MM-DD');
                            else target.lastCompleted = undefined;
                        } else {
                            target.completed = cb.checked;
                        }
                        await this.saveTodos(currentTodos);
                        
                        if (target.completed) {
                            item.addClass('fade-out-complete');
                            setTimeout(() => renderList(), 400); 
                        } else {
                            renderList();
                        }
                    }
                };

                const contentDiv = item.createDiv({cls: 'sd-todo-content'});
                // 优先级语义色胶囊（灵感：红=紧急 橙=重要 蓝=常规）
                const priCls = t.priority === 'high' ? 'high' : (t.priority === 'mid' ? 'mid' : 'low');
                const priLabel = t.priority === 'high' ? '紧急' : (t.priority === 'mid' ? '重要' : '常规');
                const textRow = contentDiv.createDiv({cls: 'sd-todo-textrow'});
                textRow.createSpan({text: priLabel, cls: `sd-todo-priority sd-todo-priority-${priCls}`});
                const textDiv = textRow.createDiv({text: t.text, cls: 'sd-todo-text'});
                
                const metaDiv = contentDiv.createDiv({cls: 'sd-todo-meta'});
                if (t.repeat && t.repeat !== 'none') {
                    const repLabel = ({daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年'} as Record<string, string>)[t.repeat] || '';
                    metaDiv.createSpan({text: `🔁 ${repLabel}`, cls: 'sd-todo-repeat'});
                }
                if (t.date || t.time) {
                    metaDiv.createSpan({text: `🕒 ${t.date||''} ${t.time||''}`.trim(), cls: 'sd-todo-time'});
                }
                
                if (t.deadline) {
                    const daysLeft = moment(t.deadline).diff(moment().startOf('day'), 'days');
                    const warningCls = daysLeft < 0 ? 'deadline-overdue' : (daysLeft <= 2 ? 'deadline-warning' : '');
                    let deadlineText = `⏳ 截止: ${t.deadline}`;
                    if (daysLeft < 0) deadlineText += ` (已逾期)`;
                    else if (daysLeft === 0) deadlineText += ` (今天)`;
                    else deadlineText += ` (剩 ${daysLeft} 天)`;
                    
                    metaDiv.createSpan({text: deadlineText, cls: `sd-todo-deadline ${warningCls}`});
                }
                
                if (t.subtasks && t.subtasks.length > 0) {
                    const completedCount = t.subtasks.filter(st => st.completed).length;
                    const subtaskToggle = metaDiv.createSpan({text: `📋 子任务 (${completedCount}/${t.subtasks.length})`, cls: 'sd-todo-subtask-toggle'});
                    
                    const subtaskList = contentDiv.createDiv('sd-todo-subtasks');
                    subtaskList.style.display = 'none';
                    
                    t.subtasks.forEach(st => {
                        const stItem = subtaskList.createDiv('sd-todo-subtask-item');
                        const stCb = stItem.createEl('input', {type: 'checkbox'});
                        stCb.checked = st.completed;
                        stCb.onclick = async (e) => {
                            e.stopPropagation();
                            st.completed = stCb.checked;
                            let currentTodos = await this.getTodos();
                            const targetTodo = currentTodos.find(x => x.id === t.id);
                            if (targetTodo) {
                                targetTodo.subtasks = t.subtasks;
                                await this.saveTodos(currentTodos);
                                renderList();
                            }
                        };
                        stItem.createSpan({text: st.text, cls: st.completed ? 'completed' : ''});
                        stItem.onclick = (e) => e.stopPropagation();
                    });
                    
                    subtaskToggle.onclick = (e) => {
                        e.stopPropagation();
                        subtaskList.style.display = subtaskList.style.display === 'none' ? 'block' : 'none';
                    };
                }

                item.onclick = (e) => {
                    if (e.target !== cb) new ManageTodoModal(this.app, this.plugin, t, renderList).open();
                };
            });
        };

        const setupTabs = () => {
            tabs.empty();
            const uncomBtn = tabs.createEl('button', {text: '未完成', cls: `sd-btn secondary ${currentTab === 'uncompleted' ? 'active' : ''}`});
            const comBtn = tabs.createEl('button', {text: '已完成', cls: `sd-btn secondary ${currentTab === 'completed' ? 'active' : ''}`});
            uncomBtn.onclick = () => { currentTab = 'uncompleted'; setupTabs(); renderList(); };
            comBtn.onclick = () => { currentTab = 'completed'; setupTabs(); renderList(); };
        };

        addBtn.onclick = () => new ManageTodoModal(this.app, this.plugin, null, renderList).open();
        setupTabs();
        await renderList();
    }

    async renderScheduleArea(container: Element) {
        const header = container.createDiv({attr: {style: 'display:flex; justify-content:space-between; align-items:center'}});
        header.createEl('h3', {text: '📅 日程管理', cls: 'sd-section-title', attr: {style: 'margin:0; border:none'}});
        const addBtn = header.createEl('button', {text: '+ 新建日程', cls: 'sd-btn'});
        container.createEl('hr', {attr: {style: 'border:none; border-top:1px dashed var(--sd-warm-border); margin-top:5px'}});

        const tabs = container.createDiv('sd-schedule-tabs');
        const listArea = container.createDiv('sd-schedule-list');
        let currentTab = 'present'; 

        const renderList = async () => {
            listArea.empty();
            let schedules = await this.getSchedules();
            const today = moment().format('YYYY-MM-DD');
            const future3 = moment().add(3, 'days').format('YYYY-MM-DD');

            // 周期日程按「下一次发生日期」参与筛选与排序
            schedules.forEach(s => { (s as any)._eff = this.nextScheduleDate(s); });
            schedules = schedules.filter(s => {
                const eff = (s as any)._eff as string;
                if (currentTab === 'past') return eff < today;
                if (currentTab === 'present') return eff >= today && eff <= future3;
                return eff > future3;
            });
            schedules.sort((a, b) =>
                (((a as any)._eff || a.date).localeCompare((b as any)._eff || b.date)) ||
                (a.time || '').localeCompare(b.time || ''));

            if (schedules.length === 0) {
                listArea.createEl('div', {text: '无日程。', attr: {style: 'padding: 10px; color: var(--sd-text-light)'}});
                return;
            }

            schedules.forEach(s => {
                const eff = (s as any)._eff as string;
                const isRecurring = !!(s.repeat && s.repeat !== 'none');
                const item = listArea.createDiv('sd-timeline-item');
                const dot = item.createDiv('sd-timeline-dot');

                const isConflict = s.time && schedules.some(other =>
                    other.id !== s.id && other.date === s.date &&
                    ((other.time === s.time) || (other.time && s.time && other.endTime && s.time < other.endTime && s.time > other.time))
                );

                if (isConflict) {
                    dot.addClass('sd-timeline-conflict');
                    dot.title = '冲突提示：该时段存在重叠日程';
                }

                const content = item.createDiv('sd-timeline-content');

                const timeDisplay = s.time ? (s.endTime ? `${s.time} - ${s.endTime}` : s.time) : '全天';

                // ① 每条日程的天数倒计时
                const daysLeft = moment(eff).diff(moment().startOf('day'), 'days');
                let daysLabel = '';
                let daysCls = '';
                if (daysLeft < 0) { daysLabel = `已过 ${-daysLeft} 天`; daysCls = 'sd-cd-overdue'; }
                else if (daysLeft === 0) { daysLabel = '就在今天'; daysCls = 'sd-cd-today'; }
                else { daysLabel = `还剩 ${daysLeft} 天`; }

                // 当天日程保留分钟级倒计时
                let countdownStr = '';
                if (currentTab === 'present') {
                    const eventMoment = moment(`${eff} ${s.time || '00:00'}`, 'YYYY-MM-DD HH:mm');
                    const diffMins = eventMoment.diff(moment(), 'minutes');
                    if (diffMins > 0 && diffMins < 24 * 60) {
                        const h = Math.floor(diffMins / 60);
                        const m = diffMins % 60;
                        countdownStr = ` (距离开始: ${h>0?h+'小时':''}${m}分钟)`;
                    } else if (diffMins <= 0 && eventMoment.isSame(moment(), 'day')) {
                         countdownStr = ` (进行中/已开始)`;
                    }
                }

                const timeHeader = content.createDiv({cls: 'sd-timeline-time'});
                timeHeader.createSpan({text: `${eff} ${timeDisplay}`});
                if (isRecurring) {
                    const repLabel = ({daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年'} as Record<string, string>)[s.repeat!] || '';
                    timeHeader.createSpan({text: ` 🔁${repLabel}`, cls: 'sd-timeline-repeat', attr: {title: `原始日期 ${s.date}，每${repLabel}重复`}});
                }
                timeHeader.createSpan({text: ` ⏱ ${daysLabel}`, cls: `sd-timeline-countdown sd-schedule-days ${daysCls}`});
                if (countdownStr) timeHeader.createSpan({text: countdownStr, cls: 'sd-timeline-countdown'});
                if (isConflict) timeHeader.createSpan({text: ' ⚠️ 冲突', cls: 'sd-timeline-conflict-text'});

                content.createDiv({text: s.title, cls: 'sd-timeline-title'});

                content.onclick = () => new ManageScheduleModal(this.app, this.plugin, s, renderList).open();
            });
        };

        const setupTabs = () => {
            tabs.empty();
            const pastBtn = tabs.createEl('button', {text: '过去', cls: `sd-btn secondary ${currentTab === 'past' ? 'active' : ''}`});
            const presBtn = tabs.createEl('button', {text: '现在及近3天', cls: `sd-btn secondary ${currentTab === 'present' ? 'active' : ''}`});
            const futBtn = tabs.createEl('button', {text: '更远的未来', cls: `sd-btn secondary ${currentTab === 'future' ? 'active' : ''}`});
            pastBtn.onclick = () => { currentTab = 'past'; setupTabs(); renderList(); };
            presBtn.onclick = () => { currentTab = 'present'; setupTabs(); renderList(); };
            futBtn.onclick = () => { currentTab = 'future'; setupTabs(); renderList(); };
        };

        addBtn.onclick = () => new ManageScheduleModal(this.app, this.plugin, null, renderList).open();
        setupTabs();
        await renderList();
    }

    updateCharts(forceRedraw = false) {
        if (forceRedraw) {
            if (this.lineChart) { this.lineChart.destroy(); this.lineChart = null; }
            if (this.pieChart) { this.pieChart.destroy(); this.pieChart = null; }
        } else if (this.lineChart) {
            return; // If already drawn, we don't necessarily need to redraw unless it's a theme or mode switch.
            // But since mode changes call this function, we do want to redraw.
        }

        // 方案A（2026-08-19）：图表颜色跟随全局主题（body.theme-dark）+ 容器手动深色覆盖，双源兜底
        const isDark = document.body.classList.contains('theme-dark')
            || document.querySelector('.smart-dashboard-container')?.classList.contains('theme-dark');
        const gridColor = isDark ? '#444444' : '#E6C280';
        const textColor = isDark ? '#E0E0E0' : '#5D4037';

        Chart.defaults.color = textColor;
        Chart.defaults.borderColor = gridColor;

        const container = document.querySelector('.sd-charts-wrapper');
        if (!container) return;
        
        let lineCanvas = container.querySelector('.sd-chart-box:nth-child(1) canvas') as HTMLCanvasElement;
        let pieCanvas = container.querySelector('.sd-chart-box:nth-child(2) canvas') as HTMLCanvasElement;

        const files = this.app.vault.getMarkdownFiles();
        let labels: string[] = [];
        let formatFn: (d: moment.Moment) => string;
        
        if (this.currentMode === '7days') {
            labels = Array.from({length: 7}, (_, i) => moment().subtract(6 - i, 'days').format('MM-DD'));
            formatFn = d => d.format('MM-DD');
        } else if (this.currentMode === 'month') {
            const daysInMonth = moment().daysInMonth();
            labels = Array.from({length: daysInMonth}, (_, i) => moment().startOf('month').add(i, 'days').format('MM-DD'));
            formatFn = d => d.format('MM-DD');
        } else {
            labels = Array.from({length: 12}, (_, i) => moment().startOf('year').add(i, 'months').format('YYYY-MM'));
            formatFn = d => d.format('YYYY-MM');
        }

        const dataMap: Record<string, any> = {};
        labels.forEach(l => dataMap[l] = {Total: 0, 学科: 0, 读书笔记: 0, 论文: 0, 日记: 0, 随笔: 0, 其他: 0});
        let pieTotals: any = {学科: 0, 读书笔记: 0, 论文: 0, 日记: 0, 随笔: 0, 其他: 0};

        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            let created = cache?.frontmatter?.created ? moment(cache.frontmatter.created) : moment(file.stat.ctime);
            const key = formatFn(created);
            if (dataMap[key]) {
                dataMap[key].Total++;
                const type = (cache?.frontmatter?.type) || '其他';
                if (dataMap[key][type] !== undefined) {
                    dataMap[key][type]++;
                    pieTotals[type]++;
                } else {
                    dataMap[key]['其他']++;
                    pieTotals['其他']++;
                }
            }
        });

        if (lineCanvas) {
            this.lineChart = new Chart(lineCanvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: '合计新建笔记', data: labels.map(l => dataMap[l].Total), borderColor: '#E76F51', backgroundColor: 'rgba(231,111,81,0.2)', fill: true, tension: 0.4 }
                    ]
                },
                options: { 
                    responsive: true, maintainAspectRatio: false, devicePixelRatio: 2,
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                afterBody: (context: any) => {
                                    const label = context[0].label;
                                    const d = dataMap[label];
                                    let str = [];
                                    if(d['学科']) str.push(`学科: ${d['学科']}`);
                                    if(d['读书笔记']) str.push(`读书: ${d['读书笔记']}`);
                                    if(d['论文']) str.push(`论文: ${d['论文']}`);
                                    if(d['日记']) str.push(`日记: ${d['日记']}`);
                                    if(d['随笔']) str.push(`随笔: ${d['随笔']}`);
                                    if(d['其他']) str.push(`其他: ${d['其他']}`);
                                    return str.length ? '\n' + str.join(' | ') : '';
                                }
                            }
                        }
                    }
                }
            });
        }

        if (pieCanvas) {
            this.pieChart = new Chart(pieCanvas, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(pieTotals).filter(k => pieTotals[k] > 0),
                    datasets: [{
                        data: Object.values(pieTotals).filter(v => (v as number) > 0),
                        backgroundColor: ['#F4A261', '#2A9D8F', '#457B9D', '#E76F51', '#E9C46A', '#8D6E63']
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, devicePixelRatio: 2,
                    // 改动2：空心半径收窄（饼本体更大）+ 图例/标签字号 9px、padding 减半
                    cutout: '32%',
                    plugins: {
                        legend: {
                            labels: {
                                font: { size: 10 },
                                padding: 6
                            }
                        }
                    }
                }
            });
        }
    }

    async renderTradingArea(container: Element) {
        const jsonPath = '04_个人空间/交易复盘/trades.json';
        let records: any[] = [];
        if (await this.app.vault.adapter.exists(jsonPath)) {
            const content = await this.app.vault.adapter.read(jsonPath);
            try {
                records = JSON.parse(content);
            } catch (e) {
                console.error('Failed to parse trades.json', e);
            }
        }
        
        records.sort((a, b) => moment(b.timestamp).valueOf() - moment(a.timestamp).valueOf());
        
        const uniqueTickers = Array.from(new Set(records.map(r => r.ticker).filter(t => t)));

        const headerContainer = container.createDiv({attr: {style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;'}});
        headerContainer.createEl('h3', {text: '💹 高阶交易复盘系统', cls: 'sd-section-title', attr: {style: 'margin:0'}});
        const quickAddBtn = headerContainer.createEl('button', {text: '+ 快捷录入', cls: 'sd-btn mod-cta'});
        quickAddBtn.onclick = () => {
            new CreateTradeModal(this.app, this.plugin, uniqueTickers, async (tradeDate, ticker, action, price, volume) => {
                const timeStr = moment().format('HHmmss');
                const folderPath = '04_个人空间/交易复盘';
                if (!(await this.app.vault.adapter.exists(folderPath))) await this.app.vault.createFolder(folderPath);
                
                let trades = [];
                if (await this.app.vault.adapter.exists(jsonPath)) {
                    const content = await this.app.vault.adapter.read(jsonPath);
                    try {
                        trades = JSON.parse(content);
                    } catch (e) {
                        console.error('Failed to parse trades.json', e);
                    }
                }
                
                trades.push({
                    id: `trade-${tradeDate}-${timeStr}`,
                    date: tradeDate,
                    timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
                    ticker,
                    action,
                    price: parseFloat(price.toString()),
                    volume: parseFloat(volume.toString()),
                    strategy: '',
                    pnl: 0,
                    discipline_score: 5,
                    bad_habits: [],
                    ai_review: ''
                });
                
                await this.app.vault.adapter.write(jsonPath, JSON.stringify(trades, null, 2));
                new Notice('交易已记录至 trades.json');
                
                // Refresh the view
                container.empty();
                this.renderTradingArea(container);
            }).open();
        };

        if (records.length === 0) {
            container.createDiv({text: '暂无交易记录。', cls: 'sd-empty-state'});
            return;
        }

        let totalTrades = 0;
        let winTrades = 0;
        let lossTrades = 0;
        let totalWinAmount = 0;
        let totalLossAmount = 0;
        let totalPnL = 0;

        const badHabitsMap = new Map<string, {count: number, loss: number}>();

        records.forEach(r => {
            let pnl = parseFloat(r.pnl);
            if (!isNaN(pnl)) {
                totalTrades++;
                totalPnL += pnl;
                if (pnl > 0) { winTrades++; totalWinAmount += pnl; }
                else if (pnl < 0) { lossTrades++; totalLossAmount += pnl; }
            } else {
                pnl = 0;
            }

            if (r.bad_habits && Array.isArray(r.bad_habits)) {
                r.bad_habits.forEach((bh: string) => {
                    if (!bh) return;
                    const cleanBh = bh.replace('#', '');
                    if (!badHabitsMap.has(cleanBh)) badHabitsMap.set(cleanBh, {count: 0, loss: 0});
                    const entry = badHabitsMap.get(cleanBh)!;
                    entry.count += 1;
                    entry.loss += pnl;
                });
            }
        });


        const winRate = totalTrades > 0 ? (winTrades / totalTrades * 100).toFixed(1) : "0.0";
        const avgWin = winTrades > 0 ? (totalWinAmount / winTrades) : 0;
        const avgLoss = lossTrades > 0 ? (Math.abs(totalLossAmount) / lossTrades) : 0;
        const pnlRatio = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : (avgWin > 0 ? "MAX" : "0.00");

        const redColor = "#e53935";
        const greenColor = "#43a047";
        const pnlColor = totalPnL >= 0 ? redColor : greenColor;
        const pnlSign = totalPnL > 0 ? "+" : "";

        const statsGrid = container.createDiv('sd-trading-stats-grid');
        
        const createStat = (label: string, value: string, color?: string, extra?: HTMLElement) => {
            const box = statsGrid.createDiv('sd-trading-stat-box');
            box.createDiv({text: label, cls: 'label'});
            const valEl = box.createDiv({text: value, cls: 'value'});
            if (color) valEl.style.color = color;
            if (extra) box.appendChild(extra);
        };

        createStat('总交易笔数', `${totalTrades}`);
        createStat('累计总盈亏', `${pnlSign}${totalPnL.toFixed(2)}`, pnlColor);
        
        const winBarContainer = document.createElement('div');
        winBarContainer.className = 'sd-trading-winbar-container';
        const winBar = winBarContainer.createDiv('sd-trading-winbar-fill');
        winBar.style.width = `${winRate}%`;
        createStat('整体胜率', `${winRate}%`, undefined, winBarContainer);
        
        createStat('平均盈亏比', `${pnlRatio}`);

        const tablesWrapper = container.createDiv('sd-trading-tables-wrapper');

        const habitsCol = tablesWrapper.createDiv('sd-trading-col');
        habitsCol.createEl('h4', {text: '⚠️ 亏损归因 (坏习惯)'});
        const habitsScrollContainer = habitsCol.createDiv('sd-table-scroll-container');
        const habitsTable = habitsScrollContainer.createEl('table', {cls: 'sd-trading-table'});
        const hThead = habitsTable.createEl('thead').createEl('tr');
        ['坏习惯', '触发次数', '总盈亏', '平均单笔'].forEach(h => hThead.createEl('th', {text: h}));
        const hTbody = habitsTable.createEl('tbody');
        
        Array.from(badHabitsMap.entries())
            .sort((a, b) => a[1].loss - b[1].loss)
            .forEach(([bh, data]) => {
                const tr = hTbody.createEl('tr');
                tr.createEl('td', {text: bh});
                tr.createEl('td', {text: `${data.count}`});
                const lossTd = tr.createEl('td', {text: `${data.loss.toFixed(2)}`});
                lossTd.style.color = data.loss >= 0 ? redColor : greenColor;
                const avg = data.loss / data.count;
                const avgTd = tr.createEl('td', {text: `${avg.toFixed(2)}`});
                avgTd.style.color = avg >= 0 ? redColor : greenColor;
            });

        const flowCol = tablesWrapper.createDiv('sd-trading-col sd-trading-col-wide');
        flowCol.createEl('h4', {text: '📝 近期流水'});
        const flowScrollContainer = flowCol.createDiv('sd-table-scroll-container');
        const flowTable = flowScrollContainer.createEl('table', {cls: 'sd-trading-table'});
        const fThead = flowTable.createEl('thead').createEl('tr');
        ['时间', '标的', '操作', '价格', '数量', '盈亏', '策略', '纪律'].forEach(h => fThead.createEl('th', {text: h}));
        const fTbody = flowTable.createEl('tbody');

        records.forEach(r => {
            const tr = fTbody.createEl('tr');
            
            const timeStr = r.timestamp ? moment(r.timestamp).format('MM-DD HH:mm') : '-';
            const timeTd = tr.createEl('td', {text: timeStr});
            timeTd.style.fontSize = '12px';
            timeTd.style.color = 'var(--text-muted)';
            
            // modified link to just show ticker or show a modal with ai_review
            const fileLink = tr.createEl('td', {cls: 'sd-trading-link'});
            const a = fileLink.createEl('a', {text: r.ticker || '未命名'});
            a.onclick = () => {
                new ViewTradeModal(this.app, this.plugin, r, uniqueTickers, async (updatedTrade) => {
                    const jsonPath = '04_个人空间/交易复盘/trades.json';
                    let trades = [];
                    if (await this.app.vault.adapter.exists(jsonPath)) {
                        const content = await this.app.vault.adapter.read(jsonPath);
                        trades = JSON.parse(content);
                    }
                    const idx = trades.findIndex((t: any) => t.id === updatedTrade.id);
                    if (idx !== -1) {
                        trades[idx] = updatedTrade;
                        await this.app.vault.adapter.write(jsonPath, JSON.stringify(trades, null, 2));
                        new Notice('交易记录已更新');
                        container.empty();
                        this.renderTradingArea(container);
                    }
                }).open();
            };
            
            tr.createEl('td', {text: r.action});
            tr.createEl('td', {text: `${r.price}`});
            tr.createEl('td', {text: `${r.volume}`});
            const pnlTd = tr.createEl('td', {text: `${r.pnl > 0 ? '+' : ''}${r.pnl}`});
            if (r.pnl !== 0) pnlTd.style.color = r.pnl > 0 ? redColor : greenColor;
            pnlTd.style.fontWeight = 'bold';
            tr.createEl('td', {text: r.strategy});
            tr.createEl('td', {text: `${r.score || '-'}`});
        });
    }

    async renderStatsArea(container: Element, streakDays?: number) {
        container.createEl('h3', {text: '📈 统计分析 (全局)', cls: 'sd-section-title'});

        const overviewPanel = container.createDiv('sd-stats-overview');
        const files = this.app.vault.getMarkdownFiles();
        
        const now = moment();
        const startOfMonth = now.clone().startOf('month');
        const startOfWeek = now.clone().subtract(now.isoWeekday() - 1, 'days').startOf('day');
        const todayStr = now.format('YYYY-MM-DD');
        
        let monthCount = 0;
        let weekCount = 0;
        let todayCount = 0;
        
        files.forEach(f => {
            const cache = this.app.metadataCache.getFileCache(f);
            let created = cache?.frontmatter?.created ? moment(cache.frontmatter.created) : moment(f.stat.ctime);
            if (created.isSameOrAfter(startOfMonth)) monthCount++;
            if (created.isSameOrAfter(startOfWeek)) weekCount++;
            if (created.format('YYYY-MM-DD') === todayStr) todayCount++;
        });

        // Vault Pulse 指标补全（灵感：笔记总数/未完成任务/今日新增/连续天数）
        let openTodoCount = 0;
        try {
            const todos = await this.getTodos();
            openTodoCount = todos.filter(t => !t.completed).length;
        } catch { /* 忽略 */ }

        const totalBox = overviewPanel.createDiv('sd-stat-box');
        totalBox.createDiv({text: `${files.length}`, cls: 'sd-stat-value'});
        totalBox.createDiv({text: '总笔记数', cls: 'sd-stat-label'});

        const monthBox = overviewPanel.createDiv('sd-stat-box');
        monthBox.createDiv({text: `+${monthCount}`, cls: 'sd-stat-value'});
        monthBox.createDiv({text: '本月新增', cls: 'sd-stat-label'});

        const weekBox = overviewPanel.createDiv('sd-stat-box');
        weekBox.createDiv({text: `+${weekCount}`, cls: 'sd-stat-value'});
        weekBox.createDiv({text: '本周新增', cls: 'sd-stat-label'});

        const todayBox = overviewPanel.createDiv('sd-stat-box');
        todayBox.createDiv({text: `+${todayCount}`, cls: 'sd-stat-value'});
        todayBox.createDiv({text: '今日新增', cls: 'sd-stat-label'});

        const todoBox = overviewPanel.createDiv('sd-stat-box');
        todoBox.createDiv({text: `${openTodoCount}`, cls: 'sd-stat-value'});
        todoBox.createDiv({text: '未完成待办', cls: 'sd-stat-label'});

        const streakBox = overviewPanel.createDiv('sd-stat-box');
        streakBox.createDiv({text: `${streakDays ?? 0} 天`, cls: 'sd-stat-value'});
        streakBox.createDiv({text: '连续活跃', cls: 'sd-stat-label'});

        const controls = container.createDiv('sd-chart-controls');
        
        const chartsWrapper = container.createDiv('sd-charts-wrapper');
        const lineBox = chartsWrapper.createDiv('sd-chart-box');
        const pieBox = chartsWrapper.createDiv('sd-chart-box');
        lineBox.createEl('canvas');
        pieBox.createEl('canvas');

        const d7Btn = controls.createEl('button', {text: '过去7天', cls: `sd-btn secondary active`});
        const mBtn = controls.createEl('button', {text: '当月', cls: `sd-btn secondary`});
        const yBtn = controls.createEl('button', {text: '当年', cls: `sd-btn secondary`});

        const resetActive = (activeBtn: HTMLElement) => {
            [d7Btn, mBtn, yBtn].forEach(b => b.removeClass('active'));
            activeBtn.addClass('active');
        };

        d7Btn.onclick = () => { this.currentMode = '7days'; resetActive(d7Btn); this.updateCharts(true); };
        mBtn.onclick = () => { this.currentMode = 'month'; resetActive(mBtn); this.updateCharts(true); };
        yBtn.onclick = () => { this.currentMode = 'year'; resetActive(yBtn); this.updateCharts(true); };

        // delay chart init slightly so DOM is ready
        setTimeout(() => this.updateCharts(true), 50);
    }

    // ===== D-Day 倒计时卡：统一事件源（自定义 + 节日 + 节气），只显示最近三个 =====
    async renderCountdownArea(container: Element) {
        container.createEl('h3', {text: '🎯 D-Day 倒计时', cls: 'sd-section-title'});
        const rerender = () => { container.empty(); this.renderCountdownArea(container); };

        const headerRow = container.createDiv({attr: {style: 'display:flex; justify-content:flex-end; gap:4px; margin-bottom:4px'}});
        headerRow.createEl('button', {text: '📋 全部', cls: 'sd-btn secondary', attr: {style: 'font-size: 0.8em; padding: 2px 8px;', title: '管理全部自定义倒计时'}})
            .onclick = () => new CountdownListModal(this.app, this.plugin, rerender).open();
        headerRow.createEl('button', {text: '＋ 新事件', cls: 'sd-btn secondary', attr: {style: 'font-size: 0.8em; padding: 2px 8px;'}})
            .onclick = () => new ManageCountdownModal(this.app, this.plugin, null, rerender).open();

        const todayStr = moment().format('YYYY-MM-DD');
        type Entry = {title: string; date: string; kind: 'custom' | 'festival' | 'term'; item?: CountdownItem};
        const entries: Entry[] = [];

        // 自定义事件（仅未来）
        for (const c of await this.getCountdowns()) {
            if (c.targetDate >= todayStr) entries.push({title: c.title, date: c.targetDate, kind: 'custom', item: c});
        }
        // 节日 / 节气（每年自动生成，含今天）
        for (const h of upcomingHolidays(todayStr)) {
            entries.push({title: h.name, date: h.date, kind: h.kind});
        }

        entries.sort((a, b) => a.date.localeCompare(b.date));
        const top = entries.slice(0, 3); // ④ 卡片只显示最近的三个

        if (top.length === 0) {
            container.createDiv({text: '暂无即将到来的倒计时。',
                attr: {style: 'padding: 10px; color: var(--text-muted); font-size: 13px;'}});
            return;
        }
        const list = container.createDiv('sd-countdown-list');
        for (const e of top) {
            const daysLeft = moment(e.date).diff(moment().startOf('day'), 'days');
            const stateCls = daysLeft < 0 ? 'sd-dd-past' : (daysLeft <= 7 ? 'sd-dd-soon' : '');
            const row = list.createDiv(`sd-countdown-item ${stateCls}`);
            if (e.kind === 'custom') {
                row.onclick = () => new ManageCountdownModal(this.app, this.plugin, e.item!, rerender).open();
            } else {
                row.setAttribute('title', `${e.kind === 'term' ? '节气' : '节日'} · 每年自动生成`);
            }
            const info = row.createDiv('sd-countdown-info');
            info.createDiv({text: e.title, cls: 'sd-countdown-title'});
            info.createDiv({
                text: moment(e.date).format('YYYY-MM-DD') +
                    (e.kind === 'festival' ? ' · 节日' : e.kind === 'term' ? ' · 节气' : ''),
                cls: 'sd-countdown-date'
            });
            const daysEl = row.createDiv('sd-countdown-days');
            if (daysLeft === 0) {
                daysEl.createSpan({text: '今天', cls: 'sd-countdown-num'});
                daysEl.createSpan({text: ' 🎉', cls: 'sd-countdown-unit'});
            } else {
                daysEl.createSpan({text: `${Math.abs(daysLeft)}`, cls: 'sd-countdown-num'});
                daysEl.createSpan({text: daysLeft > 0 ? ' 天' : ' 天前', cls: 'sd-countdown-unit'});
            }
        }
    }

    // ===== 导航入口卡片（纯色按钮竖排，五色轮换）=====
    async renderNavArea(container: Element) {
        container.createEl('h3', {text: '🧭 快速导航', cls: 'sd-section-title'});
        const entries = await this.plugin.getNavEntries();
        const grid = container.createDiv('sd-nav-grid');
        const palette = ['#E76F51', '#2A9D8F', '#457B9D', '#E29A38', '#7c5cff'];
        entries.forEach((e, idx) => {
            const card = grid.createDiv('sd-nav-entry-card');
            card.style.backgroundColor = palette[idx % palette.length];
            card.setAttribute('title', `${e.name} · ${e.desc}\n→ ${e.path}（在设置中可修改入口路径）`);
            card.createSpan({text: e.icon, cls: 'sd-nav-entry-icon'});
            card.createSpan({text: e.name, cls: 'sd-nav-entry-name'});
            card.onclick = async () => {
                try {
                    const target = this.app.vault.getAbstractFileByPath(e.path);
                    if (!target) { new Notice(`入口路径不存在：${e.path}`); return; }
                    if (target instanceof TFile) {
                        await this.app.workspace.getLeaf(false).openFile(target);
                    } else {
                        // 文件夹：在左侧文件列表中定位展开
                        const fe = (this.app as any).internalPlugins?.getPluginById?.('file-explorer');
                        if (fe?.instance?.revealInFolder) fe.instance.revealInFolder(target);
                        else new Notice(`文件夹：${e.path}`);
                    }
                } catch (err) {
                    new Notice('打开入口失败: ' + String(err));
                }
            };
        });
    }


    private async renderUsageArea(card: HTMLElement): Promise<void> {
        try {
          // 标题 + 刷新（固定，不随数据刷新重建）
          const header = card.createDiv({ cls: 'sd-section-title' });
          header.setText('⚡ Token 用量');
          const refreshBtn = header.createEl('button', { text: '🔄', cls: 'sd-btn secondary' });
          refreshBtn.style.marginLeft = '8px';
          refreshBtn.style.padding = '0 6px';
          const statusEl = header.createEl('span', { text: '⏳ 正在获取数据...', cls: 'sd-usage-refresh-status' });
          statusEl.style.display = 'none';
          refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.setText('⏳');
            statusEl.style.display = '';
            const body = card.querySelector('.sd-usage-body') as HTMLElement | null;
            try {
              const { exec } = require('child_process');
              await new Promise<void>((resolve, reject) => {
                exec('python "D:/workspace/01_Projects/obsidian-smart-dashboard/collect_usage.py" --quiet',
                  (error: any) => { if (error) reject(error); else resolve(); });
              });
            } catch (e) {
              console.error('Usage collect error:', e);
            }
            // 采集完成（含失败）：整体重渲染（读 JSON 兜底），面板不因刷新变空
            if (body) { body.empty(); await this.renderUsageBody(body); }
            statusEl.style.display = 'none';
            refreshBtn.disabled = false;
            refreshBtn.setText('🔄');
          });
          // 数据区（可整体刷新）
          const body = card.createDiv({ cls: 'sd-usage-body' });
          await this.renderUsageBody(body);
        } catch (e) {
          card.createDiv().setText('卡片渲染失败: ' + String(e));
        }
      }

      private async renderUsageBody(body: HTMLElement): Promise<void> {
        try {
          // 读数据
          let raw: string;
          try {
            raw = await this.app.vault.adapter.read('.smart-dashboard/usage_daily.json');
          } catch (e) {
            body.createDiv().setText('暂无 token 数据：请先运行 collect_usage.py');
            return;
          }
          const data = JSON.parse(raw);
          const days = data.days || {};
          const now = new Date();
          const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
          const monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
          // 本月累计（全部 token：输入+输出+缓存+推理，口径统一）
          let monthAll = { input: 0, output: 0, cache: 0, reasoning: 0 };
          for (const k of Object.keys(days)) {
            if (!k.startsWith(monthKey)) continue;
            const dt = this.dailyTokens(days[k]);
            monthAll.input += dt.input; monthAll.output += dt.output;
            monthAll.cache += dt.cache; monthAll.reasoning += dt.reasoning;
          }
          const totalBox = body.createDiv({ cls: 'sd-usage-total' });
          totalBox.createDiv({ text: '本月消耗', cls: 'sd-usage-total-label' });
          totalBox.createDiv({ text: this.fmtTokens(monthAll.input + monthAll.output + monthAll.cache + monthAll.reasoning), cls: 'sd-usage-total-value' });
          totalBox.createDiv({ text: '输入 ' + this.fmtTokens(monthAll.input) + ' ｜ 输出 ' + this.fmtTokens(monthAll.output), cls: 'sd-usage-total-sub' });
          // 今日（全部 token）
          const t = this.dailyTokens(days[today]);
          const stat = body.createDiv({ cls: 'sd-usage-stats' });
          stat.setText('今日 ' + this.fmtTokens(t.input + t.output + t.cache + t.reasoning) + '（输入' + this.fmtTokens(t.input) + ' 输出' + this.fmtTokens(t.output) + '）');
          // 月/年切换
          const seg = body.createDiv({ cls: 'sd-usage-seg' });
          const mBtn = seg.createEl('button', { text: '月', cls: 'sd-btn secondary active' });
          const yBtn = seg.createEl('button', { text: '年', cls: 'sd-btn secondary' });
          const heat = body.createDiv({ cls: 'sd-usage-heatmap' });
          const render = (view: 'month' | 'year') => {
            heat.empty();
            if (view === 'month') this.renderMonthHeatmap(heat, days, today, now);
            else this.renderYearHeatmap(heat, days, today, now);
          };
          mBtn.onclick = () => { mBtn.addClass('active'); yBtn.removeClass('active'); render('month'); };
          yBtn.onclick = () => { yBtn.addClass('active'); mBtn.removeClass('active'); render('year'); };
          render('month');  // 默认本月
          // 周/累计合计 + 缓存命中率（同一行：左合计，右命中率）
          // 累计改为含 cache/reasoning 的全部 token，明细直接写在本行（不额外加行）
          const bottomRow = body.createDiv({ cls: 'sd-usage-bottom-row' });
          const sum = bottomRow.createDiv({ cls: 'sd-usage-summary' });
          const totals = this.allTotalWithCache(days);
          const totalAll = totals.input + totals.output + totals.cache + totals.reasoning;
          sum.setText('本周 ' + this.fmtTokens(this.sumRange(days, 7)) + ' ｜ 累计 ' + this.fmtTokens(totalAll)
            + '（输入' + this.fmtTokens(totals.input) + ' 输出' + this.fmtTokens(totals.output) + '）');
          const cs = this.cacheStats(days, monthKey);
          const rateStr = (cs.hit + cs.miss) > 0 ? (cs.hit / (cs.hit + cs.miss) * 100).toFixed(3) + '%' : '—';
          const rateLine = bottomRow.createDiv({ cls: 'sd-usage-cache-rate' });
          rateLine.setText('缓存命中 ' + rateStr);
        } catch (e) {
          body.createDiv().setText('卡片渲染失败: ' + String(e));
        }
      }

      /**
       * 计算所有 token 总和（含 cache_read 和 reasoning）
       */
      private allTotalWithCache(days: any): { input: number; output: number; cache: number; reasoning: number } {
        let input = 0, output = 0, cache = 0, reasoning = 0;
        for (const k of Object.keys(days)) {
          const d = days[k];
          // hermes
          if (d.hermes) {
            input += d.hermes.input || 0;
            output += d.hermes.output || 0;
            cache += d.hermes.cache || 0;
          }
          // dsh
          if (d.dsh) {
            input += d.dsh.input || 0;
            output += d.dsh.output || 0;
            cache += d.dsh.cache || 0;
          }
          // opencode
          if (d.opencode) {
            input += d.opencode.input || 0;
            output += d.opencode.output || 0;
            cache += d.opencode.cache || 0;
            reasoning += d.opencode.reasoning || 0;
          }
          // workbuddy
          if (d.workbuddy) {
            input += d.workbuddy.input || 0;
            output += d.workbuddy.output || 0;
            cache += d.workbuddy.cache || 0;
            reasoning += d.workbuddy.reasoning || 0;
          }
          // codebuddy
          if (d.codebuddy) {
            input += d.codebuddy.input || 0;
            output += d.codebuddy.output || 0;
            cache += d.codebuddy.cache || 0;
            reasoning += d.codebuddy.reasoning || 0;
          }
        }
        return { input, output, cache, reasoning };
      }

      /**
       * 缓存命中统计（口径统一为 命中/(命中+未命中)）：
       * - hermes: cache=命中、input 含命中 → 未命中 = input - cache
       * - dsh:    cache=cacheReadTokens（不含于 inputTokens）→ 未命中 = input
       * - opencode: cache=tokens_cache_read（不含于 inputTokens）→ 未命中 = input
       * - workbuddy: inputTokens 已含 cached_tokens，采集时已折算为未命中 → 未命中 = input
       * - codebuddy: 同 workbuddy，inputTokens 已含 cached_tokens，采集时已折算为未命中 → 未命中 = input
       */
      private cacheStats(days: any, prefix: string): { hit: number; miss: number } {
        let hit = 0, miss = 0;
        for (const k of Object.keys(days)) {
          if (prefix && !k.startsWith(prefix)) continue;
          const d = days[k];
          if (d.hermes) {
            const hIn = d.hermes.input || 0, hC = d.hermes.cache || 0;
            hit += Math.min(hC, hIn);
            miss += Math.max(0, hIn - hC);
          }
          if (d.dsh) {
            hit += d.dsh.cache || 0;
            miss += d.dsh.input || 0;
          }
          if (d.opencode) {
            hit += d.opencode.cache || 0;
            miss += d.opencode.input || 0;
          }
          if (d.workbuddy) {
            hit += d.workbuddy.cache || 0;
            miss += d.workbuddy.input || 0;
          }
          if (d.codebuddy) {
            hit += d.codebuddy.cache || 0;
            miss += d.codebuddy.input || 0;
          }
        }
        return { hit, miss };
      }

      /**
       * 单日五源合并 token（口径统一：含 cache 与 reasoning）
       * hermes/dsh/opencode/workbuddy/codebuddy 五源相加；reasoning 来自 opencode/workbuddy/codebuddy
       */
      private dailyTokens(d: any): { input: number; output: number; cache: number; reasoning: number } {
        const h = d && d.hermes || {};
        const s = d && d.dsh || {};
        const o = d && d.opencode || {};
        const w = d && d.workbuddy || {};
        const c = d && d.codebuddy || {};
        return {
          input: (h.input || 0) + (s.input || 0) + (o.input || 0) + (w.input || 0) + (c.input || 0),
          output: (h.output || 0) + (s.output || 0) + (o.output || 0) + (w.output || 0) + (c.output || 0),
          cache: (h.cache || 0) + (s.cache || 0) + (o.cache || 0) + (w.cache || 0) + (c.cache || 0),
          reasoning: (o.reasoning || 0) + (w.reasoning || 0) + (s.reasoning || 0) + (h.reasoning || 0) + (c.reasoning || 0),
        };
      }

      private fmtTokens(n: number): string {
        if (!n) return '0';
        const m = n / 1e6;
        if (m >= 1) return m.toFixed(1) + 'M';          // 统一 M 单位（含 10 亿级以上也不升 G）
        if (m >= 0.01) return m.toFixed(2) + 'M';       // 万级：0.16M
        return String(Math.round(n));                   // 极小值显示原始数字
      }

      private sumRange(days: any, n: number): number {
        let total = 0;
        const keys = Object.keys(days).sort();
        const recent = keys.slice(-n);
        for (const k of recent) {
          const dt = this.dailyTokens(days[k]);
          total += dt.input + dt.output + dt.cache + dt.reasoning;
        }
        return total;
      }

      private renderMonthHeatmap(container: HTMLElement, days: any, today: string, now: Date): void {
        try {
          const year = now.getFullYear(), month = now.getMonth();
          const dayCount = new Date(year, month + 1, 0).getDate();
          const flow = container.createDiv({ cls: 'sd-usage-flow' });
          for (let day = 1; day <= dayCount; day++) {
            const key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
            const dt = this.dailyTokens(days[key]);
            const total = dt.input + dt.output + dt.cache + dt.reasoning;
            const cell = flow.createDiv({ cls: 'sd-usage-cell' });
            let lv = 0;
            if (total > 5e8) lv = 4; else if (total > 1.5e8) lv = 3; else if (total > 4e7) lv = 2; else if (total > 1e7) lv = 1;
            cell.addClass('sd-usage-lv' + lv);
            if (key === today) cell.addClass('sd-usage-today');
            cell.setAttribute('title', key + ' 总' + this.fmtTokens(total) + '（输入' + this.fmtTokens(dt.input) + ' 输出' + this.fmtTokens(dt.output) + '）');
          }
          const label = container.createDiv({ cls: 'sd-usage-caption' });
          label.setText((month + 1) + '月 ' + dayCount + ' 天（绿=当日全量 token）');
        } catch (e) { /* 忽略 */ }
      }

      private renderYearHeatmap(container: HTMLElement, days: any, today: string, now: Date): void {
        try {
          const year = now.getFullYear();
          const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
          const totalDays = isLeap ? 366 : 365;
          const grid = container.createDiv({ cls: 'sd-usage-yeargrid' });
          for (let d = 1; d <= totalDays; d++) {
            const day = new Date(year, 0, d);          // 第 d 天（自动处理跨月）
            const key = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
            const dt = this.dailyTokens(days[key]);
            const total = dt.input + dt.output + dt.cache + dt.reasoning;
            const cell = grid.createDiv({ cls: 'sd-usage-yearcell' });
            let lv = 0;
            if (total > 5e8) lv = 4; else if (total > 1.5e8) lv = 3; else if (total > 4e7) lv = 2; else if (total > 1e7) lv = 1;
            cell.addClass('sd-usage-lv' + lv);
            if (key === today) cell.addClass('sd-usage-today');
            cell.setAttribute('title', key + ' 总' + this.fmtTokens(total) + '（输入' + this.fmtTokens(dt.input) + ' 输出' + this.fmtTokens(dt.output) + '）');
          }
          const label = container.createDiv({ cls: 'sd-usage-caption' });
          label.setText(year + '年 1月-12月 每日一格（绿=当日全量 token）');
        } catch (e) { /* 忽略 */ }
      }

      // ===== 订阅额度卡片 =====

    // ===== 体育赛事：读 .smart-dashboard/sports.json，每联赛取接下来最早一场 =====
    private async renderSportsArea(card: HTMLElement): Promise<void> {
        try {
            const header = card.createDiv({cls: 'sd-section-title'});
            header.setText('🏟️ 体育赛事');

            const body = card.createDiv({cls: 'sd-sports-body'});
            let raw: string;
            try {
                raw = await this.app.vault.adapter.read('.smart-dashboard/sports.json');
            } catch {
                body.createDiv({cls: 'sd-sports-empty'}).setText('暂无赛程');
                return;
            }
            const data = JSON.parse(raw);
            const leagues: any[] = data?.leagues || [];

            // datetime 为北京时间 ISO 风格（"YYYY-MM-DD HH:mm"），兼容 "(+1)" 跨天标记
            const parseDt = (dt: string): moment.Moment | null => {
                if (!dt || typeof dt !== 'string') return null;
                const plusDay = dt.match(/\(\+(\d+)\)/);
                const d = moment(dt.replace(/\(\+\d+\)/, '').replace(' ', 'T'));
                if (!d.isValid()) return null;
                return plusDay ? d.add(parseInt(plusDay[1], 10), 'day') : d;
            };

            interface SportsEntry { icon: string; name: string; label: string; home?: boolean; sport: string; dt: moment.Moment; id: string; round?: number; }
            const entries: SportsEntry[] = [];
            for (const league of leagues) {
                const now = moment();
                const upcoming = (league.events || [])
                    .map((ev: any) => ({ev, dt: parseDt(ev.datetime)}))
                    .filter((x: any) => x.dt && x.dt.isAfter(now))
                    .sort((a: any, b: any) => a.dt.valueOf() - b.dt.valueOf());
                if (!upcoming.length) continue;
                const next = upcoming[0];
                entries.push({
                    icon: league.icon || '🏅',
                    name: league.name || league.id,
                    label: next.ev.label || '',
                    home: next.ev.home,
                    sport: league.sport || '',
                    dt: next.dt,
                    id: league.id || '',
                    round: typeof next.ev.round === 'number' ? next.ev.round : undefined,
                });
            }

            if (entries.length === 0) {
                body.createDiv({cls: 'sd-sports-empty'}).setText('暂无赛程');
                return;
            }
            entries.sort((a, b) => a.dt.valueOf() - b.dt.valueOf());

            const list = body.createDiv({cls: 'sd-sports-list'});
            for (const en of entries) {
                const item = list.createDiv({cls: 'sd-sports-item'});
                if (en.id) item.setAttribute('data-league', en.id.toLowerCase());
                const info = item.createDiv({cls: 'sd-sports-info'});
                info.createDiv({cls: 'sd-sports-icon', text: en.icon});
                info.createDiv({cls: 'sd-sports-name', text: en.name});
                // 对手文本：足球 label 含 vs 时主场比赛加 🏠；F1 直接用 label
                let opponentText = en.label;
                if (en.sport === '足球' && opponentText.includes('vs') && en.home === true) {
                    opponentText += ' 🏠';
                }
                // 轮次徽标：赛车显示"第N场大奖赛"，足球显示"第N轮"（行内，不加高）
                const oppDiv = item.createDiv({cls: 'sd-sports-opponent'});
                if (en.round != null) {
                    const roundText = en.sport === '赛车' ? `第${en.round}场大奖赛` : `第${en.round}轮`;
                    oppDiv.createSpan({cls: 'sd-sports-round', text: roundText});
                }
                oppDiv.createSpan({text: opponentText});
                const meta = item.createDiv({cls: 'sd-sports-meta'});
                meta.createDiv({cls: 'sd-sports-date', text: en.dt.format('M月D日 HH:mm')});
                const diffDays = en.dt.clone().startOf('day').diff(moment().startOf('day'), 'days');
                meta.createDiv({cls: 'sd-sports-days', text: diffDays <= 0 ? '今天' : `还有 ${diffDays} 天`});
            }
        } catch (e) {
            card.createDiv().setText('卡片渲染失败: ' + String(e));
        }
    }

      private async renderSubscriptionsArea(card: HTMLElement): Promise<void> {
        try {
          // 标题 + 按钮
          const header = card.createDiv({ cls: 'sd-section-title' });
          header.setText('📊 订阅额度');
          
          // 添加按钮
          const addBtn = header.createEl('button', { text: '➕', cls: 'sd-btn secondary' });
          addBtn.style.marginLeft = '8px';
          addBtn.style.padding = '0 6px';
          addBtn.setAttribute('title', '添加订阅');
          addBtn.addEventListener('click', () => {
            new SelectSubscriptionModal(this.app, (providerId) => {
              const template = SUBSCRIPTION_TEMPLATES[providerId];
              if (template) {
                new AddSubscriptionModal(this.app, providerId, async (id, credential) => {
                  // 保存凭证并刷新
                  await this.saveSubscriptionCredential(id, credential);
                  const body = card.querySelector('.sd-subscriptions-body') as HTMLElement | null;
                  if (body) { body.empty(); this.renderSubscriptionsBody(body); }
                }).open();
              }
            }).open();
          });
          
          // 刷新按钮
          const refreshBtn = header.createEl('button', { text: '🔄', cls: 'sd-btn secondary' });
          refreshBtn.style.marginLeft = '4px';
          refreshBtn.style.padding = '0 6px';
          const statusEl = header.createEl('span', { text: '⏳ 正在获取数据...', cls: 'sd-subscriptions-refresh-status' });
          statusEl.style.display = 'none';
          refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.setText('⏳');
            statusEl.style.display = '';
            const body = card.querySelector('.sd-subscriptions-body') as HTMLElement | null;
            try {
              const { exec } = require('child_process');
              await new Promise<void>((resolve, reject) => {
                exec('python "D:/workspace/01_Projects/obsidian-smart-dashboard/collect_subscriptions.py" collect',
                  (error: any) => { if (error) reject(error); else resolve(); });
              });
            } catch (e) {
              console.error('Subscription collect error:', e);
            }
            if (body) { body.empty(); await this.renderSubscriptionsBody(body); }
            statusEl.style.display = 'none';
            refreshBtn.disabled = false;
            refreshBtn.setText('🔄');
          });
          
          // 数据区
          const body = card.createDiv({ cls: 'sd-subscriptions-body' });
          await this.renderSubscriptionsBody(body);
        } catch (e) {
          card.createDiv().setText('卡片渲染失败: ' + String(e));
        }
      }

      private async saveSubscriptionCredential(providerId: string, credential: string): Promise<void> {
        // 调用 Python 脚本保存凭证（加密存储 + 合并，而非明文覆盖）
        const scriptPath = 'D:/workspace/01_Projects/obsidian-smart-dashboard/collect_subscriptions.py';
        
        try {
          // 凭证键名：SCNet 用 token（登录态 cookie），其余按 authType 映射
          const credKey = providerId === 'scnet-tokenplan' ? 'token'
            : SUBSCRIPTION_TEMPLATES[providerId]?.authType === 'cookie' ? 'cookie' : 'apiKey';
          const key = credential.trim();
          
          // 先启用 provider（加密写入 + enabled），再运行采集
          const { exec } = require('child_process');
          await new Promise<void>((resolve) => {
            exec(`python "${scriptPath}" add ${providerId} ${credKey} "${key.replace(/"/g, '\\"')}"`,
              (error: any) => {
                if (error) console.error('Add credential error:', error);
                resolve();
              });
          });
          
          // 运行采集脚本
          await new Promise<void>((resolve) => {
            exec(`python "${scriptPath}" collect`, (error: any) => {
              if (error) console.error('Collect error:', error);
              resolve();
            });
          });
          
          new Notice(`已添加 ${SUBSCRIPTION_TEMPLATES[providerId]?.name || providerId}`);
        } catch (e) {
          new Notice('保存失败: ' + String(e));
        }
      }

      private async renderSubscriptionsBody(body: HTMLElement): Promise<void> {
        try {
          // 读数据
          let raw: string;
          try {
            raw = await this.app.vault.adapter.read('.smart-dashboard/subscriptions.json');
          } catch (e) {
            body.createDiv({ cls: 'sd-subscriptions-empty' }).setText('暂无订阅数据：点击 ➕ 添加');
            return;
          }
          const data = JSON.parse(raw);
          const providers = data.providers || [];
          
          if (providers.length === 0) {
            body.createDiv({ cls: 'sd-subscriptions-empty' }).setText('暂无订阅数据：点击 ➕ 添加');
            return;
          }

          // 渲染每个订阅
          const list = body.createDiv({ cls: 'sd-subscriptions-list' });
          for (const provider of providers) {
            const item = list.createDiv({ cls: 'sd-subscriptions-item' });
            
            // 图标 + 名称
                        const info = item.createDiv({ cls: 'sd-subscriptions-info' });
                        info.createDiv({ cls: 'sd-subscriptions-icon', text: provider.icon || '📦' });
                        info.createDiv({ cls: 'sd-subscriptions-name', text: provider.name || provider.provider });

                        // 余额型 provider（DeepSeek 等预付费余额）：显示金额文本而非进度条
                        if (provider.type === 'balance') {
                          const balDiv = item.createDiv({ cls: 'sd-subscriptions-windows' });
                          const currency = provider.currency || 'CNY';
                          const total = typeof provider.balance === 'number'
                            ? provider.balance : parseFloat(provider.balance || '0');
                          const balances = provider.balances || {};
                          const granted = typeof balances.granted === 'number'
                            ? balances.granted : parseFloat(balances.granted || '0');
                          const toppedUp = typeof balances.topped_up === 'number'
                            ? balances.topped_up : parseFloat(balances.topped_up || '0');
                          const balDivInner = balDiv.createDiv({ cls: 'sd-subscriptions-window' });
                          balDivInner.createDiv({ cls: 'sd-subscriptions-window-label', text: '余额' });
                          const balVal = balDivInner.createDiv({ cls: 'sd-subscriptions-balance-value' });
                          balVal.setText(`${currency} ${total.toFixed(2)}`);
                          if (granted > 0 || toppedUp > 0) {
                            const detail = balDivInner.createDiv({ cls: 'sd-subscriptions-balance-detail' });
                            const parts: string[] = [];
                            if (toppedUp > 0) parts.push(`充${toppedUp.toFixed(2)}`);
                            if (granted > 0) parts.push(`赠${granted.toFixed(2)}`);
                            if (parts.length) detail.setText(parts.join(' / '));
                          }
                          // 删除按钮
                          const deleteBtn = item.createEl('button', {
                            text: '🗑️',
                            cls: 'sd-subscriptions-delete-btn',
                            attr: { title: '删除' }
                          });
                          deleteBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            new DeleteConfirmModal(
                              this.app,
                              provider.name || provider.provider,
                              provider.icon || '📦',
                              async () => {
                                await this.deleteSubscription(provider.provider);
                                body.empty();
                                await this.renderSubscriptionsBody(body);
                              }
                            ).open();
                          });
                          continue;
                        }

                        // 配额窗口
                        const windows = provider.windows || {};
                        const windowsDiv = item.createDiv({ cls: 'sd-subscriptions-windows' });
            
            // Rolling (5h)
            if (windows.rolling) {
              const windowDiv = windowsDiv.createDiv({ cls: 'sd-subscriptions-window' });
              windowDiv.createDiv({ cls: 'sd-subscriptions-window-label', text: '5h' });
              const bar = windowDiv.createDiv({ cls: 'sd-subscriptions-bar' });
              const fill = bar.createDiv({ cls: 'sd-subscriptions-bar-fill' });
              fill.style.width = `${windows.rolling.percent || 0}%`;
              this.applySubscriptionBarColor(fill, windows.rolling.percent || 0);
              windowDiv.createDiv({ cls: 'sd-subscriptions-window-value', text: `${windows.rolling.percent || 0}%` });
            }
            
            // Weekly
            if (windows.weekly) {
              const windowDiv = windowsDiv.createDiv({ cls: 'sd-subscriptions-window' });
              windowDiv.createDiv({ cls: 'sd-subscriptions-window-label', text: '周' });
              const bar = windowDiv.createDiv({ cls: 'sd-subscriptions-bar' });
              const fill = bar.createDiv({ cls: 'sd-subscriptions-bar-fill' });
              fill.style.width = `${windows.weekly.percent || 0}%`;
              this.applySubscriptionBarColor(fill, windows.weekly.percent || 0);
              windowDiv.createDiv({ cls: 'sd-subscriptions-window-value', text: `${windows.weekly.percent || 0}%` });
            }
            
            // Monthly
            if (windows.monthly) {
              const windowDiv = windowsDiv.createDiv({ cls: 'sd-subscriptions-window' });
              windowDiv.createDiv({ cls: 'sd-subscriptions-window-label', text: '月' });
              const bar = windowDiv.createDiv({ cls: 'sd-subscriptions-bar' });
              const fill = bar.createDiv({ cls: 'sd-subscriptions-bar-fill' });
              fill.style.width = `${windows.monthly.percent || 0}%`;
              this.applySubscriptionBarColor(fill, windows.monthly.percent || 0);
              windowDiv.createDiv({ cls: 'sd-subscriptions-window-value', text: `${windows.monthly.percent || 0}%` });
            }
            
            // 删除按钮
            const deleteBtn = item.createEl('button', { 
              text: '🗑️', 
              cls: 'sd-subscriptions-delete-btn',
              attr: { title: '删除' }
            });
            deleteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              new DeleteConfirmModal(
                this.app, 
                provider.name || provider.provider, 
                provider.icon || '📦',
                async () => {
                  await this.deleteSubscription(provider.provider);
                  body.empty();
                  this.renderSubscriptionsBody(body);
                }
              ).open();
            });
          }
          
          // 更新时间
          const footer = body.createDiv({ cls: 'sd-subscriptions-footer' });
          footer.setText(`更新: ${data.updated_at ? new Date(data.updated_at).toLocaleString() : '未知'}`);
          
        } catch (e) {
          body.createDiv().setText('卡片渲染失败: ' + String(e));
        }
      }

      private async deleteSubscription(providerId: string): Promise<void> {
        // 调用 Python 脚本删除 provider（同时清理 config 与 data，与「添加」链路对称）
        const scriptPath = 'D:/workspace/01_Projects/obsidian-smart-dashboard/collect_subscriptions.py';

        try {
          const { exec } = require('child_process');
          await new Promise<void>((resolve) => {
            exec(`python "${scriptPath}" remove ${providerId}`,
              (error: any) => {
                if (error) console.error('Remove subscription error:', error);
                resolve();
              });
          });

          new Notice(`已删除 ${SUBSCRIPTION_TEMPLATES[providerId]?.name || providerId}`);
        } catch (e) {
          new Notice('删除失败: ' + String(e));
        }
      }

      private applySubscriptionBarColor(fill: HTMLElement, percent: number): void {
        if (percent >= 90) {
          fill.style.backgroundColor = 'var(--color-red)';
        } else if (percent >= 70) {
          fill.style.backgroundColor = 'var(--color-orange)';
        } else if (percent >= 50) {
          fill.style.backgroundColor = 'var(--color-yellow)';
        } else {
          fill.style.backgroundColor = 'var(--color-green)';
        }
      }
}

class ViewTradeModal extends Modal {
    trade: any;
    tickers: string[];
    onEdit: (updatedTrade: any) => void;
    plugin: SmartDashboardPlugin;
    
    constructor(app: App, plugin: SmartDashboardPlugin, trade: any, tickers: string[], onEdit: (updatedTrade: any) => void) {
        super(app);
        this.plugin = plugin;
        this.trade = trade;
        this.tickers = tickers;
        this.onEdit = onEdit;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        const header = contentEl.createDiv({attr: {style: 'display:flex; justify-content:space-between; align-items:center;'}});
        header.createEl('h2', {text: `交易复盘 - ${this.trade.ticker}`, attr: {style: 'margin:0'}});
        
        const editBtn = header.createEl('button', {text: '✏️ 编辑', cls: 'sd-btn'});
        editBtn.onclick = () => {
            this.close();
            new EditTradeModal(this.app, this.plugin, this.trade, this.tickers, (updated) => {
                this.onEdit(updated);
            }).open();
        };

        contentEl.createEl('p', {text: `日期: ${this.trade.date || moment(this.trade.timestamp).format('YYYY-MM-DD')} | 操作: ${this.trade.action} | 价格: ${this.trade.price} | 数量: ${this.trade.volume}`});
        
        const pnlEl = contentEl.createEl('h3', {text: `盈亏: ${this.trade.pnl}`});
        pnlEl.style.color = this.trade.pnl > 0 ? "#e53935" : (this.trade.pnl < 0 ? "#43a047" : "");
        
        contentEl.createEl('h3', {text: '🤖 AI 深度复盘'});
        if (this.trade.ai_review) {
            const reviewDiv = contentEl.createDiv();
            // simple text rendering, preserving line breaks
            const lines = this.trade.ai_review.split('\n');
            lines.forEach(line => {
                reviewDiv.createEl('p', {text: line, attr: {style: 'margin-bottom: 5px;'}});
            });
        } else {
            contentEl.createEl('p', {text: '该交易尚未生成 AI 复盘分析。请运行 ai_trade_analyzer.py'});
        }
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

// ===== D-Day 倒计时编辑弹窗 =====
class ManageCountdownModal extends Modal {
    item: CountdownItem | null;
    plugin: SmartDashboardPlugin;
    onSave: () => void;

    constructor(app: App, plugin: SmartDashboardPlugin, item: CountdownItem | null, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.item = item;
        this.onSave = onSave;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.createEl('h2', {text: this.item ? '编辑倒计时' : '新建倒计时'});

        let title = this.item?.title || '';
        let targetDate = this.item?.targetDate || moment().format('YYYY-MM-DD');

        new Setting(contentEl).setName('事件名称').addText(t => {
            t.setValue(title).onChange(v => title = v);
            t.inputEl.style.width = '100%';
            t.setPlaceholder('如：项目上线');
        });
        new Setting(contentEl).setName('目标日期').addText(t => {
            t.inputEl.type = 'date';
            t.setValue(targetDate).onChange(v => targetDate = v);
        });

        const btns = new Setting(contentEl);
        btns.addButton(btn => btn.setButtonText('保存').setCta().onClick(async () => {
            if (!title.trim() || !targetDate) { new Notice('请填写事件名称与目标日期'); return; }
            let view = (this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD)[0]?.view as SmartDashboardView);
            if (!view) return;
            let items = await view.getCountdowns();
            if (this.item) {
                const idx = items.findIndex(x => x.id === this.item!.id);
                if (idx >= 0) items[idx] = { ...this.item, title: title.trim(), targetDate };
            } else {
                items.push({ id: Date.now().toString(), title: title.trim(), targetDate });
            }
            await view.saveCountdowns(items);
            this.close();
            this.onSave();
        }));
        if (this.item) {
            btns.addButton(btn => btn.setButtonText('删除').setWarning().onClick(async () => {
                let view = (this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD)[0]?.view as SmartDashboardView);
                if (!view) return;
                const items = (await view.getCountdowns()).filter(x => x.id !== this.item!.id);
                await view.saveCountdowns(items);
                this.close();
                this.onSave();
            }));
        }
    }
    onClose() { this.contentEl.empty(); }
}

// ===== 全部倒计时事件管理弹窗 =====
class CountdownListModal extends Modal {
    plugin: SmartDashboardPlugin;
    onSave: () => void;

    constructor(app: App, plugin: SmartDashboardPlugin, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSave = onSave;
    }

    async onOpen() {
        await this.renderList();
    }

    private async renderList() {
        const {contentEl} = this;
        contentEl.empty();
        contentEl.createEl('h2', {text: '全部倒计时事件（自定义）'});
        let view = (this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_DASHBOARD)[0]?.view as SmartDashboardView);
        if (!view) return;
        const items = (await view.getCountdowns()).slice().sort((a, b) => a.targetDate.localeCompare(b.targetDate));
        if (!items.length) {
            contentEl.createEl('div', {text: '暂无自定义倒计时。', attr: {style: 'color: var(--text-muted); padding: 10px;'}});
        }
        for (const c of items) {
            const daysLeft = moment(c.targetDate).diff(moment().startOf('day'), 'days');
            const status = daysLeft >= 0 ? `还剩 ${daysLeft} 天` : `已过 ${-daysLeft} 天`;
            new Setting(contentEl)
                .setName(c.title)
                .setDesc(`${c.targetDate} · ${status}`)
                .addButton(b => b.setButtonText('编辑').onClick(() => {
                    this.close();
                    new ManageCountdownModal(this.app, this.plugin, c, this.onSave).open();
                }))
                .addButton(b => b.setButtonText('删除').setWarning().onClick(async () => {
                    await view.saveCountdowns((await view.getCountdowns()).filter(x => x.id !== c.id));
                    this.onSave();
                    await this.renderList();
                }));
        }
        contentEl.createEl('p', {text: '节日与节气为自动生成，无需在此管理。', attr: {style: 'color: var(--text-muted); font-size: 12px;'}});
    }

    onClose() { this.contentEl.empty(); }
}

const CARD_LABELS: Record<string, string> = {
    'sd-calendar-section': '日历',
    'sd-quickjot-section': '极速随笔',
    'sd-search-section': '智能检索',
    'sd-create-section': '快捷创建',
    'sd-stats-section': '统计分析',
    'sd-usage-section': 'Token 用量',
    'sd-subscriptions-section': '订阅额度',
    'sd-sports-section': '体育赛事',
    'sd-schedule-section': '日程管理',
    'sd-todo-section': '待办事项',
    'sd-trading-section': '交易复盘',
    'sd-countdown-section': 'D-Day 倒计时',
    'sd-nav-section': '导航入口',
};

class SmartDashboardSettingTab extends PluginSettingTab {
    plugin: SmartDashboardPlugin;

    constructor(app: App, plugin: SmartDashboardPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Smart Dashboard 卡片管理' });
        containerEl.createEl('p', { text: '启用或禁用看板上的卡片。禁用后卡片将隐藏且功能暂停。' });

        // ===== 主题皮肤 =====
        containerEl.createEl('h3', { text: '主题皮肤' });
        const currentSkin = await this.plugin.getSkin();
        new Setting(containerEl)
            .setName('强调色方案')
            .setDesc('四套预设调色板（灵感：香芋紫/暗棕金/金融终端蓝黑流派），跟随明暗主题自动适配')
            .addDropdown(dd => {
                for (const [key, skin] of Object.entries(SD_SKINS)) {
                    dd.addOption(key, skin.label);
                }
                dd.setValue(currentSkin);
                dd.onChange(async (v) => {
                    await this.plugin.setSkin(v);
                    await this.plugin.refreshView();
                });
            });

        // ===== 卡片可见性 =====
        containerEl.createEl('h3', { text: '卡片开关' });
        const visibility = await this.plugin.getCardVisibility();

        for (const [id, label] of Object.entries(CARD_LABELS)) {
            new Setting(containerEl)
                .setName(label)
                .setDesc(`控制 ${label} 卡片的显示与功能`)
                .addToggle(toggle => toggle
                    .setValue(visibility[id] !== false)
                    .onChange(async (value) => {
                        await this.plugin.setCardVisibility(id, value);
                        // 刷新当前打开的看板视图
                        await this.plugin.refreshView();
                    })
                );
        }

        // ===== 导航入口配置 =====
        containerEl.createEl('h3', { text: '导航入口' });
        containerEl.createEl('p', { text: '修改各入口卡片指向的库内路径（文件夹或 md 文件）。留空恢复默认。' });
        const entries = await this.plugin.getNavEntries();
        for (const entry of entries) {
            new Setting(containerEl)
                .setName(`${entry.icon} ${entry.name}`)
                .setDesc(`当前：${entry.path}`)
                .addText(text => {
                    text.setPlaceholder(entry.path);
                    text.inputEl.style.width = '100%';
                    text.onChange(async (v) => {
                        if (!v.trim() || v.trim() === entry.path) return;
                        const all = await this.plugin.getNavEntries();
                        const target = all.find(x => x.id === entry.id);
                        if (target) {
                            target.path = v.trim();
                            await this.plugin.setNavEntries(all);
                            new Notice(`已更新「${entry.name}」入口路径`);
                        }
                    });
                });
        }
    }
}
