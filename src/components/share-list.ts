import { Dialog, openTab, showMessage } from "siyuan";
import type SharePlugin from "../index";
import type { ShareRecord } from "../types";

export class ShareListDialog {
    private plugin: SharePlugin;
    private dialog!: Dialog;
    private listContainer!: HTMLElement;
    private refreshBtn!: HTMLButtonElement;
    private deleteAllBtn!: HTMLButtonElement;
    private emptyState!: HTMLElement;
    private loadingState!: HTMLElement;
    private countLabel!: HTMLElement;
    private isRefreshing = false;

    constructor(plugin: SharePlugin) {
        this.plugin = plugin;
    }

    async show(): Promise<void> {
        const dialogContent = `
            <div class="b3-dialog__content" style="height: 70vh;">
                <!-- 美化的标题区域 -->
                <div style="padding: 16px 24px; border-bottom: 1px solid var(--b3-border-color); background: var(--b3-theme-surface);">
                    <div class="fn__flex" style="align-items: center; gap: 12px;">
                        <svg style="width: 28px; height: 28px; color: var(--b3-theme-primary);"><use xlink:href="#iconShare"></use></svg>
                        <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: var(--b3-theme-on-background);">
                            ${this.plugin.i18n.shareListTitle || "全部分享"}
                        </h2>
                        <div class="fn__flex-1"></div>
                        <div class="b3-label__text" style="font-size: 13px; color: var(--b3-theme-on-surface-light);" id="shareListCount">-</div>
                    </div>
                </div>

                <div class="fn__flex-column share-list__body" style="height: calc(100% - 73px);">
                    <!-- Loading State -->
                    <div class="share-list__loading" id="shareListLoading" style="display: none; text-align: center; padding: 60px;">
                        <div class="fn__loading" style="width: 48px; height: 48px; margin: 0 auto;"></div>
                        <div class="b3-label__text" style="margin-top: 16px; font-size: 14px;">${this.plugin.i18n.shareListLoading || "加载中..."}</div>
                    </div>

                    <!-- Empty State -->
                    <div class="share-list__empty" id="shareListEmpty" style="display: none; text-align: center; padding: 80px 40px; color: var(--b3-theme-on-surface-light);">
                        <svg style="width: 80px; height: 80px; margin: 0 auto; opacity: 0.25;"><use xlink:href="#iconShare"></use></svg>
                        <div class="b3-label__text" style="margin-top: 24px; font-size: 15px;">${this.plugin.i18n.shareListEmpty || "暂无分享记录"}</div>
                        <div class="b3-label__text" style="margin-top: 8px; font-size: 12px; opacity: 0.7;">分享文档后将在此处显示</div>
                    </div>

                    <!-- List Container -->
                    <div class="share-list__container" id="shareListContainer" style="display: none; overflow-y: auto; flex: 1; padding: 16px;">
                        <!-- Items will be inserted here -->
                    </div>
                </div>
            </div>
            <div class="b3-dialog__action" style="padding: 12px 16px; border-top: 1px solid var(--b3-border-color);">
                <button class="b3-button b3-button--outline" id="shareListRefreshBtn">
                    <svg class="b3-button__icon"><use xlink:href="#iconRefresh"></use></svg>
                    <span class="fn__space"></span>
                    ${this.plugin.i18n.shareListRefresh || "刷新"}
                </button>
                <button class="b3-button b3-button--error" id="shareListDeleteAllBtn" style="margin-left: 8px;">
                    <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                    <span class="fn__space"></span>
                    ${this.plugin.i18n.shareDialogStopAll || "关闭全部分享"}
                </button>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--cancel">${this.plugin.i18n.close || "关闭"}</button>
            </div>
        `;

        this.dialog = new Dialog({
            title: "", // 标题已经在内容中自定义显示
            content: dialogContent,
            width: "900px",
            height: "85vh",
        });

        this.cacheElements();
        this.bindEvents();
        await this.renderList();
    }

