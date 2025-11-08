import { Dialog, showMessage } from "siyuan";
import type SharePlugin from "../index";
import type { ShareConfig } from "../settings";
import type { ShareOptions, ShareRecord, UploadProgress } from "../types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class ShareDialog {
    private plugin: SharePlugin;
    private dialog!: Dialog;
    private docId: string;
    private docTitle: string;
    private existingRecord: ShareRecord | null = null;

    private requirePasswordCheckbox!: HTMLInputElement;
    private passwordContainer!: HTMLElement;
    private passwordHr!: HTMLElement;
    private passwordInput!: HTMLInputElement;
    private expireDaysInput!: HTMLInputElement;
    private confirmBtn!: HTMLButtonElement;
    private copyBtn!: HTMLButtonElement | null;
    private existingUrlInput!: HTMLInputElement;
    private existingExpireLabel!: HTMLElement;
    private existingAccessLabel!: HTMLElement;
    private cancelShareBtn!: HTMLButtonElement | null;
    private closeAllBtn!: HTMLButtonElement | null;
    
    // 上传进度相关
    private uploadProgressContainer!: HTMLElement | null;
    private uploadProgressList!: HTMLElement | null;
    private uploadOverallProgress!: HTMLElement | null;
    private fileProgressMap: Map<string, HTMLElement> = new Map();

    constructor(plugin: SharePlugin, docId: string, docTitle: string) {
        this.plugin = plugin;
        this.docId = docId;
        this.docTitle = docTitle;
        this.copyBtn = null;
        this.cancelShareBtn = null;
        this.closeAllBtn = null;
    }

    async show(): Promise<void> {
        const config = this.plugin.settings.getConfig();
        const record = this.plugin.shareRecordManager.getRecordByDocId(this.docId);
        if (record && record.expireAt > Date.now()) {
            this.existingRecord = record;
        }

        const dialogContent = `
            <div class="b3-dialog__content">
                <div class="fn__flex-column share-dialog__body">
                    <label class="fn__flex b3-label">
                        <div class="fn__flex-1">${this.plugin.i18n.shareDialogDocTitle}</div>
                        <span class="fn__space"></span>
                        <input class="b3-text-field fn__flex-center" id="shareDocTitle" value="${this.escapeHtml(this.docTitle)}" readonly />
                    </label>

                    <div class="share-dialog__existing" id="shareExistingInfo" style="display: none;">
                        <div class="b3-label__text">${this.plugin.i18n.shareDialogSharedHint}</div>
                        <div class="fn__flex" style="margin-top: 8px;">
                            <input class="b3-text-field fn__flex-1" id="shareExistingUrl" readonly />
                            <span class="fn__space"></span>
                            <button class="b3-button b3-button--outline" id="shareCopyCurrentBtn">${this.plugin.i18n.copyLink}</button>
                        </div>
                        <div class="share-dialog__meta">
                            <span>${this.plugin.i18n.shareDialogExpireAtLabel}: <span id="shareExistingExpire"></span></span>
                            <span>${this.plugin.i18n.shareDialogAccessLabel}: <span id="shareExistingAccess"></span></span>
                        </div>
                    </div>

                    <div class="fn__hr"></div>

                    <label class="fn__flex b3-label config__item">
                        <div class="fn__flex-1">
                            ${this.plugin.i18n.shareDialogRequirePassword}
                            <div class="b3-label__text">${this.plugin.i18n.shareDialogRequirePasswordDesc}</div>
                        </div>
                        <span class="fn__space"></span>
                        <input class="b3-switch fn__flex-center" id="shareRequirePassword" type="checkbox" />
                    </label>

                    <div class="fn__hr"></div>

                    <label class="fn__flex b3-label" id="sharePasswordContainer" style="display: none;">
                        <div class="fn__flex-1">${this.plugin.i18n.shareDialogPassword}</div>
                        <span class="fn__space"></span>
                        <input class="b3-text-field fn__flex-center" id="sharePassword" type="password" />
                    </label>

                    <div class="fn__hr" id="sharePasswordHr" style="display: none;"></div>

                    <label class="fn__flex b3-label">
                        <div class="fn__flex-1">
                            ${this.plugin.i18n.shareDialogExpireDays}
                            <div class="b3-label__text">${this.plugin.i18n.shareDialogExpireDaysDesc}</div>
                        </div>
                        <span class="fn__space"></span>
                        <input class="b3-text-field fn__flex-center fn__size200" id="shareExpireDays" type="number" min="1" max="365" />
                    </label>

                    <div class="fn__hr" id="uploadProgressHr" style="display: none;"></div>

                    <div id="uploadProgressContainer" style="display: none;">
                        <div class="b3-label__text" style="margin-bottom: 8px;">
                            ${this.plugin.i18n.uploadingAssets || "正在上传资源..."}
                        </div>
                        <div id="uploadOverallProgress" style="margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
                                <span id="uploadOverallText">准备中...</span>
                                <span id="uploadOverallPercent">0%</span>
                            </div>
                            <div style="height: 6px; background: var(--b3-theme-surface); border-radius: 3px; overflow: hidden;">
                                <div id="uploadOverallBar" style="height: 100%; width: 0%; background: var(--b3-theme-primary); transition: width 0.3s;"></div>
                            </div>
                        </div>
                        <div id="uploadProgressList" style="max-height: 200px; overflow-y: auto;">
                        </div>
                    </div>

                </div>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel">${this.plugin.i18n.cancel}</button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--outline" id="shareCloseAllBtn" style="display: none;">${this.plugin.i18n.shareDialogStopAll}</button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--outline" id="shareCancelBtn" style="display: none;">${this.plugin.i18n.shareDialogStopShare}</button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--text" id="shareConfirmBtn"></button>
            </div>
        `;

        this.dialog = new Dialog({
            title: this.plugin.i18n.shareDialogTitle,
            content: dialogContent,
            width: "520px",
            destroyCallback: () => {
                this.dialog = null;
            }
        });

        this.cacheElements();
        this.applyInitialState(config);
        this.bindEvents();
    }

    private cacheElements(): void {
        this.requirePasswordCheckbox = this.dialog.element.querySelector("#shareRequirePassword") as HTMLInputElement;
        this.passwordContainer = this.dialog.element.querySelector("#sharePasswordContainer") as HTMLElement;
        this.passwordHr = this.dialog.element.querySelector("#sharePasswordHr") as HTMLElement;
        this.passwordInput = this.dialog.element.querySelector("#sharePassword") as HTMLInputElement;
        this.expireDaysInput = this.dialog.element.querySelector("#shareExpireDays") as HTMLInputElement;
        this.confirmBtn = this.dialog.element.querySelector("#shareConfirmBtn") as HTMLButtonElement;
        this.copyBtn = this.dialog.element.querySelector("#shareCopyCurrentBtn");
        this.existingUrlInput = this.dialog.element.querySelector("#shareExistingUrl") as HTMLInputElement;
        this.existingExpireLabel = this.dialog.element.querySelector("#shareExistingExpire") as HTMLElement;
        this.existingAccessLabel = this.dialog.element.querySelector("#shareExistingAccess") as HTMLElement;
        this.cancelShareBtn = this.dialog.element.querySelector("#shareCancelBtn");
        this.closeAllBtn = this.dialog.element.querySelector("#shareCloseAllBtn");
        
        // 上传进度元素
        this.uploadProgressContainer = this.dialog.element.querySelector("#uploadProgressContainer");
        this.uploadProgressList = this.dialog.element.querySelector("#uploadProgressList");
        this.uploadOverallProgress = this.dialog.element.querySelector("#uploadOverallProgress");
    }

    private applyInitialState(config: ShareConfig): void {
        const hasActive = this.hasActiveShare();
        const records = this.plugin.shareRecordManager.getRecords();

        const requirePasswordDefault = hasActive ? !!this.existingRecord?.requirePassword : config.defaultPassword;
        this.requirePasswordCheckbox.checked = requirePasswordDefault;
        this.togglePasswordSection(requirePasswordDefault);
        this.passwordInput.value = "";
        this.passwordInput.placeholder = hasActive
            ? this.plugin.i18n.shareDialogPasswordKeepPlaceholder
            : this.plugin.i18n.shareDialogPasswordPlaceholder;

        const expireValue = hasActive && this.existingRecord
            ? Math.max(1, Math.ceil((this.existingRecord.expireAt - Date.now()) / DAY_IN_MS))
            : config.defaultExpireDays;
        this.expireDaysInput.value = String(expireValue);

        this.confirmBtn.textContent = hasActive
            ? this.plugin.i18n.shareDialogUpdate
            : this.plugin.i18n.shareDialogConfirm;

        const existingInfo = this.dialog.element.querySelector("#shareExistingInfo") as HTMLElement;
        if (hasActive && this.existingRecord) {
            existingInfo.style.display = "";
            this.existingUrlInput.value = this.existingRecord.shareUrl;
            this.existingExpireLabel.textContent = this.formatDate(this.existingRecord.expireAt);
            this.existingAccessLabel.textContent = this.resolveAccessLabel(this.existingRecord);
            if (this.copyBtn) {
                this.copyBtn.style.display = "";
            }
        } else {
            existingInfo.style.display = "none";
            if (this.copyBtn) {
                this.copyBtn.style.display = "none";
            }
        }

        if (this.cancelShareBtn) {
            this.cancelShareBtn.style.display = hasActive ? "" : "none";
        }
        // 单文档分享对话框不显示"关闭全部分享"按钮
        if (this.closeAllBtn) {
            this.closeAllBtn.style.display = "none";
        }
    }

    private bindEvents(): void {
        this.requirePasswordCheckbox.addEventListener("change", () => {
            this.togglePasswordSection(this.requirePasswordCheckbox.checked);
            if (!this.requirePasswordCheckbox.checked) {
                this.passwordInput.value = "";
            }
        });

        const cancelBtn = this.dialog.element.querySelector(".b3-button--cancel") as HTMLButtonElement;
        cancelBtn.addEventListener("click", () => {
            this.dialog.destroy();
        });

        this.confirmBtn.addEventListener("click", async () => {
            await this.handleShare();
        });

        if (this.copyBtn) {
            this.copyBtn.addEventListener("click", () => {
                this.copyCurrentLink();
            });
        }

        if (this.cancelShareBtn) {
            this.cancelShareBtn.addEventListener("click", async () => {
                await this.handleCancelShare();
            });
        }

        if (this.closeAllBtn) {
            this.closeAllBtn.addEventListener("click", async () => {
                await this.handleCloseAllShares();
            });
        }
    }

    private togglePasswordSection(visible: boolean): void {
        this.passwordContainer.style.display = visible ? "" : "none";
        this.passwordHr.style.display = visible ? "" : "none";
    }

    private hasActiveShare(): boolean {
        return !!(this.existingRecord && this.existingRecord.expireAt > Date.now());
    }

    private async handleShare(): Promise<void> {
        const requirePassword = this.requirePasswordCheckbox.checked;
        const password = this.passwordInput.value.trim();
        const expireDaysRaw = parseInt(this.expireDaysInput.value, 10);
        const expireDays = Number.isNaN(expireDaysRaw) ? 7 : Math.min(365, Math.max(1, expireDaysRaw));
        const isPublic = !requirePassword; // 没有密码保护即为公开

        const isUpdating = this.hasActiveShare();

        if (requirePassword) {
            if (!isUpdating && !password) {
                showMessage(this.plugin.i18n.shareDialogPasswordRequired, 3000, "error");
                this.passwordInput.focus();
                return;
            }
            if (password && password.length < 4) {
                showMessage(this.plugin.i18n.shareDialogPasswordTooShort, 3000, "error");
                this.passwordInput.focus();
                return;
            }
            if (isUpdating && !password && !this.existingRecord?.requirePassword) {
                showMessage(this.plugin.i18n.shareDialogPasswordRequired, 3000, "error");
                this.passwordInput.focus();
                return;
            }
            if (!password && !isUpdating) {
                // 新分享必须提供密码
                showMessage(this.plugin.i18n.shareDialogPasswordRequired, 3000, "error");
                this.passwordInput.focus();
                return;
            }
        }

        const options: ShareOptions = {
            docId: this.docId,
            docTitle: this.docTitle,
            requirePassword,
            password: password || undefined,
            expireDays,
            isPublic,
        };

        const s3Enabled = this.plugin.settings.getConfig().s3?.enabled;

        this.confirmBtn.disabled = true;
        try {
            let record;
            if (s3Enabled) {
                // 显示上传进度UI
                this.showUploadProgress();
                
                record = await this.plugin.shareService.createShare(options, (progress) => {
                    this.updateUploadProgress(progress);
                });
                
                // 隐藏上传进度UI
                this.hideUploadProgress();
            } else {
                record = await this.plugin.shareService.createShare(options);
            }
            
            this.existingRecord = record;

            if (isUpdating) {
                this.applyInitialState(this.plugin.settings.getConfig());
                showMessage(this.plugin.i18n.shareDialogUpdateSuccess, 3000, "info");
            } else {
                this.dialog.destroy();
                this.showSuccessDialog(record.shareUrl);
            }
        } catch (error: any) {
            const msg = error?.message || this.plugin.i18n.shareErrorUnknown;
            this.showErrorDialog(msg);
        } finally {
            this.confirmBtn.disabled = false;
        }
    }

    private async handleCancelShare(): Promise<void> {
        if (!this.existingRecord) {
            return;
        }

        if (this.cancelShareBtn) {
            this.cancelShareBtn.disabled = true;
        }
        try {
            await this.plugin.shareService.deleteShare(this.existingRecord.id);
            this.existingRecord = null;
            this.applyInitialState(this.plugin.settings.getConfig());
            showMessage(this.plugin.i18n.shareDialogStopShareSuccess, 3000, "info");
        } catch (error: any) {
            const msg = error?.message || this.plugin.i18n.shareDialogStopFail;
            showMessage(msg, 4000, "error");
        } finally {
            if (this.cancelShareBtn) {
                this.cancelShareBtn.disabled = false;
            }
        }
    }

    private async handleCloseAllShares(): Promise<void> {
        if (!window.confirm(this.plugin.i18n.shareDialogStopAllConfirm)) {
            return;
        }

        if (this.closeAllBtn) {
            this.closeAllBtn.disabled = true;
        }
        try {
            const result = await this.plugin.shareService.deleteShares();
            this.existingRecord = null;
            this.applyInitialState(this.plugin.settings.getConfig());

            if (result.failed && Object.keys(result.failed).length) {
                showMessage(this.plugin.i18n.shareDialogStopAllPartialFail, 5000, "error");
            } else {
                showMessage(this.plugin.i18n.shareDialogStopAllSuccess, 3000, "info");
            }
        } catch (error: any) {
            const msg = error?.message || this.plugin.i18n.shareDialogStopAllFail;
            showMessage(msg, 5000, "error");
        } finally {
            if (this.closeAllBtn) {
                this.closeAllBtn.disabled = false;
            }
        }
    }

    private copyCurrentLink(): void {
        if (!this.existingRecord) {
            return;
        }
        const text = this.existingRecord.shareUrl;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showMessage(this.plugin.i18n.copySuccess, 2000, "info");
            }).catch(() => {
                this.copyFallback(text);
            });
        } else {
            this.copyFallback(text);
        }
    }

    private copyFallback(text: string): void {
        const tempInput = document.createElement("input");
        tempInput.value = text;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showMessage(this.plugin.i18n.copySuccess, 2000, "info");
    }

    private showSuccessDialog(shareUrl: string): void {
        const successDialog = new Dialog({
            title: this.plugin.i18n.shareSuccessTitle,
            content: `
                <div class="b3-dialog__content">
                    <div class="fn__flex-column">
                        <div class="b3-label__text" style="text-align: center; margin-bottom: 16px;">
                            ${this.plugin.i18n.shareSuccessMessage}
                        </div>
                        <div class="fn__flex">
                            <input class="b3-text-field fn__flex-1" id="shareUrlInput" value="${shareUrl}" readonly />
                            <span class="fn__space"></span>
                            <button class="b3-button b3-button--outline" id="copyShareUrlBtn">
                                ${this.plugin.i18n.copyLink}
                            </button>
                        </div>
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--text">${this.plugin.i18n.close}</button>
                </div>
            `,
            width: "520px",
        });

        const copyBtn = successDialog.element.querySelector("#copyShareUrlBtn") as HTMLButtonElement;
        const shareUrlInput = successDialog.element.querySelector("#shareUrlInput") as HTMLInputElement;
        const closeBtn = successDialog.element.querySelector(".b3-button--text") as HTMLButtonElement;

        copyBtn.addEventListener("click", () => {
            shareUrlInput.select();
            document.execCommand("copy");
            showMessage(this.plugin.i18n.copySuccess, 2000, "info");
        });

        closeBtn.addEventListener("click", () => {
            successDialog.destroy();
        });
    }

    private showErrorDialog(errorMessage: string): void {
        const errorDialog = new Dialog({
            title: this.plugin.i18n.shareErrorTitle,
            content: `
                <div class="b3-dialog__content">
                    <div class="fn__flex-column">
                        <div class="b3-label__text" style="color: var(--b3-card-error-color); margin-bottom: 16px;">
                            ${this.plugin.i18n.shareErrorMessage}
                        </div>
                        <div class="b3-label__text" style="background: var(--b3-card-error-background); padding: 8px; border-radius: 4px;">
                            ${this.escapeHtml(errorMessage)}
                        </div>
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--text">${this.plugin.i18n.close}</button>
                </div>
            `,
            width: "520px",
        });

        const closeBtn = errorDialog.element.querySelector(".b3-button--text") as HTMLButtonElement;
        closeBtn.addEventListener("click", () => {
            errorDialog.destroy();
        });
    }

    private resolveAccessLabel(record: ShareRecord): string {
        if (record.requirePassword) {
            return this.plugin.i18n.shareDialogAccessPassword;
        }
        return record.isPublic
            ? this.plugin.i18n.shareDialogAccessPublic
            : this.plugin.i18n.shareDialogAccessPrivate;
    }

    private formatDate(timestamp: number): string {
        return new Date(timestamp).toLocaleString();
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
     * 显示上传进度UI
     */
    private showUploadProgress(): void {
        if (this.uploadProgressContainer) {
            this.uploadProgressContainer.style.display = '';
        }
        const hr = this.dialog.element.querySelector("#uploadProgressHr");
        if (hr) {
            (hr as HTMLElement).style.display = '';
        }
        this.fileProgressMap.clear();
        if (this.uploadProgressList) {
            this.uploadProgressList.innerHTML = '';
        }
    }

    /**
     * 隐藏上传进度UI
     */
    private hideUploadProgress(): void {
        if (this.uploadProgressContainer) {
            this.uploadProgressContainer.style.display = 'none';
        }
        const hr = this.dialog.element.querySelector("#uploadProgressHr");
        if (hr) {
            (hr as HTMLElement).style.display = 'none';
        }
    }

    /**
     * 更新上传进度
     */
    private updateUploadProgress(progress: UploadProgress): void {
        if (!this.uploadProgressList) return;

        const fileName = progress.fileName;
        let fileProgressEl = this.fileProgressMap.get(fileName);

        // 如果是新文件，创建进度条
        if (!fileProgressEl) {
            fileProgressEl = document.createElement('div');
            fileProgressEl.className = 'upload-file-progress';
            fileProgressEl.style.cssText = 'margin-bottom: 8px; padding: 8px; background: var(--b3-theme-surface); border-radius: 4px;';
            
            fileProgressEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
                    <span class="file-name" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(fileName)}">${this.escapeHtml(fileName)}</span>
                    <span class="file-status" style="margin-left: 8px; color: var(--b3-theme-on-surface-light);">准备中</span>
                </div>
                <div style="height: 4px; background: var(--b3-border-color); border-radius: 2px; overflow: hidden;">
                    <div class="file-progress-bar" style="height: 100%; width: 0%; background: var(--b3-theme-primary); transition: width 0.3s;"></div>
                </div>
            `;
            
            this.uploadProgressList.appendChild(fileProgressEl);
            this.fileProgressMap.set(fileName, fileProgressEl);
        }

        // 更新进度条
        const progressBar = fileProgressEl.querySelector('.file-progress-bar') as HTMLElement;
        const statusEl = fileProgressEl.querySelector('.file-status') as HTMLElement;

        if (progressBar) {
            progressBar.style.width = `${progress.percentage}%`;
        }

        if (statusEl) {
            switch (progress.status) {
                case 'pending':
                    statusEl.textContent = '准备中';
                    statusEl.style.color = 'var(--b3-theme-on-surface-light)';
                    break;
                case 'uploading':
                    statusEl.textContent = `${progress.percentage}%`;
                    statusEl.style.color = 'var(--b3-theme-primary)';
                    if (progressBar) {
                        progressBar.style.background = 'var(--b3-theme-primary)';
                    }
                    break;
                case 'success':
                    statusEl.textContent = '✓ 完成';
                    statusEl.style.color = 'var(--b3-theme-success-color)';
                    if (progressBar) {
                        progressBar.style.background = 'var(--b3-theme-success-color)';
                    }
                    break;
                case 'error':
                    statusEl.textContent = '✗ 失败';
                    statusEl.style.color = 'var(--b3-card-error-color)';
                    if (progressBar) {
                        progressBar.style.background = 'var(--b3-card-error-color)';
                    }
                    break;
            }
        }

        // 更新总体进度
        this.updateOverallProgress();
    }

    /**
     * 更新总体进度
     */
    private updateOverallProgress(): void {
        if (!this.uploadOverallProgress || this.fileProgressMap.size === 0) return;

        const totalFiles = this.fileProgressMap.size;
        let completedFiles = 0;
        let totalProgress = 0;

        this.fileProgressMap.forEach((el) => {
            const progressBar = el.querySelector('.file-progress-bar') as HTMLElement;
            if (progressBar) {
                const width = parseFloat(progressBar.style.width) || 0;
                totalProgress += width;
                if (width >= 100) {
                    completedFiles++;
                }
            }
        });

        const overallPercentage = Math.round(totalProgress / totalFiles);
        
        const textEl = this.uploadOverallProgress.querySelector('#uploadOverallText');
        const percentEl = this.uploadOverallProgress.querySelector('#uploadOverallPercent');
        const barEl = this.uploadOverallProgress.querySelector('#uploadOverallBar') as HTMLElement;

        if (textEl) {
            textEl.textContent = `${completedFiles} / ${totalFiles} 个文件`;
        }
        if (percentEl) {
            percentEl.textContent = `${overallPercentage}%`;
        }
        if (barEl) {
            barEl.style.width = `${overallPercentage}%`;
        }
    }
}
