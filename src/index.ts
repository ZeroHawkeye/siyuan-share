import {
    getAllEditor,
    getFrontend,
    openSetting,
    Plugin,
    showMessage
} from "siyuan";
import { ShareDialog } from "./components/share-dialog";
import "./index.scss";
import { AssetRecordManager } from "./services/asset-record";
import { PasteUploadService } from "./services/paste-upload";
import { ShareRecordManager } from "./services/share-record";
import { ShareService } from "./services/share-service";
import { ShareSettings } from "./settings";
import { PluginLogger } from "./utils/logger";

export default class SharePlugin extends Plugin {

    private isMobile: boolean;
    public settings: ShareSettings;
    public shareService: ShareService;
    public shareRecordManager: ShareRecordManager;
    public assetRecordManager: AssetRecordManager;
    public pasteUploadService: PasteUploadService;
    private logger?: PluginLogger;
    private lastActiveRootId?: string;
    // 文档标题缓存（带过期）
    private docTitleCache = new Map<string, { title: string; expires: number }>();
    private docTitlePromiseCache = new Map<string, Promise<string>>();
    private readonly DOC_TITLE_TTL = 5 * 60 * 1000; // 5 分钟

    // 事件处理器引用，便于卸载时移除监听避免泄漏
    private handleSwitchProtyle?: (evt: any) => void;
    private handleLoadedProtyleStatic?: (evt: any) => void;
    private handleLoadedProtyleDynamic?: (evt: any) => void;
    private handleOpenMenuDocTree?: (evt: any) => void;



    async onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        
        // 添加分享图标
        this.addIcons(`<symbol id="iconShare" viewBox="0 0 32 32">
<path d="M24 20c-1.607 0-3.04 0.78-3.947 1.973l-7.167-3.593c0.18-0.56 0.28-1.16 0.28-1.78 0-0.62-0.1-1.22-0.28-1.78l7.167-3.593c0.907 1.193 2.34 1.973 3.947 1.973 2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5c0 0.62 0.1 1.22 0.28 1.78l-7.167 3.593c-0.907-1.193-2.34-1.973-3.947-1.973-2.76 0-5 2.24-5 5s2.24 5 5 5c1.607 0 3.04-0.78 3.947-1.973l7.167 3.593c-0.18 0.56-0.28 1.16-0.28 1.78 0 2.76 2.24 5 5 5s5-2.24 5-5-2.24-5-5-5z"></path>
</symbol>`);

        // 初始化设置与服务
        this.settings = new ShareSettings(this);
        await this.settings.load();
        // 初始化日志
        this.logger = new PluginLogger(this);
        await this.logger.load();
        this.logger.install();
        this.shareRecordManager = new ShareRecordManager(this);
        await this.shareRecordManager.load();
        this.assetRecordManager = new AssetRecordManager(this);
        await this.assetRecordManager.load();
        this.shareService = new ShareService(this);
        this.pasteUploadService = new PasteUploadService(this);

        // 根据配置决定是否启用粘贴上传
        const config = this.settings.getConfig();
        if (config.s3.enabled && config.s3.enablePasteUpload) {
            this.pasteUploadService.enable();
        }

        // 设置面板
        this.setting = this.settings.createSettingPanel();

        // 尝试从当前活动窗口初始化最近激活的文档 ID
        this.initLastActiveFromDOM();

        // 监听编辑器切换，记录最近激活的文档 ID
        this.handleSwitchProtyle = (evt: any) => {
            try {
                const rid = evt?.detail?.protyle?.block?.rootID;
                if (typeof rid === 'string' && rid) {
                    this.lastActiveRootId = rid;
                }
            } catch (_) { /* ignore */ }
        };
        this.eventBus.on("switch-protyle", this.handleSwitchProtyle);

        // 监听编辑器加载事件，尽量保持 lastActiveRootId 为活动窗口中的编辑器
        const updateOnLoad = (evt: any) => {
            try {
                const protyleEl = evt?.detail?.protyle?.element as HTMLElement | undefined;
                const rid = evt?.detail?.protyle?.block?.rootID as string | undefined;
                if (protyleEl && rid) {
                    const activeWnd = document.querySelector('.layout__wnd--active') as HTMLElement | null;
                    if (activeWnd && activeWnd.contains(protyleEl)) {
                        this.lastActiveRootId = rid;
                    }
                }
            } catch (_) { /* ignore */ }
        };
        this.handleLoadedProtyleStatic = updateOnLoad;
        this.handleLoadedProtyleDynamic = updateOnLoad;
        this.eventBus.on("loaded-protyle-static", this.handleLoadedProtyleStatic);
        this.eventBus.on("loaded-protyle-dynamic", this.handleLoadedProtyleDynamic);

