import type SharePlugin from "../index";
import type { ShareRecord } from "../types";

export class ShareRecordManager {
    private plugin: SharePlugin;
    private records: ShareRecord[] = [];
    private syncInterval: number = 5 * 60 * 1000; // 基准 5 分钟
    private syncTimer: number | null = null;
    private syncing = false;

    constructor(plugin: SharePlugin) {
        this.plugin = plugin;
    }

    /**
     * 加载分享记录
     */
    async load(): Promise<void> {
        // 1. 加载本地缓存
        const localRecords = await this.plugin.loadData("share-records");
        if (localRecords && Array.isArray(localRecords)) {
            this.records = localRecords;
        }

        // 2. 从后端同步
        await this.syncFromBackend();
    }

    /**
     * 从后端同步分享记录
     */
    async syncFromBackend(): Promise<void> {
        if (this.syncing) return; // 并发去重
        this.syncing = true;
        const config = this.plugin.settings.getConfig();

        // 如果未配置，跳过同步
        if (!config.serverUrl || !config.apiToken) {
            return;
        }

        try {
            const backendRecords = await this.fetchBackendRecords(config.serverUrl, config.apiToken);
            
            // 合并本地和远程记录，以远程为准
            this.mergeRecords(backendRecords);
            
            // 保存到本地
            await this.saveToLocal();
        } catch (error) {
            console.error("Sync from backend failed:", error);
            // 同步失败不影响使用本地缓存
        } finally {
            this.syncing = false;
        }
    }

    /**
     * 获取所有分享记录
     */
    getRecords(): ShareRecord[] {
        return [...this.records];
    }

    /**
     * 根据文档 ID 获取分享记录
     */
    getRecordByDocId(docId: string): ShareRecord | null {
        return this.records.find(r => r.docId === docId) || null;
    }

    /**
     * 添加分享记录
     */
    async addRecord(record: ShareRecord): Promise<void> {
        // 若存在同文档记录，则替换
        const docIndex = this.records.findIndex(r => r.docId === record.docId);
        if (docIndex >= 0) {
            this.records.splice(docIndex, 1);
        }

        // 检查是否已有同 ID 记录
        const existingIndex = this.records.findIndex(r => r.id === record.id);
        if (existingIndex >= 0) {
            this.records[existingIndex] = record;
        } else {
            this.records.push(record);
        }

        await this.saveToLocal();
    }

    /**
     * 删除分享记录
     */
    async removeRecord(shareId: string): Promise<void> {
        this.records = this.records.filter(r => r.id !== shareId);
        await this.saveToLocal();
    }

    /**
     * 批量删除分享记录
     */
    async removeRecords(shareIds: string[]): Promise<void> {
        if (!shareIds.length) {
            return;
        }
        const idSet = new Set(shareIds);
        this.records = this.records.filter(r => !idSet.has(r.id));
        await this.saveToLocal();
    }

    /**
     * 清空所有分享记录
     */
    async clearAll(): Promise<void> {
        this.records = [];
        await this.saveToLocal();
    }

    /**
     * 清理过期记录
     */
    async cleanExpiredRecords(): Promise<void> {
        const now = Date.now();
        this.records = this.records.filter(r => r.expireAt > now);
        await this.saveToLocal();
    }

    /**
     * 启动自动同步
     */
    startAutoSync(): void {
        if (this.syncTimer) {
            return;
        }
        // 根据前端环境动态调整间隔（移动端更长，并加入抖动避免雪崩）
        const isMobile = (this.plugin as any).isMobile === true;
        const base = isMobile ? this.syncInterval * 3 : this.syncInterval;
        const jitter = Math.floor(Math.random() * 30_000); // ±30s 抖动
        const interval = base + jitter;

        // 首次延迟执行，避免与启动阶段其他请求竞争
        const startDelay = 3_000 + Math.floor(Math.random() * 2_000);
        setTimeout(() => {
            this.syncFromBackend().catch(err => console.error("Auto sync (initial) failed:", err));
        }, startDelay);

        this.syncTimer = setInterval(() => {
            this.syncFromBackend().catch(err => {
                console.error("Auto sync failed:", err);
            });
        }, interval);
    }

    /**
     * 停止自动同步
     */
    stopAutoSync(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    /**
     * 保存到本地
     */
    private async saveToLocal(): Promise<void> {
        await this.plugin.saveData("share-records", this.records);
    }

    /**
     * 从后端获取分享记录（模拟）
     */
    private async fetchBackendRecords(serverUrl: string, apiToken: string): Promise<ShareRecord[]> {
        const base = serverUrl.replace(/\/$/, "");
        try {
            // 分页拉取，直到全部获取或超过安全上限（例如 1000 条）
            const all: ShareRecord[] = [];
            let page = 1;
            const size = 100; // 按后端限制的最大值请求，减少往返
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15_000);
            while (true) {
                const resp = await fetch(`${base}/api/share/list?page=${page}&size=${size}`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${apiToken}`,
                        "X-Base-URL": base,
                    },
                    signal: controller.signal,
                });
                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
                }
                const result = await resp.json();
                if (result.code !== 0) {
                    throw new Error(result.msg || "API error");
                }
                const items = (result.data?.items || []) as any[];
                // 映射为 ShareRecord（缺失内容字段，通过本地结构）
                for (const it of items) {
                    all.push({
                        id: it.id,
                        docId: it.docId,
                        docTitle: it.docTitle,
                        shareUrl: it.shareUrl,
                        requirePassword: it.requirePassword,
                        expireAt: new Date(it.expireAt).getTime(),
                        isPublic: it.isPublic,
                        createdAt: new Date(it.createdAt).getTime(),
                        updatedAt: new Date(it.createdAt).getTime(),
                    });
                }
                const total = result.data?.total || 0;
                if (all.length >= total || all.length >= 1000 || items.length === 0) {
                    break;
                }
                page++;
            }
            clearTimeout(timeout);
            return all;
        } catch (error: any) {
            throw new Error("Network request failed: " + (error?.message || String(error)));
        }
    }

    /**
     * 合并本地和远程记录
     */
    private mergeRecords(backendRecords: ShareRecord[]): void {
        if (backendRecords.length === 0) {
            // 后端无数据，保留本地
            return;
        }

        // 创建后端记录的映射
        const backendMap = new Map<string, ShareRecord>();
        backendRecords.forEach(record => {
            backendMap.set(record.id, record);
        });

        // 合并逻辑：以后端为准，但保留本地独有的记录
        const mergedRecords: ShareRecord[] = [];

        // 添加所有后端记录
        backendRecords.forEach(record => {
            mergedRecords.push(record);
        });

        // 添加本地独有的记录（可能是刚创建还未同步的）
        this.records.forEach(localRecord => {
            if (!backendMap.has(localRecord.id)) {
                // 检查是否是最近创建的（5分钟内）
                if (Date.now() - localRecord.createdAt < 5 * 60 * 1000) {
                    mergedRecords.push(localRecord);
                }
            }
        });

        this.records = mergedRecords;
    }
}