    private cacheElements(): void {
        this.listContainer = this.dialog.element.querySelector("#shareListContainer") as HTMLElement;
        this.refreshBtn = this.dialog.element.querySelector("#shareListRefreshBtn") as HTMLButtonElement;
        this.deleteAllBtn = this.dialog.element.querySelector("#shareListDeleteAllBtn") as HTMLButtonElement;
        this.emptyState = this.dialog.element.querySelector("#shareListEmpty") as HTMLElement;
        this.loadingState = this.dialog.element.querySelector("#shareListLoading") as HTMLElement;
        this.countLabel = this.dialog.element.querySelector("#shareListCount") as HTMLElement;
    }

    private bindEvents(): void {
        const cancelBtn = this.dialog.element.querySelector(".b3-button--cancel") as HTMLButtonElement;
        cancelBtn.addEventListener("click", () => {
            this.dialog.destroy();
        });

        this.refreshBtn.addEventListener("click", async () => {
            await this.handleRefresh();
        });

        this.deleteAllBtn.addEventListener("click", async () => {
            await this.handleDeleteAll();
        });
    }

    private async renderList(): Promise<void> {
        const records = this.plugin.shareRecordManager.getRecords();

        // 更新数量显示
        const validCount = records.filter(r => r.expireAt > Date.now()).length;
        const totalCount = records.length;
        this.countLabel.textContent = totalCount > 0 
            ? `共 ${totalCount} 个分享，${validCount} 个有效`
            : "暂无分享";

        if (records.length === 0) {
            this.showEmptyState();
            this.deleteAllBtn.disabled = true;
            return;
        }

        this.showListState();
        this.deleteAllBtn.disabled = false;
        this.listContainer.innerHTML = "";

        // 按创建时间倒序排列
        const sortedRecords = [...records].sort((a, b) => b.createdAt - a.createdAt);

        for (const record of sortedRecords) {
            const item = this.createListItem(record);
            this.listContainer.appendChild(item);
        }
    }

    private createListItem(record: ShareRecord): HTMLElement {
        const isExpired = record.expireAt <= Date.now();
        const isValid = !isExpired;

        const item = document.createElement("div");
        item.className = "b3-list-item b3-list-item--hide-action";
        item.style.cssText = "padding: 16px 20px; margin-bottom: 12px; background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color); border-radius: 8px; transition: all 0.2s ease;";
        
        // 添加悬停效果
        item.addEventListener("mouseenter", () => {
            item.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
            item.style.transform = "translateY(-1px)";
        });
        item.addEventListener("mouseleave", () => {
            item.style.boxShadow = "";
            item.style.transform = "";
        });

        const statusColor = isValid ? "var(--b3-card-success-color)" : "var(--b3-theme-error)";
        const statusBgColor = isValid ? "rgba(82, 196, 26, 0.1)" : "rgba(245, 34, 45, 0.1)";
        const statusText = isValid 
            ? this.plugin.i18n.shareListStatusValid || "有效" 
            : this.plugin.i18n.shareListStatusExpired || "已过期";

        const accessText = this.getAccessLabel(record);
        const createdDate = new Date(record.createdAt).toLocaleString();
        const expireDate = new Date(record.expireAt).toLocaleString();

        item.innerHTML = `
            <div class="fn__flex" style="align-items: flex-start; gap: 16px;">
                <div class="fn__flex-1" style="min-width: 0;">
                    <div class="fn__flex" style="align-items: center; gap: 12px; margin-bottom: 10px;">
                        <div class="b3-list-item__text" style="font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${this.escapeHtml(record.docTitle)}">
                            ${this.escapeHtml(record.docTitle)}
                        </div>
                        <span style="padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 500; background: ${statusBgColor}; color: ${statusColor}; white-space: nowrap; line-height: 1.4;">
                            ${statusText}
                        </span>
                    </div>
                    <div class="fn__flex" style="gap: 20px; flex-wrap: wrap; color: var(--b3-theme-on-surface-light); font-size: 13px; line-height: 1.6;">
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg style="width: 14px; height: 14px; opacity: 0.7;"><use xlink:href="#iconEye"></use></svg>
                            ${record.viewCount || 0} 次访问
                        </span>
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg style="width: 14px; height: 14px; opacity: 0.7;"><use xlink:href="${record.requirePassword ? '#iconLock' : (record.isPublic ? '#iconGlobe' : '#iconLink')}"></use></svg>
                            ${accessText}
                        </span>
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg style="width: 14px; height: 14px; opacity: 0.7;"><use xlink:href="#iconTime"></use></svg>
                            创建于 ${createdDate}
                        </span>
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg style="width: 14px; height: 14px; opacity: 0.7;"><use xlink:href="#iconClock"></use></svg>
                            到期于 ${expireDate}
                        </span>
                    </div>
                </div>
                <div class="fn__flex" style="gap: 6px; flex-shrink: 0;">
                    <button class="b3-button b3-button--outline share-list__action-btn" data-action="open" data-doc-id="${record.docId}" title="${this.plugin.i18n.shareListOpenDoc || "打开文档"}">
                        <svg style="width: 14px; height: 14px;"><use xlink:href="#iconFile"></use></svg>
                    </button>
                    <button class="b3-button b3-button--outline share-list__action-btn" data-action="copy" data-url="${this.escapeHtml(record.shareUrl)}" title="${this.plugin.i18n.copyLink || "复制链接"}">
                        <svg style="width: 14px; height: 14px;"><use xlink:href="#iconCopy"></use></svg>
                    </button>
                    <button class="b3-button b3-button--outline share-list__action-btn share-list__action-btn--delete" data-action="delete" data-id="${record.id}" title="${this.plugin.i18n.shareListDelete || "删除"}">
                        <svg style="width: 14px; height: 14px;"><use xlink:href="#iconTrashcan"></use></svg>
                    </button>
                </div>
            </div>
        `;

        // 绑定操作按钮事件
        const openBtn = item.querySelector('[data-action="open"]') as HTMLButtonElement;
        const copyBtn = item.querySelector('[data-action="copy"]') as HTMLButtonElement;
        const deleteBtn = item.querySelector('[data-action="delete"]') as HTMLButtonElement;

        openBtn.addEventListener("click", async () => {
            await this.handleOpenDoc(record.docId);
        });

        copyBtn.addEventListener("click", () => {
            this.handleCopyLink(record.shareUrl);
        });

        deleteBtn.addEventListener("click", async () => {
            await this.handleDelete(record.id);
        });

        return item;
    }

