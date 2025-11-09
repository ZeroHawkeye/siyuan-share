import { getAllEditor, showMessage } from "siyuan";
import type SharePlugin from "../index";
import { S3UploadService } from "./s3-upload";

/**
 * 粘贴上传服务
 * 监听粘贴事件，自动上传图片和文件到 S3，并替换链接
 */
export class PasteUploadService {
    private plugin: SharePlugin;
    private enabled: boolean = false;
    private s3Service: S3UploadService | null = null;
    private pasteHandler: ((evt: ClipboardEvent) => void) | null = null;
    private processing: boolean = false; // 防抖，避免递归/重复处理
    private hashCache: Map<string, { url: string; record: any } > = new Map(); // 哈希 -> 资源映射缓存

    constructor(plugin: SharePlugin) {
        this.plugin = plugin;
    }

    /**
     * 启用粘贴上传
     */
    enable(): void {
        if (this.enabled) return;

        const config = this.plugin.settings.getConfig();
        if (!config.s3.enabled) {
            console.warn("S3 存储未启用，无法启用粘贴上传");
            return;
        }

        this.s3Service = new S3UploadService(config.s3);
        this.enabled = true;
        this.buildHashCache();

        // 仅监听 DOM 粘贴事件（捕获阶段），避免与内置粘贴流程冲突
        this.pasteHandler = (evt: ClipboardEvent) => {
            this.handleDOMPaste(evt);
        };
        document.addEventListener('paste', this.pasteHandler, true);
        
        console.log("粘贴上传功能已启用");
    }

    /**
     * 禁用粘贴上传
     */
    disable(): void {
        if (!this.enabled) return;
        this.enabled = false;
        this.s3Service = null;

        // 移除 DOM 粘贴事件监听
        if (this.pasteHandler) {
            document.removeEventListener('paste', this.pasteHandler, true);
            this.pasteHandler = null;
        }
        // 清理缓存
        this.hashCache.clear();
        
        console.log("粘贴上传功能已禁用");
    }

    /**
     * 处理 DOM 粘贴事件
     */
    private async handleDOMPaste(evt: ClipboardEvent): Promise<void> {
        if (!this.enabled || !this.s3Service) return;
        if (this.processing) return;

        try {
            const rawTarget = evt.target as (Node | null);
            if (!this.isNodeInsideEditor(rawTarget)) return;

            const clipboardData = evt.clipboardData;
            if (!clipboardData) return;

            const files: File[] = [];
            if (clipboardData.items && clipboardData.items.length > 0) {
                for (let i = 0; i < clipboardData.items.length; i++) {
                    const it = clipboardData.items[i];
                    if (it.kind === 'file') {
                        const f = it.getAsFile();
                        if (f) files.push(f);
                    }
                }
            }
            if (files.length === 0 && clipboardData.files) {
                for (let i = 0; i < clipboardData.files.length; i++) {
                    files.push(clipboardData.files[i]);
                }
            }
            if (files.length === 0) return;

            const supportedFiles = files.filter(f => this.isSupportedFile(f));
            if (supportedFiles.length === 0) return;

            evt.preventDefault();
            evt.stopPropagation();
            (evt as any).returnValue = false;

            this.processing = true;
            await this.uploadAndInsertFiles(supportedFiles);
        } catch (e) {
            console.error('处理 DOM 粘贴事件失败:', e);
        } finally {
            this.processing = false;
        }
    }

