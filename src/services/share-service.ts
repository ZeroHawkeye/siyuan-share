import type SharePlugin from "../index";
import type { BatchDeleteShareResponse, ShareOptions, ShareRecord, ShareResponse } from "../types";

export class ShareService {
    private plugin: SharePlugin;
    // 导出内容缓存：会话级，避免短时间重复导出同一文档
    private contentCache = new Map<string, { content: string; ts: number }>();
    private contentPromiseCache = new Map<string, Promise<string | null>>();

    constructor(plugin: SharePlugin) {
        this.plugin = plugin;
    }

    /**
     * 创建分享
     */
    async createShare(options: ShareOptions): Promise<ShareRecord> {
        const config = this.plugin.settings.getConfig();

        // 检查配置
        if (!config.serverUrl || !config.apiToken) {
            throw new Error(this.plugin.i18n.shareErrorNotConfigured);
        }

        if (!config.siyuanToken) {
            throw new Error(this.plugin.i18n.shareErrorSiyuanTokenMissing || "请先配置思源内核 Token");
        }

        // 1. 导出文档内容
        const content = await this.exportDocContent(options.docId);
        if (!content) {
            throw new Error(this.plugin.i18n.shareErrorExportFailed);
        }

        // 2. 构造请求数据
        const payload = {
            docId: options.docId,
            docTitle: options.docTitle,
            content: content,
            requirePassword: options.requirePassword,
            password: options.requirePassword ? options.password ?? "" : "",
            expireDays: options.expireDays,
            isPublic: options.isPublic,
        };

        // 3. 调用后端 API
        try {
            const response = await this.callShareAPI(config.serverUrl, config.apiToken, payload);
            
            if (response.code !== 0) {
                throw new Error(response.msg || this.plugin.i18n.shareErrorUnknown);
            }

            // 4. 保存分享记录到本地
            const shareData = response.data;
            const record: ShareRecord = {
                id: shareData.shareId,
                docId: shareData.docId || options.docId,
                docTitle: shareData.docTitle || options.docTitle,
                shareUrl: shareData.shareUrl,
                requirePassword: shareData.requirePassword,
                expireAt: new Date(shareData.expireAt).getTime(),
                isPublic: shareData.isPublic,
                createdAt: new Date(shareData.createdAt).getTime(),
                updatedAt: new Date(shareData.updatedAt).getTime(),
                reused: shareData.reused,
            };

            await this.plugin.shareRecordManager.addRecord(record);

            return record;
        } catch (error) {
            console.error("Share creation failed:", error);
            throw error;
        }
    }