        // 监听文档树菜单添加分享入口
        this.handleOpenMenuDocTree = (evt: any) => {
            const { detail } = evt;
            if (!detail || !detail.menu || !detail.doc) return;
            const docId = detail.doc.id;
            const docTitle = detail.doc.title || detail.doc.name || "Untitled";
            detail.menu.addSeparator();
            detail.menu.addItem({
                icon: "iconShare",
                label: this.i18n.shareMenuShareDoc || "Share Document",
                click: async () => {
                    if (!this.settings.isConfigured()) {
                        showMessage(this.i18n.shareErrorNotConfigured, 4000, "error");
                        openSetting(this.app);
                        return;
                    }
                    const realTitle = await this.getDocTitle(docId);
                    const dialog = new ShareDialog(this, docId, realTitle || docTitle);
                    dialog.show();
                }
            });
        };
        this.eventBus.on("open-menu-doctree", this.handleOpenMenuDocTree);

        // 暴露全局引用以便在独立模块中访问配置/Token（例如 forwardProxy 兜底上传）
        try { (window as any).sharePlugin = this; } catch (_) { /* ignore */ }
    }

    onLayoutReady() {
        // 顶栏分享按钮
        const shareTopBar = this.addTopBar({
            icon: "iconShare",
            title: this.i18n.shareTopBarTitle || "Share",
            position: "right",
            callback: async () => {
                const editor = this.getEditor();
                if (!editor) return;
                const docId = editor.protyle.block.rootID;
                
                if (!this.settings.isConfigured()) {
                    showMessage(this.i18n.shareErrorNotConfigured, 4000, "error");
                    openSetting(this.app);
                    return;
                }

                // 获取真实的文档标题
                const docTitle = await this.getDocTitle(docId);
                const d = new ShareDialog(this, docId, docTitle);
                d.show();
            }
        });
    }

    onunload() {
        console.log(this.i18n.byePlugin);
        try { if ((window as any).sharePlugin === this) (window as any).sharePlugin = undefined; } catch (_) { /* ignore */ }
        if (this.shareRecordManager) {
            this.shareRecordManager.stopAutoSync();
        }
        if (this.logger) {
            this.logger.uninstall();
        }
        // 禁用粘贴上传
        if (this.pasteUploadService) {
            this.pasteUploadService.disable();
        }
        // 移除事件监听
        if (this.handleSwitchProtyle) this.eventBus.off("switch-protyle", this.handleSwitchProtyle);
        if (this.handleLoadedProtyleStatic) this.eventBus.off("loaded-protyle-static", this.handleLoadedProtyleStatic);
        if (this.handleLoadedProtyleDynamic) this.eventBus.off("loaded-protyle-dynamic", this.handleLoadedProtyleDynamic);
        if (this.handleOpenMenuDocTree) this.eventBus.off("open-menu-doctree", this.handleOpenMenuDocTree);
    }

    uninstall() {
        console.log("uninstall");
    }

    /**
     * 显示消息提示
     */
    showMessage(msg: string, timeout: number = 3000, type: "info" | "error" = "info") {
        showMessage(msg, timeout, type);
    }

    /** 导出日志文本 */
    public getLogsText(): string {
        try { return this.logger?.toText() || ""; } catch { return ""; }
    }

    /** 清空日志 */
    public clearLogs(): void {
        try { this.logger?.clear(); } catch { /* ignore */ }
    }

    private getEditor() {
        const editors = getAllEditor();
        if (editors.length === 0) {
            showMessage("please open doc first");
            return;
        }

        // 0) 首选使用最近激活的 rootID（点击顶栏按钮会丢失焦点/选区时更可靠）
        if (this.lastActiveRootId) {
            const byLast = editors.find((e: any) => e?.protyle?.block?.rootID === this.lastActiveRootId);
            if (byLast) return byLast;
        }

        // 1) 根据当前焦点元素定位所在的编辑器
        const activeEl = (document.activeElement as HTMLElement | null);
        if (activeEl) {
            const foundByActive = editors.find((e: any) => e?.protyle?.element && (e.protyle.element as HTMLElement).contains(activeEl));
            if (foundByActive) return foundByActive;
        }

        // 2) 尝试根据当前选区定位所在的编辑器
        const sel = window.getSelection && window.getSelection();
        const anchorNode = sel && sel.anchorNode as Node | null;
        if (anchorNode) {
            const anchorEl = (anchorNode instanceof Element ? anchorNode : anchorNode.parentElement) as HTMLElement | null;
            if (anchorEl) {
                const protyleRoot = anchorEl.closest?.('.protyle') as HTMLElement | null;
                if (protyleRoot) {
                    const foundBySelection = editors.find((e: any) => e?.protyle?.element === protyleRoot || (e?.protyle?.element as HTMLElement)?.contains(protyleRoot));
                    if (foundBySelection) return foundBySelection;
                }
            }
        }

        // 2.5) 活动窗口内的编辑器（Siyuan 活动窗口类名）
        const activeWnd = document.querySelector('.layout__wnd--active') as HTMLElement | null;
        if (activeWnd) {
            const foundInActiveWnd = editors.find((e: any) => activeWnd.contains(e?.protyle?.element as HTMLElement));
            if (foundInActiveWnd) return foundInActiveWnd;
        }

        // 3) 回退：寻找具有“聚焦”样式的编辑器（类名可能随版本变化）
        const focusClassCandidates = [
            'protyle--focus',
            'protyle-focus',
        ];
        const foundByClass = editors.find((e: any) => {
            const el = e?.protyle?.element as HTMLElement | null;
            return !!(el && focusClassCandidates.some(c => el.classList?.contains(c)));
        });
        if (foundByClass) return foundByClass;

        // 4) 最终回退：返回第一个编辑器
        return editors[0];
    }

    /**
     * 从当前 DOM 推断活动窗口的编辑器，初始化 lastActiveRootId
     */
    private initLastActiveFromDOM() {
        try {
            const editors = getAllEditor();
            if (!editors.length) return;

            const activeWnd = document.querySelector('.layout__wnd--active') as HTMLElement | null;
            if (activeWnd) {
                const foundInActiveWnd = editors.find((e: any) => activeWnd.contains(e?.protyle?.element as HTMLElement));
                if (foundInActiveWnd?.protyle?.block?.rootID) {
                    this.lastActiveRootId = foundInActiveWnd.protyle.block.rootID;
                    return;
                }
            }

            const focusClassCandidates = ['protyle--focus','protyle-focus'];
            const foundByClass = editors.find((e: any) => {
                const el = e?.protyle?.element as HTMLElement | null;
                return !!(el && focusClassCandidates.some(c => el.classList?.contains(c)));
            });
            if (foundByClass?.protyle?.block?.rootID) {
                this.lastActiveRootId = foundByClass.protyle.block.rootID;
                return;
            }

            // 兜底：若只有一个编辑器，使用它
            if (editors.length === 1 && editors[0]?.protyle?.block?.rootID) {
                this.lastActiveRootId = editors[0].protyle.block.rootID;
            }
        } catch (_) {
            // ignore
        }
    }

    /**
     * 获取文档标题
     */
    private async getDocTitle(docId: string): Promise<string> {
        // 1. 内存缓存命中
        const cached = this.docTitleCache.get(docId);
        if (cached && cached.expires > Date.now()) {
            return cached.title;
        }

        // 2. 并发去重：已有进行中的请求直接复用
        const inflight = this.docTitlePromiseCache.get(docId);
        if (inflight) return inflight;

        const p = (async () => {
            let title: string | undefined;
            // 主请求：attr API
            try {
                const config = this.settings.getConfig();
                const response = await fetch("/api/attr/getBlockAttrs", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Token ${config.siyuanToken}`,
                    },
                    body: JSON.stringify({ id: docId }),
                });
                if (response.ok) {
                    const result = await response.json();
                    if (result.code === 0 && result.data) {
                        title = result.data.title || result.data.name;
                    }
                }
            } catch (e) { /* ignore */ }

            // 失败降级：SQL 查询
            if (!title) {
                try {
                    const config = this.settings.getConfig();
                    const response = await fetch("/api/query/sql", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Token ${config.siyuanToken}`,
                        },
                        body: JSON.stringify({ stmt: `SELECT content FROM blocks WHERE id = '${docId}' AND type = 'd' LIMIT 1` }),
                    });
                    if (response.ok) {
                        const result = await response.json();
                        if (result.code === 0 && result.data && result.data.length > 0) {
                            title = result.data[0].content;
                        }
                    }
                } catch (e) { /* ignore */ }
            }

            const finalTitle = title || docId;
            this.docTitleCache.set(docId, { title: finalTitle, expires: Date.now() + this.DOC_TITLE_TTL });
            this.docTitlePromiseCache.delete(docId);
            return finalTitle;
        })();

        this.docTitlePromiseCache.set(docId, p);
        return p;
    }
}