    /**
     * 判断一个节点是否位于思源编辑器区域中，避免对 target.closest 的直接依赖
     * 支持传入 Text/Element/Document/ShadowRoot 等多类型
     */
    private isNodeInsideEditor(node: Node | null): boolean {
        if (!node) return false;
        // 若是元素，直接向上查找
        const isEditorEl = (el: HTMLElement) => (
            el.classList.contains('protyle-wysiwyg') ||
            el.classList.contains('protyle')
        );

        let current: Node | null = node;
        let steps = 0;
        while (current && steps < 200) { // 防御性限制
            if (current instanceof HTMLElement) {
                if (isEditorEl(current)) return true;
            }
            current = current.parentNode || (current instanceof HTMLElement ? current.closest?.('.protyle, .protyle-wysiwyg') || null : null);
            steps++;
        }
        // 降级：尝试通过 activeElement 判断（用户已聚焦编辑器）
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.closest?.('.protyle-wysiwyg') || active.closest?.('.protyle'))) return true;
        return false;
    }

    /**
     * 上传文件并插入到编辑器
     */
    private async uploadAndInsertFiles(supportedFiles: File[]): Promise<void> {
        if (!this.s3Service) return;
        // 预分类（复用 / 待上传）
        const reusedRecords: Array<{ file: File; url: string }> = [];
        const toUpload: Array<{ file: File; hash: string }> = [];
        for (const file of supportedFiles) {
            try {
                const hash = await this.s3Service.calculateFileHashPublic(file);
                const cached = this.hashCache.get(hash);
                if (cached) {
                    reusedRecords.push({ file, url: cached.url });
                    continue;
                }
                const existing = this.plugin.assetRecordManager.findAssetByHash(hash);
                if (existing) {
                    this.hashCache.set(hash, { url: existing.s3Url, record: existing });
                    reusedRecords.push({ file, url: existing.s3Url });
                    continue;
                }
                toUpload.push({ file, hash });
            } catch (e) {
                console.warn('哈希分类失败，标记为待上传', e);
                toUpload.push({ file, hash: 'unknown-' + Date.now() });
            }
        }

        // 无需上传（全复用）直接插入最终 Markdown
        if (toUpload.length === 0) {
            if (reusedRecords.length > 0) {
                showMessage(`已复用 ${reusedRecords.length} 个文件`, 2000, 'info');
                await this.insertToEditor(reusedRecords);
            }
            return;
        }

        // 构造占位符行：已复用的用最终链接，待上传的用 uploading:// 占位
        const placeholderLines: string[] = [];
        // 已复用部分
        if (reusedRecords.length > 0) {
            placeholderLines.push(...this.formatLinks(reusedRecords).split('\n'));
        }
        // 待上传部分
        for (const item of toUpload) {
            const fileName = item.file.name;
            const isImage = item.file.type.startsWith('image/');
            const proto = `uploading://${item.hash}`;
            placeholderLines.push(isImage ? `![${fileName}](${proto})` : `[${fileName}](${proto})`);
        }
        const placeholderMarkdown = placeholderLines.join('\n');

        // 插入占位符块并获取块 ID（优先使用 API 方式保证可更新）
        const placeholderBlockId = await this.insertMarkdownBlockAndGetId(placeholderMarkdown);
        if (!placeholderBlockId) {
            // 占位插入失败，退化为原先逻辑：显示上传提示 -> 上传完成后一次性插入
            const uploadingMsgFallback = toUpload.length === 1
                ? `正在上传 ${toUpload[0].file.name}...`
                : `正在上传 ${toUpload.length} 个文件...`;
            showMessage(uploadingMsgFallback, 2000, 'info');
            const uploadedRecords: Array<{ file: File; url: string }> = [];
            for (const item of toUpload) {
                try {
                    const record = await this.s3Service.uploadFile(
                        item.file,
                        item.file.name,
                        undefined,
                        item.hash.startsWith('unknown-') ? undefined : item.hash
                    );
                    uploadedRecords.push({ file: item.file, url: record.s3Url });
                    this.hashCache.set(record.hash, { url: record.s3Url, record });
                    await this.saveAssetRecord(record);
                } catch (error) {
                    console.error(`上传文件失败: ${item.file.name}`, error);
                }
            }
            const insertionRecords = [...reusedRecords, ...uploadedRecords];
            if (insertionRecords.length > 0) {
                await this.insertToEditor(insertionRecords);
                const reuseCount = reusedRecords.length;
                const upCount = uploadedRecords.length;
                if (upCount > 0 && reuseCount > 0) {
                    showMessage(`已复用 ${reuseCount} 个，成功上传 ${upCount} 个`, 2400, 'info');
                } else if (upCount > 0) {
                    showMessage(`成功上传 ${upCount} 个文件`, 2000, 'info');
                }
            }
            return;
        }

        // 成功插入占位符，开始逐个上传并实时替换
        const uploadingMsg = toUpload.length === 1
            ? `正在上传 ${toUpload[0].file.name}...`
            : `正在上传 ${toUpload.length} 个文件...`;
        showMessage(uploadingMsg, 1800, 'info');

        // 可变的行数组（就地修改）
        const currentLines = [...placeholderLines];
        // 记录待上传项在行中的起始索引（复用部分在前）
        const startUploadIndex = reusedRecords.length;
        let uploadedCount = 0;
        for (let i = 0; i < toUpload.length; i++) {
            const item = toUpload[i];
            const lineIndex = startUploadIndex + i; // 对应的占位符行
            try {
                const record = await this.s3Service.uploadFile(
                    item.file,
                    item.file.name,
                    (progress) => {
                        // 可选择后续增加进度显示，目前仅在控制台
                        if (progress.status === 'uploading' && progress.percentage % 25 === 0) {
                            console.log(`${item.file.name} 上传进度 ${progress.percentage}%`);
                        }
                    },
                    item.hash.startsWith('unknown-') ? undefined : item.hash
                );
                this.hashCache.set(record.hash, { url: record.s3Url, record });
                await this.saveAssetRecord(record);
                // 用最终链接替换占位符行
                const isImage = item.file.type.startsWith('image/');
                currentLines[lineIndex] = isImage ? `![${item.file.name}](${record.s3Url})` : `[${item.file.name}](${record.s3Url})`;
                uploadedCount++;
            } catch (error) {
                console.error(`上传文件失败: ${item.file.name}`, error);
                currentLines[lineIndex] = `上传失败: ${item.file.name}`;
            }
            // 每次上传完成后更新块内容
            await this.updateBlockMarkdown(placeholderBlockId, currentLines.join('\n'));
        }

        // 最终提示
        if (uploadedCount > 0 && reusedRecords.length > 0) {
            showMessage(`已复用 ${reusedRecords.length} 个，成功上传 ${uploadedCount} 个`, 2400, 'info');
        } else if (uploadedCount > 0) {
            showMessage(`成功上传 ${uploadedCount} 个文件`, 2000, 'info');
        } else {
            showMessage('全部上传失败，请稍后重试', 3000, 'error');
        }
    }

    /**
     * 构建哈希缓存（启用时加载已有资源）
     */
    private buildHashCache(): void {
        try {
            this.hashCache.clear();
            const mappings = this.plugin.assetRecordManager.getAllMappings();
            for (const m of mappings) {
                for (const a of m.assets) {
                    if (a.hash && a.s3Url && !this.hashCache.has(a.hash)) {
                        this.hashCache.set(a.hash, { url: a.s3Url, record: a });
                    }
                }
            }
            console.log(`粘贴上传哈希缓存已构建: ${this.hashCache.size} 条`);
        } catch (e) {
            console.warn('构建哈希缓存失败', e);
        }
    }

    /**
     * 检查是否是支持的文件类型
     */
    private isSupportedFile(file: File): boolean {
        // 支持图片、视频、音频和常见文档
        const supportedTypes = [
            'image/',
            'video/',
            'audio/',
            'application/pdf',
            'application/zip',
            'application/x-zip-compressed',
            'text/plain',
            'text/markdown',
        ];

        return supportedTypes.some(type => file.type.startsWith(type));
    }

    /**
     * 保存资源记录
     */
    private async saveAssetRecord(record: any): Promise<void> {
        try {
            // 使用特殊的 docId 标记为粘贴上传的资源
            const docId = 'paste-upload';
            const shareId = 'paste-upload';

            const mapping = this.plugin.assetRecordManager.getMapping(docId);
            if (mapping) {
                // 追加到现有记录
                mapping.assets.push(record);
                mapping.updatedAt = Date.now();
                await this.plugin.assetRecordManager.addOrUpdateMapping(
                    docId,
                    shareId,
                    mapping.assets
                );
            } else {
                // 创建新记录
                await this.plugin.assetRecordManager.addOrUpdateMapping(
                    docId,
                    shareId,
                    [record]
                );
            }
        } catch (error) {
            console.error("保存资源记录失败:", error);
        }
    }

    /**
     * 格式化链接为 Markdown
     */
    private formatLinks(records: Array<{ file: File; url: string }>): string {
        const safeRecords = (records || []).filter(r => r && r.url);
        const toImage = (nameOrUrl: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(nameOrUrl);
        return safeRecords.map(r => {
            const fileName = r?.file?.name || decodeURIComponent(r.url.split('/').pop() || 'file');
            const isImage = r?.file?.type ? r.file.type.startsWith('image/') : toImage(fileName) || toImage(r.url);
            return isImage ? `![${fileName}](${r.url})` : `[${fileName}](${r.url})`;
        }).join('\n');
    }

    /**
     * 复制到剪贴板
     */
    private async copyToClipboard(text: string): Promise<void> {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // 降级方案
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
        } catch (error) {
            console.error("复制到剪贴板失败:", error);
        }
    }

    /**
     * 插入到编辑器
     */
    private async insertToEditor(records: Array<{ file: File; url: string }>): Promise<void> {
        try {
            // 获取当前编辑器
            const editors = getAllEditor();
            if (editors.length === 0) return;

            // 找到焦点编辑器
            const activeEditor = editors.find((e: any) => {
                const el = e?.protyle?.element as HTMLElement | null;
                return el && el.contains(document.activeElement);
            }) || editors[0];

            if (!activeEditor?.protyle) return;

            // 格式化为 Markdown 插入
            const markdown = this.formatLinks(records);
            if (!markdown) {
                showMessage('未生成可插入内容，请重试粘贴', 3000, 'error');
                return;
            }
            
            // 确保编辑器获得焦点
            // 使用元素 focus 而非未声明的 protyle.focus 方法
            try { (activeEditor.protyle.element as HTMLElement | null)?.focus(); } catch (_) {}
            // 方式1：尝试使用 execCommand 粘贴 Markdown（让内置解析处理）
            let inserted = false;
            try {
                if (document.queryCommandSupported?.('insertText')) {
                    activeEditor.protyle.element?.focus();
                    inserted = document.execCommand('insertText', false, markdown);
                }
            } catch (_) {}

            // 方式2：直接向当前光标所在块后插入一个 markdown 块（调用思源内核 API）
            if (!inserted) {
                try {
                    const config = this.plugin.settings.getConfig();
                    // 获取当前 rootID，用于 fallback 插入
                    const rootID = activeEditor?.protyle?.block?.rootID;
                    const response = await fetch('/api/block/insertBlock', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Token ${config.siyuanToken}`,
                        },
                        body: JSON.stringify({
                            dataType: 'markdown',
                            data: markdown,
                            parentID: rootID,
                            previousID: '',
                        })
                    });
                    const result = await response.json().catch(()=>({}));
                    if (response.ok && result.code === 0) {
                        inserted = true;
                    }
                } catch (e) {
                    console.warn('通过 API 插入失败', e);
                }
            }

            // 方式3：直接修改选区（最后兜底）
            if (!inserted) {
                try {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        range.deleteContents();
                        range.insertNode(document.createTextNode('\n' + markdown + '\n'));
                        inserted = true;
                    }
                } catch (_) {}
            }

            if (!inserted) {
                showMessage('插入内容失败，请手动粘贴', 3000, 'error');
            }
        } catch (error) {
            console.error("插入到编辑器失败:", error);
        }
    }

    /**
     * 通过内核 API 插入一个 Markdown 块，返回块 ID，失败返回 null
     */
    private async insertMarkdownBlockAndGetId(markdown: string): Promise<string | null> {
        try {
            const editors = getAllEditor();
            if (!editors.length) return null;
            const activeEditor = editors.find((e: any) => {
                const el = e?.protyle?.element as HTMLElement | null;
                return el && el.contains(document.activeElement);
            }) || editors[0];
            const rootID = activeEditor?.protyle?.block?.rootID;
            if (!rootID) return null;
            const config = this.plugin.settings.getConfig();
            const response = await fetch('/api/block/insertBlock', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${config.siyuanToken}`,
                },
                body: JSON.stringify({
                    dataType: 'markdown',
                    data: markdown,
                    parentID: rootID,
                    previousID: '',
                    nextID: ''
                })
            });
            const result = await response.json().catch(()=>({}));
            if (response.ok && result.code === 0 && Array.isArray(result.data)) {
                // 寻找 insert 操作中的 id
                for (const opWrap of result.data) {
                    if (opWrap.doOperations) {
                        for (const op of opWrap.doOperations) {
                            if (op.action === 'insert' && op.id) {
                                return op.id as string;
                            }
                        }
                    }
                }
            }
            return null;
        } catch (e) {
            console.warn('插入占位符块失败', e);
            return null;
        }
    }

    /**
     * 更新指定块的 Markdown 内容
     */
    private async updateBlockMarkdown(blockId: string, markdown: string): Promise<boolean> {
        try {
            const config = this.plugin.settings.getConfig();
            const response = await fetch('/api/block/updateBlock', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${config.siyuanToken}`,
                },
                body: JSON.stringify({
                    id: blockId,
                    dataType: 'markdown',
                    data: markdown
                })
            });
            const result = await response.json().catch(()=>({}));
            if (response.ok && result.code === 0) return true;
            return false;
        } catch (e) {
            console.warn('更新占位符块失败', e);
            return false;
        }
    }

    /**
     * 兜底插入纯文本（用于全部上传失败的情况）
     */
    private async insertFallbackText(text: string): Promise<void> {
        try {
            const editors = getAllEditor();
            if (editors.length === 0) return;
            const activeEditor = editors.find((e: any) => {
                const el = e?.protyle?.element as HTMLElement | null;
                return el && el.contains(document.activeElement);
            }) || editors[0];
            if (!activeEditor?.protyle) return;
            try { (activeEditor.protyle.element as HTMLElement | null)?.focus(); } catch (_) {}
            let done = false;
            try {
                if (document.queryCommandSupported?.('insertText')) {
                    activeEditor.protyle.element?.focus();
                    done = document.execCommand('insertText', false, '\n' + text + '\n');
                }
            } catch (_) {}
            if (!done) {
                try {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        range.deleteContents();
                        range.insertNode(document.createTextNode('\n' + text + '\n'));
                        done = true;
                    }
                } catch (_) {}
            }
            if (!done) {
                showMessage('插入占位文本失败，请手动输入文件名', 3000, 'error');
            }
        } catch (e) {
            console.warn('插入失败占位文本出错', e);
        }
    }

    /**
     * 检查是否已启用
     */
    isEnabled(): boolean {
        return this.enabled;
    }
}
