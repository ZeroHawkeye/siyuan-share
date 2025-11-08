import { Dialog, showMessage } from "siyuan";
import type SharePlugin from "../index";
import type { AssetUploadRecord, DocAssetMapping } from "../types";

export class AssetListView {
    private plugin: SharePlugin;
    private dialog!: Dialog;
    private listContainer!: HTMLElement;
    private refreshBtn!: HTMLButtonElement;
    private emptyState!: HTMLElement;
    private loadingState!: HTMLElement;
    private countLabel!: HTMLElement;
    private filterInput!: HTMLInputElement;
    private filterDocSelect!: HTMLSelectElement;
    private deleteFilteredBtn!: HTMLButtonElement;
    private isRefreshing = false;
    private currentFilter = "";
    private currentDocFilter = "";

    constructor(plugin: SharePlugin) {
        this.plugin = plugin;
    }

    async show(): Promise<void> {
        const dialogContent = `
            <div class="b3-dialog__content" style="height: 75vh;">
                <!-- 标题区域 -->
                <div style="padding: 16px 24px; border-bottom: 1px solid var(--b3-border-color); background: var(--b3-theme-surface);">
                    <div class="fn__flex" style="align-items: center; gap: 12px;">
                        <svg style="width: 28px; height: 28px; color: var(--b3-theme-primary);"><use xlink:href="#iconImage"></use></svg>
                        <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: var(--b3-theme-on-background);">
                            ${this.plugin.i18n.assetListTitle || "静态资源管理"}
                        </h2>
                        <div class="fn__flex-1"></div>
                        <div class="b3-label__text" style="font-size: 13px; color: var(--b3-theme-on-surface-light);" id="assetListCount">-</div>
                    </div>

                    <!-- 筛选区域 -->
                    <div class="fn__flex" style="margin-top: 16px; gap: 12px; align-items: center;">
                        <div class="fn__flex-1">
                            <input 
                                id="assetListFilter" 
                                class="b3-text-field" 
                                placeholder="${this.plugin.i18n.assetListFilterPlaceholder || "搜索文件名..."}"
                                style="width: 100%;"
                            />
                        </div>
                        <select 
                            id="assetListDocFilter" 
                            class="b3-select" 
                            style="min-width: 200px;"
                        >
                            <option value="">${this.plugin.i18n.assetListFilterAllDocs || "全部文档"}</option>
                        </select>
                        <button class="b3-button b3-button--outline" id="assetListClearFilter">
                            <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                            ${this.plugin.i18n.assetListClearFilter || "清除筛选"}
                        </button>
                        <button class="b3-button b3-button--error" id="assetListDeleteFiltered" style="display: none;">
                            <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                            ${this.plugin.i18n.assetListDeleteFiltered || "删除筛选结果"}
                        </button>
                    </div>
                </div>

                <div class="fn__flex-column asset-list__body" style="height: calc(100% - 120px);">
                    <!-- Loading State -->
                    <div class="asset-list__loading" id="assetListLoading" style="display: none; text-align: center; padding: 60px;">
                        <div class="fn__loading" style="width: 48px; height: 48px; margin: 0 auto;"></div>
                        <div class="b3-label__text" style="margin-top: 16px; font-size: 14px;">${this.plugin.i18n.assetListLoading || "加载中..."}</div>
                    </div>

                    <!-- Empty State -->
                    <div class="asset-list__empty" id="assetListEmpty" style="display: none; text-align: center; padding: 80px 40px; color: var(--b3-theme-on-surface-light);">
                        <svg style="width: 80px; height: 80px; margin: 0 auto; opacity: 0.25;"><use xlink:href="#iconImage"></use></svg>
                        <div class="b3-label__text" style="margin-top: 24px; font-size: 15px;">${this.plugin.i18n.assetListEmpty || "暂无资源记录"}</div>
                        <div class="b3-label__text" style="margin-top: 8px; font-size: 12px; opacity: 0.7;">启用 S3 并分享文档后将在此处显示</div>
                    </div>

                    <!-- List Container -->
                    <div class="asset-list__container" id="assetListContainer" style="display: none; overflow-y: auto; flex: 1; padding: 16px;">
                        <!-- Items will be inserted here -->
                    </div>
                </div>
            </div>
            <div class="b3-dialog__action" style="padding: 12px 16px; border-top: 1px solid var(--b3-border-color);">
                <button class="b3-button b3-button--outline" id="assetListRefreshBtn">
                    <svg class="b3-button__icon"><use xlink:href="#iconRefresh"></use></svg>
                    <span class="fn__space"></span>
                    ${this.plugin.i18n.assetListRefresh || "刷新"}
                </button>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--cancel">${this.plugin.i18n.close || "关闭"}</button>
            </div>
        `;

        this.dialog = new Dialog({
            title: "",
            content: dialogContent,
            width: "1000px",
            height: "85vh",
        });

        this.cacheElements();
        await this.populateDocFilter();
        this.bindEvents();
        await this.renderList();
    }

