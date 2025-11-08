import type SharePlugin from "../index";
import type { AssetUploadRecord, DocAssetMapping } from "../types";

const STORAGE_KEY = "asset-mappings";

/**
 * 资源上传记录管理器
 * 负责管理文档与 S3 资源的映射关系
 */
export class AssetRecordManager {
    private plugin: SharePlugin;
    private mappings: Map<string, DocAssetMapping>; // docId -> DocAssetMapping

    constructor(plugin: SharePlugin) {
        this.plugin = plugin;
        this.mappings = new Map();
    }

    /**
     * 加载本地存储的映射记录
     */
    async load(): Promise<void> {
        const data = await this.plugin.loadData(STORAGE_KEY);
        if (data && Array.isArray(data)) {
            data.forEach((mapping: DocAssetMapping) => {
                this.mappings.set(mapping.docId, mapping);
            });
        }
    }

    /**
     * 保存映射记录到本地存储
     */
    async save(): Promise<void> {
        const data = Array.from(this.mappings.values());
        await this.plugin.saveData(STORAGE_KEY, data);
    }

    /**
     * 添加或更新文档的资源映射
     * @param docId 文档ID
     * @param shareId 分享ID
     * @param assets 资源记录列表
     */
    async addOrUpdateMapping(
        docId: string,
        shareId: string,
        assets: AssetUploadRecord[]
    ): Promise<void> {
        const now = Date.now();
        const existing = this.mappings.get(docId);

        if (existing) {
            // 更新现有记录
            existing.shareId = shareId;
            existing.assets = assets;
            existing.updatedAt = now;
        } else {
            // 创建新记录
            const mapping: DocAssetMapping = {
                docId,
                shareId,
                assets,
                createdAt: now,
                updatedAt: now,
            };
            this.mappings.set(docId, mapping);
        }

        await this.save();
    }

    /**
     * 获取文档的资源映射
     */
    getMapping(docId: string): DocAssetMapping | null {
        return this.mappings.get(docId) || null;
    }

    /**
     * 删除文档的资源映射
     */
    async removeMapping(docId: string): Promise<void> {
        this.mappings.delete(docId);
        await this.save();
    }

    /**
     * 根据分享ID删除映射
     */
    async removeMappingByShareId(shareId: string): Promise<void> {
        for (const [docId, mapping] of this.mappings.entries()) {
            if (mapping.shareId === shareId) {
                this.mappings.delete(docId);
            }
        }
        await this.save();
    }

    /**
     * 清空所有映射
     */
    async clearAll(): Promise<void> {
        this.mappings.clear();
        await this.save();
    }

    /**
     * 获取所有映射记录
     */
    getAllMappings(): DocAssetMapping[] {
        return Array.from(this.mappings.values());
    }

    /**
     * 检查资源是否已上传（通过哈希值）
     * @param hash 文件哈希值
     * @returns 已上传的资源记录，如果未找到则返回 null
     */
    findAssetByHash(hash: string): AssetUploadRecord | null {
        for (const mapping of this.mappings.values()) {
            const asset = mapping.assets.find(a => a.hash === hash);
            if (asset) {
                return asset;
            }
        }
        return null;
    }

    /**
     * 检查资源是否已上传（通过本地路径）
     * @param localPath 本地路径
     * @returns 已上传的资源记录，如果未找到则返回 null
     */
    findAssetByLocalPath(localPath: string): AssetUploadRecord | null {
        for (const mapping of this.mappings.values()) {
            const asset = mapping.assets.find(a => a.localPath === localPath);
            if (asset) {
                return asset;
            }
        }
        return null;
    }

    /**
     * 从指定文档中删除单个资源
     * @param docId 文档ID
     * @param s3Key S3对象键名
     * @returns 如果找到并删除返回 true，否则返回 false
     */
    async removeAssetFromDoc(docId: string, s3Key: string): Promise<boolean> {
        const mapping = this.mappings.get(docId);
        if (!mapping) {
            return false;
        }

        const originalLength = mapping.assets.length;
        mapping.assets = mapping.assets.filter(a => a.s3Key !== s3Key);
        
        if (mapping.assets.length === originalLength) {
            return false; // 没有找到该资源
        }

        mapping.updatedAt = Date.now();
        
        // 如果该文档已无资源，删除整个映射
        if (mapping.assets.length === 0) {
            this.mappings.delete(docId);
        }

        await this.save();
        return true;
    }

    /**
     * 批量删除资源（从所有文档中）
     * @param s3Keys S3对象键名列表
     * @returns 删除的资源数量
     */
    async removeAssets(s3Keys: string[]): Promise<number> {
        let removedCount = 0;
        const s3KeySet = new Set(s3Keys);

        for (const [docId, mapping] of this.mappings.entries()) {
            const originalLength = mapping.assets.length;
            mapping.assets = mapping.assets.filter(a => !s3KeySet.has(a.s3Key));
            
            if (mapping.assets.length < originalLength) {
                removedCount += originalLength - mapping.assets.length;
                mapping.updatedAt = Date.now();

                // 如果该文档已无资源，删除整个映射
                if (mapping.assets.length === 0) {
                    this.mappings.delete(docId);
                }
            }
        }

        if (removedCount > 0) {
            await this.save();
        }

        return removedCount;
    }

    /**
     * 根据筛选条件删除资源
     * @param filter 筛选函数
     * @returns 删除的资源键名列表
     */
    async removeAssetsByFilter(
        filter: (asset: AssetUploadRecord, docId: string) => boolean
    ): Promise<string[]> {
        const toRemove: string[] = [];

        for (const [docId, mapping] of this.mappings.entries()) {
            for (const asset of mapping.assets) {
                if (filter(asset, docId)) {
                    toRemove.push(asset.s3Key);
                }
            }
        }

        if (toRemove.length > 0) {
            await this.removeAssets(toRemove);
        }

        return toRemove;
    }
}