    private async handleOpenDoc(docId: string): Promise<void> {
        try {
            // 先检查文档是否存在
            const exists = await this.checkDocExists(docId);
            if (!exists) {
                const confirmClean = window.confirm(
                    this.plugin.i18n.shareListDocNotFound || "文档不存在，是否删除此分享记录？"
                );
                if (confirmClean) {
                    const record = this.plugin.shareRecordManager.getRecordByDocId(docId);
                    if (record) {
                        await this.handleDelete(record.id);
                    }
                }
                return;
            }

            // 打开文档
            openTab({
                app: this.plugin.app,
                doc: {
                    id: docId,
                    action: ["cb-get-focus"],
                },
                keepCursor: false,
                removeCurrentTab: false,
            });

            showMessage(this.plugin.i18n.shareListDocOpened || "已打开文档", 2000, "info");
        } catch (error: any) {
            showMessage(
                error?.message || this.plugin.i18n.shareListOpenDocError || "打开文档失败", 
                3000, 
                "error"
            );
        }
    }

    private async checkDocExists(docId: string): Promise<boolean> {
        try {
            const config = this.plugin.settings.getConfig();
            const response = await fetch("/api/attr/getBlockAttrs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Token ${config.siyuanToken}`,
                },
                body: JSON.stringify({ id: docId }),
            });

            if (!response.ok) {
                return false;
            }