    private cacheElements(): void {
        this.listContainer = this.dialog.element.querySelector("#assetListContainer") as HTMLElement;
        this.refreshBtn = this.dialog.element.querySelector("#assetListRefreshBtn") as HTMLButtonElement;
        this.emptyState = this.dialog.element.querySelector("#assetListEmpty") as HTMLElement;
        this.loadingState = this.dialog.element.querySelector("#assetListLoading") as HTMLElement;
        this.countLabel = this.dialog.element.querySelector("#assetListCount") as HTMLElement;
        this.filterInput = this.dialog.element.querySelector("#assetListFilter") as HTMLInputElement;
        this.filterDocSelect = this.dialog.element.querySelector("#assetListDocFilter") as HTMLSelectElement;
        this.deleteFilteredBtn = this.dialog.element.querySelector("#assetListDeleteFiltered") as HTMLButtonElement;
    }

    private async populateDocFilter(): Promise<void> {
        const mappings = this.plugin.assetRecordManager.getAllMappings();
        const uniqueDocs = new Map<string, string>();

        // 获取文档标题
        for (const mapping of mappings) {
            if (!uniqueDocs.has(mapping.docId)) {
                // 尝试从分享记录中获取标题
                const shareRecord = this.plugin.shareRecordManager.getRecordByDocId(mapping.docId);
                const title = shareRecord?.docTitle || mapping.docId;
                uniqueDocs.set(mapping.docId, title);
            }
        }

        // 填充下拉框
        const sortedDocs = Array.from(uniqueDocs.entries()).sort((a, b) => a[1].localeCompare(b[1]));
        for (const [docId, title] of sortedDocs) {
            const option = document.createElement("option");
            option.value = docId;
            option.textContent = title;
            this.filterDocSelect.appendChild(option);
        }
    }

    private bindEvents(): void {
        const cancelBtn = this.dialog.element.querySelector(".b3-button--cancel") as HTMLButtonElement;
        cancelBtn.addEventListener("click", () => {
            this.dialog.destroy();
        });

        this.refreshBtn.addEventListener("click", async () => {
            await this.handleRefresh();
        });

        // 筛选输入
        this.filterInput.addEventListener("input", () => {
            this.currentFilter = this.filterInput.value.trim().toLowerCase();
            this.renderList();
        });

        // 文档筛选
        this.filterDocSelect.addEventListener("change", () => {
            this.currentDocFilter = this.filterDocSelect.value;
            this.renderList();
        });

        // 清除筛选
        const clearFilterBtn = this.dialog.element.querySelector("#assetListClearFilter") as HTMLButtonElement;
        clearFilterBtn.addEventListener("click", () => {
            this.filterInput.value = "";
            this.filterDocSelect.value = "";
            this.currentFilter = "";
            this.currentDocFilter = "";
            this.renderList();
        });

        // 删除筛选结果
        this.deleteFilteredBtn.addEventListener("click", async () => {
            await this.handleDeleteFiltered();
        });
    }