    /**
     * 导出文档内容
     */
    private async exportDocContent(docId: string): Promise<string | null> {
        // 短期缓存命中（60s）
        const cached = this.contentCache.get(docId);
        if (cached && Date.now() - cached.ts < 60_000) {
            return cached.content;
        }
        const inflight = this.contentPromiseCache.get(docId);
        if (inflight) return inflight;

        const p = (async (): Promise<string | null> => {
        const config = this.plugin.settings.getConfig();
        
        try {
            // 使用思源内核 Token 调用内部 API
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20_000);
            const response = await fetch("/api/export/exportMdContent", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Token ${config.siyuanToken}`,
                },
                body: JSON.stringify({ id: docId }),
                signal: controller.signal,
            });

            if (!response.ok) {
                console.error("Export failed:", response.status, response.statusText);
                return null;
            }

            const result = await response.json();
            if (result.code === 0 && result.data && result.data.content) {
                // 清理内容中的元数据
                const cleaned = this.cleanMarkdownContent(result.data.content);
                this.contentCache.set(docId, { content: cleaned, ts: Date.now() });
                return cleaned;
            }
            
            return null;
        } catch (error) {
            console.error("Export document failed:", error);
            return null;
        } finally {
            this.contentPromiseCache.delete(docId);
        }
        })();

        this.contentPromiseCache.set(docId, p);
        return p;
    }

    /**
     * 清理 Markdown 内容中的元数据
     */
    private cleanMarkdownContent(content: string): string {
        const lines = content.split('\n');
        const filteredLines: string[] = [];
        let inFrontMatter = false;
        let foundFirstContent = false;
        
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            
            // 检测 YAML front matter 开始/结束
            if (trimmed === '---') {
                if (!foundFirstContent && i === 0) {
                    // 文档开头的 ---，进入 front matter
                    inFrontMatter = true;
                    continue;
                } else if (inFrontMatter) {
                    // front matter 结束
                    inFrontMatter = false;
                    continue;
                }
            }
            
            // 跳过 front matter 内的所有内容
            if (inFrontMatter) {
                continue;
            }
            
            // 跳过独立的元数据行（title:, date:, lastmod: 等）
            if (!foundFirstContent && (
                trimmed.startsWith('title:') || 
                trimmed.startsWith('date:') || 
                trimmed.startsWith('lastmod:'))) {
                continue;
            }
            
            // 跳过文档开头的第一个标题（如果与 docTitle 重复）
            if (!foundFirstContent && trimmed.startsWith('#')) {
                foundFirstContent = true;
                continue;
            }
            
            // 跳过开头的空行
            if (!foundFirstContent && trimmed === '') {
                continue;
            }
            
            foundFirstContent = true;
            filteredLines.push(lines[i]);
        }
        
        return filteredLines.join('\n').trim();
    }

    /**
     * 调用分享 API
     */
    private async callShareAPI(serverUrl: string, apiToken: string, payload: any): Promise<ShareResponse> {
        const base = serverUrl.replace(/\/$/, "");
        try {
            const response = await fetch(`${base}/api/share/create`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiToken}`,
                    // 明确传递 Base URL（后端也会自动推断，双轨兼容）
                    "X-Base-URL": base,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => response.statusText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            return result as ShareResponse;
        } catch (error: any) {
            console.error("API call failed:", error);
            if (error.message) {
                throw new Error(this.plugin.i18n.shareErrorNetworkFailed + ": " + error.message);
            }
            throw new Error(this.plugin.i18n.shareErrorNetworkFailed + ": " + String(error));
        }
    }

    /**
     * 删除分享
     */
    async deleteShare(shareId: string): Promise<void> {
        const config = this.plugin.settings.getConfig();

        if (!config.serverUrl || !config.apiToken) {
            throw new Error(this.plugin.i18n.shareErrorNotConfigured);
        }

        const base = config.serverUrl.replace(/\/$/, "");
        // 调用后端 API 删除分享
        const resp = await fetch(`${base}/api/share/${encodeURIComponent(shareId)}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${config.apiToken}`,
            },
        });
        if (!resp.ok) {
            if (resp.status === 404) {
                await this.plugin.shareRecordManager.removeRecord(shareId);
                return;
            }
            const text = await resp.text();
            console.error("Delete share failed:", resp.status, text);
            throw new Error(this.plugin.i18n.shareErrorNetworkFailed + `: HTTP ${resp.status}`);
        }

        // 从本地记录中删除
        await this.plugin.shareRecordManager.removeRecord(shareId);
    }

    /**
     * 批量删除分享（传入 shareIds 时逐个删除，否则删除全部）
     */
    async deleteShares(shareIds?: string[]): Promise<BatchDeleteShareResponse["data"]> {
        const config = this.plugin.settings.getConfig();

        if (!config.serverUrl || !config.apiToken) {
            throw new Error(this.plugin.i18n.shareErrorNotConfigured);
        }

        const base = config.serverUrl.replace(/\/$/, "");

        const response = await fetch(`${base}/api/share/batch`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.apiToken}`,
            },
            body: shareIds ? JSON.stringify({ shareIds }) : JSON.stringify({ shareIds: [] }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => response.statusText);
            throw new Error(this.plugin.i18n.shareErrorNetworkFailed + `: HTTP ${response.status} ${text}`);
        }

        const result = (await response.json()) as BatchDeleteShareResponse;
        if (result.code !== 0) {
            throw new Error(result.msg || this.plugin.i18n.shareErrorUnknown);
        }

        const data = result.data || {};
        if (shareIds && shareIds.length) {
            const deleted = data.deleted ?? [];
            const notFound = data.notFound ?? [];
            const toRemove = [...deleted, ...notFound];
            if (toRemove.length) {
                await this.plugin.shareRecordManager.removeRecords(toRemove);
            }
        } else {
            await this.plugin.shareRecordManager.clearAll();
        }

        return data;
    }
}