            const result = await response.json();
            return result.code === 0 && result.data;
        } catch {
            return false;
        }
    }

    private handleCopyLink(url: string): void {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                showMessage(this.plugin.i18n.copySuccess || "已复制到剪贴板", 2000, "info");
            }).catch(() => {
                this.copyFallback(url);
            });
        } else {
            this.copyFallback(url);
        }
    }

    private copyFallback(text: string): void {
        const tempInput = document.createElement("input");
        tempInput.value = text;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showMessage(this.plugin.i18n.copySuccess || "已复制到剪贴板", 2000, "info");
    }

    private async handleDelete(shareId: string): Promise<void> {
        const confirmText = this.plugin.i18n.shareListDeleteConfirm || "确定要删除此分享吗？";
        if (!window.confirm(confirmText)) {
            return;
        }

        try {
            await this.plugin.shareService.deleteShare(shareId);
            showMessage(this.plugin.i18n.shareListDeleteSuccess || "删除成功", 2000, "info");
            await this.renderList();
        } catch (error: any) {
            showMessage(
                error?.message || this.plugin.i18n.shareListDeleteError || "删除失败", 
                3000, 
                "error"
            );
        }
    }

    private async handleRefresh(): Promise<void> {
        if (this.isRefreshing) {
            return;
        }

        this.isRefreshing = true;
        this.refreshBtn.disabled = true;
        this.showLoadingState();

        try {
            // 调用同步方法从后端获取最新数据
            await this.plugin.shareRecordManager.syncFromBackend();
            showMessage(this.plugin.i18n.shareListRefreshSuccess || "刷新成功", 2000, "info");
            await this.renderList();
        } catch (error: any) {
            showMessage(
                error?.message || this.plugin.i18n.shareListRefreshError || "刷新失败", 
                3000, 
                "error"
            );
            // 即使失败也显示本地缓存
            await this.renderList();
        } finally {
            this.isRefreshing = false;
            this.refreshBtn.disabled = false;
        }
    }

    private showLoadingState(): void {
        this.loadingState.style.display = "";
        this.emptyState.style.display = "none";
        this.listContainer.style.display = "none";
    }

    private showEmptyState(): void {
        this.loadingState.style.display = "none";
        this.emptyState.style.display = "";
        this.listContainer.style.display = "none";
    }

    private showListState(): void {
        this.loadingState.style.display = "none";
        this.emptyState.style.display = "none";
        this.listContainer.style.display = "";
    }

    private getAccessLabel(record: ShareRecord): string {
        if (record.requirePassword) {
            return this.plugin.i18n.shareDialogAccessPassword || "密码保护";
        }
        return record.isPublic
            ? this.plugin.i18n.shareDialogAccessPublic || "公开访问"
            : this.plugin.i18n.shareDialogAccessPrivate || "仅持有链接";
    }

    private async handleDeleteAll(): Promise<void> {
        const records = this.plugin.shareRecordManager.getRecords();
        if (records.length === 0) {
            return;
        }

        const confirmText = this.plugin.i18n.shareDialogStopAllConfirm || "确定要关闭全部分享吗？";
        if (!window.confirm(confirmText)) {
            return;
        }

        this.deleteAllBtn.disabled = true;
        this.showLoadingState();

        try {
            // 调用批量删除 API（不传 shareIds 表示删除全部）
            const result = await this.plugin.shareService.deleteShares();
            
            const deleted = result.deleted ?? [];
            const failed = result.failed ?? {};
            const failedCount = Object.keys(failed).length;
            
            if (failedCount > 0) {
                showMessage(
                    this.plugin.i18n.shareDialogStopAllPartialFail || "部分分享未能关闭，请稍后重试。",
                    4000,
                    "error"
                );
            } else {
                showMessage(
                    this.plugin.i18n.shareDialogStopAllSuccess || "已关闭全部分享",
                    2000,
                    "info"
                );
            }
            
            await this.renderList();
        } catch (error: any) {
            showMessage(
                error?.message || this.plugin.i18n.shareDialogStopAllFail || "关闭全部分享失败",
                3000,
                "error"
            );
            await this.renderList();
        } finally {
            this.deleteAllBtn.disabled = false;
        }
    }

    private escapeHtml(input: string): string {
        return input.replace(/[&<>'"]/g, (match) => {
            switch (match) {
                case "&":
                    return "&amp;";
                case "<":
                    return "&lt;";
                case ">":
                    return "&gt;";
                case "'":
                    return "&#39;";
                case '"':
                    return "&quot;";
                default:
                    return match;
            }
        });
    }
}