    private async renderList(): Promise<void> {
        const allMappings = this.plugin.assetRecordManager.getAllMappings();
        
        // 应用筛选
        let filteredMappings = allMappings;
        if (this.currentDocFilter) {
            filteredMappings = filteredMappings.filter(m => m.docId === this.currentDocFilter);
        }

        // 收集所有资源并应用文件名筛选
        const allAssets: Array<{ mapping: DocAssetMapping; asset: AssetUploadRecord }> = [];
        for (const mapping of filteredMappings) {
            for (const asset of mapping.assets) {
                if (!this.currentFilter || this.matchesFilter(asset)) {
                    allAssets.push({ mapping, asset });
                }
            }
        }

        // 更新计数
        const totalSize = allAssets.reduce((sum, item) => sum + item.asset.size, 0);
        this.countLabel.textContent = `共 ${allAssets.length} 个资源，总大小 ${this.formatSize(totalSize)}`;

        // 显示或隐藏批量删除按钮 - 只要有资源就显示
        if (allAssets.length > 0) {
            this.deleteFilteredBtn.style.display = "";
            // 根据筛选状态更新按钮文本
            if (this.currentFilter || this.currentDocFilter) {
                this.deleteFilteredBtn.innerHTML = `
                    <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                    ${this.plugin.i18n.assetListDeleteFiltered || "删除筛选结果"}
                `;
            } else {
                this.deleteFilteredBtn.innerHTML = `
                    <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                    ${this.plugin.i18n.assetListDeleteAll || "删除全部资源"}
                `;
            }
        } else {
            this.deleteFilteredBtn.style.display = "none";
        }

        if (allAssets.length === 0) {
            this.showEmptyState();
            return;
        }

        this.showListState();
        this.listContainer.innerHTML = "";

        // 按上传时间倒序排列
        const sortedAssets = allAssets.sort((a, b) => b.asset.uploadedAt - a.asset.uploadedAt);

        for (const { mapping, asset } of sortedAssets) {
            const item = this.createListItem(mapping, asset);
            this.listContainer.appendChild(item);
        }
    }

    private matchesFilter(asset: AssetUploadRecord): boolean {
        const fileName = this.getFileNameFromPath(asset.localPath).toLowerCase();
        return fileName.includes(this.currentFilter);
    }

    private createListItem(mapping: DocAssetMapping, asset: AssetUploadRecord): HTMLElement {
        const fileName = this.getFileNameFromPath(asset.localPath);
        const uploadDate = new Date(asset.uploadedAt).toLocaleString();
        const shareRecord = this.plugin.shareRecordManager.getRecordByDocId(mapping.docId);
        const docTitle = shareRecord?.docTitle || mapping.docId;
        
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

        const fileIcon = this.getFileIcon(asset.contentType);
        const isImage = asset.contentType.startsWith("image/");

        item.innerHTML = `
            <div class="fn__flex" style="align-items: flex-start; gap: 16px;">
                ${isImage ? this.createImagePreview(asset.s3Url) : this.createFileIcon(fileIcon)}
                
                <div class="fn__flex-1" style="min-width: 0;">
                    <div class="fn__flex" style="align-items: center; gap: 12px; margin-bottom: 10px;">
                        <div class="b3-list-item__text" style="font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${this.escapeHtml(fileName)}">
                            ${this.escapeHtml(fileName)}
                        </div>
                        <span style="padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; background: rgba(24, 144, 255, 0.1); color: var(--b3-theme-primary); white-space: nowrap;">
                            ${this.formatSize(asset.size)}
                        </span>
                    </div>
                    <div class="fn__flex" style="gap: 20px; flex-wrap: wrap; color: var(--b3-theme-on-surface-light); font-size: 13px; line-height: 1.6;">
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg style="width: 14px; height: 14px; opacity: 0.7;"><use xlink:href="#iconFile"></use></svg>
                            ${this.escapeHtml(docTitle)}
                        </span>
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg style="width: 14px; height: 14px; opacity: 0.7;"><use xlink:href="#iconTime"></use></svg>
                            ${uploadDate}
                        </span>
                        <span style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(asset.s3Key)}">
                            <svg style="width: 14px; height: 14px; opacity: 0.7;"><use xlink:href="#iconCloud"></use></svg>
                            ${this.escapeHtml(asset.s3Key)}
                        </span>
                    </div>
                </div>
                <div class="fn__flex" style="gap: 8px; flex-shrink: 0;">
                    <button class="b3-button b3-button--outline" data-action="preview" data-url="${this.escapeHtml(asset.s3Url)}" data-type="${asset.contentType}" title="${this.plugin.i18n.assetListPreview || "预览"}" style="padding: 6px 12px;">
                        <svg class="b3-button__icon"><use xlink:href="#iconEye"></use></svg>
                    </button>
                    <button class="b3-button b3-button--outline" data-action="copy" data-url="${this.escapeHtml(asset.s3Url)}" title="${this.plugin.i18n.copyLink || "复制链接"}" style="padding: 6px 12px;">
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                    </button>
                    <button class="b3-button b3-button--outline" data-action="open" data-url="${this.escapeHtml(asset.s3Url)}" title="${this.plugin.i18n.assetListOpenInBrowser || "在浏览器打开"}" style="padding: 6px 12px;">
                        <svg class="b3-button__icon"><use xlink:href="#iconLink"></use></svg>
                    </button>
                    <button class="b3-button b3-button--error" data-action="delete" data-s3key="${this.escapeHtml(asset.s3Key)}" data-docid="${this.escapeHtml(mapping.docId)}" title="${this.plugin.i18n.assetListDelete || "删除"}" style="padding: 6px 12px;">
                        <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                    </button>
                </div>
            </div>
        `;

        // 绑定操作按钮事件
        const previewBtn = item.querySelector('[data-action="preview"]') as HTMLButtonElement;
        const copyBtn = item.querySelector('[data-action="copy"]') as HTMLButtonElement;
        const openBtn = item.querySelector('[data-action="open"]') as HTMLButtonElement;
        const deleteBtn = item.querySelector('[data-action="delete"]') as HTMLButtonElement;

        previewBtn.addEventListener("click", () => {
            this.handlePreview(asset.s3Url, asset.contentType);
        });

        copyBtn.addEventListener("click", () => {
            this.handleCopyLink(asset.s3Url);
        });

        openBtn.addEventListener("click", () => {
            this.handleOpenInBrowser(asset.s3Url);
        });

        deleteBtn.addEventListener("click", async () => {
            await this.handleDeleteAsset(mapping.docId, asset);
        });

        return item;
    }

    private createImagePreview(url: string): string {
        return `
            <div style="width: 80px; height: 80px; flex-shrink: 0; border-radius: 6px; overflow: hidden; background: var(--b3-theme-background-light);">
                <img src="${this.escapeHtml(url)}" 
                     style="width: 100%; height: 100%; object-fit: cover;" 
                     loading="lazy"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                />
                <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; color: var(--b3-theme-on-surface-light);">
                    <svg style="width: 32px; height: 32px; opacity: 0.5;"><use xlink:href="#iconImage"></use></svg>
                </div>
            </div>
        `;
    }

    private createFileIcon(iconName: string): string {
        return `
            <div style="width: 80px; height: 80px; flex-shrink: 0; border-radius: 6px; background: var(--b3-theme-background-light); display: flex; align-items: center; justify-content: center;">
                <svg style="width: 40px; height: 40px; color: var(--b3-theme-on-surface-light); opacity: 0.6;">
                    <use xlink:href="#${iconName}"></use>
                </svg>
            </div>
        `;
    }

    private getFileIcon(contentType: string): string {
        if (contentType.startsWith("image/")) return "iconImage";
        if (contentType.startsWith("video/")) return "iconVideo";
        if (contentType.startsWith("audio/")) return "iconRecord";
        if (contentType.includes("pdf")) return "iconPDF";
        if (contentType.includes("zip") || contentType.includes("tar") || contentType.includes("gzip")) return "iconZip";
        if (contentType.includes("text/")) return "iconFile";
        return "iconFile";
    }

    private handlePreview(url: string, contentType: string): void {
        if (contentType.startsWith("image/")) {
            // 创建图片预览对话框
            const previewDialog = new Dialog({
                title: this.plugin.i18n.assetListPreview || "预览",
                content: `
                    <div style="text-align: center; padding: 20px;">
                        <img src="${this.escapeHtml(url)}" style="max-width: 100%; max-height: 70vh; border-radius: 4px;" />
                    </div>
                `,
                width: "auto",
                height: "auto",
            });
        } else if (contentType.startsWith("video/")) {
            const previewDialog = new Dialog({
                title: this.plugin.i18n.assetListPreview || "预览",
                content: `
                    <div style="text-align: center; padding: 20px;">
                        <video controls style="max-width: 100%; max-height: 70vh;">
                            <source src="${this.escapeHtml(url)}" type="${contentType}">
                        </video>
                    </div>
                `,
                width: "auto",
                height: "auto",
            });
        } else if (contentType.startsWith("audio/")) {
            const previewDialog = new Dialog({
                title: this.plugin.i18n.assetListPreview || "预览",
                content: `
                    <div style="text-align: center; padding: 20px;">
                        <audio controls style="width: 100%;">
                            <source src="${this.escapeHtml(url)}" type="${contentType}">
                        </audio>
                    </div>
                `,
                width: "500px",
            });
        } else {
            // 不支持预览的文件类型，直接在浏览器打开
            this.handleOpenInBrowser(url);
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

    private handleOpenInBrowser(url: string): void {
        window.open(url, "_blank");
    }

    private async handleRefresh(): Promise<void> {
        if (this.isRefreshing) {
            return;
        }

        this.isRefreshing = true;
        this.refreshBtn.disabled = true;
        this.showLoadingState();

        try {
            // 重新加载资源记录
            await this.plugin.assetRecordManager.load();
            showMessage(this.plugin.i18n.assetListRefreshSuccess || "刷新成功", 2000, "info");
            
            // 重新填充文档筛选器
            this.filterDocSelect.innerHTML = `<option value="">${this.plugin.i18n.assetListFilterAllDocs || "全部文档"}</option>`;
            await this.populateDocFilter();
            
            await this.renderList();
        } catch (error: any) {
            showMessage(
                error?.message || this.plugin.i18n.assetListRefreshError || "刷新失败", 
                3000, 
                "error"
            );
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

    private getFileNameFromPath(path: string): string {
        return path.split("/").pop() || path;
    }

    private formatSize(bytes: number): string {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
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

    /**
     * 删除单个资源
     */
    private async handleDeleteAsset(docId: string, asset: AssetUploadRecord): Promise<void> {
        const fileName = this.getFileNameFromPath(asset.localPath);
        
        // 确认对话框
        const confirmDialog = new Dialog({
            title: this.plugin.i18n.assetListDeleteConfirmTitle || "确认删除",
            content: `
                <div class="b3-dialog__content" style="padding: 24px;">
                    <div style="margin-bottom: 16px;">
                        ${this.plugin.i18n.assetListDeleteConfirmMsg || "确定要删除此资源吗？此操作将从 S3 存储中删除文件，无法恢复。"}
                    </div>
                    <div style="padding: 12px; background: var(--b3-theme-background-light); border-radius: 4px; font-family: monospace; word-break: break-all;">
                        ${this.escapeHtml(fileName)}
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel">${this.plugin.i18n.cancel || "取消"}</button>
                    <div class="fn__flex-1"></div>
                    <button class="b3-button b3-button--error" id="confirmDeleteBtn">
                        <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                        ${this.plugin.i18n.delete || "删除"}
                    </button>
                </div>
            `,
            width: "500px",
        });

        const cancelBtn = confirmDialog.element.querySelector(".b3-button--cancel") as HTMLButtonElement;
        const confirmBtn = confirmDialog.element.querySelector("#confirmDeleteBtn") as HTMLButtonElement;

        cancelBtn.addEventListener("click", () => {
            confirmDialog.destroy();
        });

        confirmBtn.addEventListener("click", async () => {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<div class="fn__loading" style="width: 16px; height: 16px;"></div>`;

            try {
                // 从S3删除
                const s3Config = this.plugin.settings.getConfig().s3;
                if (s3Config.enabled) {
                    const { S3UploadService } = await import("../services/s3-upload");
                    const s3Service = new S3UploadService(s3Config);
                    await s3Service.deleteFile(asset.s3Key);
                }

                // 从记录中删除
                await this.plugin.assetRecordManager.removeAssetFromDoc(docId, asset.s3Key);

                showMessage(this.plugin.i18n.assetListDeleteSuccess || "删除成功", 2000, "info");
                confirmDialog.destroy();
                await this.renderList();
            } catch (error: any) {
                showMessage(
                    error?.message || this.plugin.i18n.assetListDeleteError || "删除失败",
                    3000,
                    "error"
                );
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `
                    <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                    ${this.plugin.i18n.delete || "删除"}
                `;
            }
        });
    }

    /**
     * 删除筛选后的所有资源
     */
    private async handleDeleteFiltered(): Promise<void> {
        const allMappings = this.plugin.assetRecordManager.getAllMappings();
        
        // 应用筛选
        let filteredMappings = allMappings;
        if (this.currentDocFilter) {
            filteredMappings = filteredMappings.filter(m => m.docId === this.currentDocFilter);
        }

        // 收集所有匹配筛选条件的资源
        const toDelete: Array<{ docId: string; asset: AssetUploadRecord }> = [];
        for (const mapping of filteredMappings) {
            for (const asset of mapping.assets) {
                if (!this.currentFilter || this.matchesFilter(asset)) {
                    toDelete.push({ docId: mapping.docId, asset });
                }
            }
        }

        if (toDelete.length === 0) {
            showMessage(this.plugin.i18n.assetListNoFilteredAssets || "没有符合条件的资源", 2000, "info");
            return;
        }

        const totalSize = toDelete.reduce((sum, item) => sum + item.asset.size, 0);

        // 判断是筛选删除还是全部删除
        const isFilteredDelete = this.currentFilter || this.currentDocFilter;
        const dialogTitle = isFilteredDelete 
            ? (this.plugin.i18n.assetListDeleteFilteredConfirmTitle || "批量删除确认")
            : (this.plugin.i18n.assetListDeleteAllConfirmTitle || "删除全部资源确认");
        const warningText = isFilteredDelete
            ? (this.plugin.i18n.assetListDeleteFilteredWarning || "警告：此操作将删除所有筛选结果")
            : (this.plugin.i18n.assetListDeleteAllWarning || "警告：此操作将删除全部资源");

        // 确认对话框
        const confirmDialog = new Dialog({
            title: dialogTitle,
            content: `
                <div class="b3-dialog__content" style="padding: 24px;">
                    <div style="margin-bottom: 16px; color: var(--b3-theme-error);">
                        <svg style="width: 48px; height: 48px; margin: 0 auto 12px; display: block;"><use xlink:href="#iconTrashcan"></use></svg>
                        <div style="text-align: center; font-weight: 600; font-size: 16px;">
                            ${warningText}
                        </div>
                    </div>
                    <div style="padding: 16px; background: var(--b3-theme-background-light); border-radius: 4px; margin-bottom: 16px;">
                        <div style="margin-bottom: 8px;">
                            <strong>${this.plugin.i18n.assetListDeleteFilteredCount || "删除数量"}:</strong> ${toDelete.length} ${this.plugin.i18n.assetListDeleteFilteredFiles || "个文件"}
                        </div>
                        <div>
                            <strong>${this.plugin.i18n.assetListDeleteFilteredSize || "总大小"}:</strong> ${this.formatSize(totalSize)}
                        </div>
                    </div>
                    <div style="padding: 12px; background: var(--b3-theme-error-lighter); border-left: 3px solid var(--b3-theme-error); border-radius: 4px; font-size: 13px;">
                        ${this.plugin.i18n.assetListDeleteFilteredNote || "此操作将从 S3 存储中永久删除这些文件，无法恢复。请谨慎操作！"}
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel">${this.plugin.i18n.cancel || "取消"}</button>
                    <div class="fn__flex-1"></div>
                    <button class="b3-button b3-button--error" id="confirmDeleteFilteredBtn">
                        <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                        ${this.plugin.i18n.confirmDelete || "确认删除"}
                    </button>
                </div>
            `,
            width: "600px",
        });

        const cancelBtn = confirmDialog.element.querySelector(".b3-button--cancel") as HTMLButtonElement;
        const confirmBtn = confirmDialog.element.querySelector("#confirmDeleteFilteredBtn") as HTMLButtonElement;

        cancelBtn.addEventListener("click", () => {
            confirmDialog.destroy();
        });

        confirmBtn.addEventListener("click", async () => {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<div class="fn__loading" style="width: 16px; height: 16px;"></div> ${this.plugin.i18n.deleting || "删除中..."}`;

            try {
                const s3Keys = toDelete.map(item => item.asset.s3Key);
                
                // 从S3批量删除
                const s3Config = this.plugin.settings.getConfig().s3;
                if (s3Config.enabled) {
                    const { S3UploadService } = await import("../services/s3-upload");
                    const s3Service = new S3UploadService(s3Config);
                    const result = await s3Service.deleteFiles(s3Keys);
                    
                    if (result.failed.length > 0) {
                        console.warn(`部分文件删除失败 (${result.failed.length}/${s3Keys.length}):`, result.failed);
                    }
                }

                // 从记录中删除
                await this.plugin.assetRecordManager.removeAssets(s3Keys);

                showMessage(
                    this.plugin.i18n.assetListDeleteFilteredSuccess || `成功删除 ${toDelete.length} 个资源`,
                    3000,
                    "info"
                );
                confirmDialog.destroy();
                
                // 清除筛选并刷新列表
                this.filterInput.value = "";
                this.filterDocSelect.value = "";
                this.currentFilter = "";
                this.currentDocFilter = "";
                await this.renderList();
            } catch (error: any) {
                showMessage(
                    error?.message || this.plugin.i18n.assetListDeleteFilteredError || "批量删除失败",
                    3000,
                    "error"
                );
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `
                    <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                    ${this.plugin.i18n.confirmDelete || "确认删除"}
                `;
            }
        });
    }
}
