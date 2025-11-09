export interface S3Config {
    enabled: boolean;
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    customDomain?: string;
    pathPrefix?: string;
    enablePasteUpload?: boolean;  // 启用粘贴上传功能
    /**
     * 存储服务提供商类型：
     * aws: 标准 AWS S3 或兼容（使用 Signature V4）
     * oss: 阿里云 OSS（使用 HMAC-SHA1 简单签名）
     * 为空默认 aws
     */
    provider?: 'aws' | 'oss';
}

export interface ShareOptions {
    docId: string;
    docTitle: string;
    requirePassword: boolean;
    password?: string;
    expireDays: number;
    isPublic: boolean;
}

/**
 * 引用块信息
 */
export interface BlockReference {
    blockId: string;
    content: string;
    displayText?: string;
    refCount?: number;
}

/**
 * 文档内容及其引用块
 */
export interface DocContentWithRefs {
    content: string;
    references: BlockReference[];
}

export interface ShareRecord {
    id: string;
    docId: string;
    docTitle: string;
    shareUrl: string;
    requirePassword: boolean;
    expireAt: number;
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
    viewCount?: number;
    reused?: boolean;
}

export interface ShareResponse {
    code: number;
    msg: string;
    data: {
        shareId: string;
        shareUrl: string;
        docId: string;
        docTitle: string;
        requirePassword: boolean;
        expireAt: string;
        isPublic: boolean;
        createdAt: string;
        updatedAt: string;
        reused: boolean;
    };
}

export interface ShareListResponse {
    code: number;
    msg: string;
    data: {
        shares: ShareRecord[];
    };
}

export interface SiyuanKernelResponse<T = any> {
    code: number;
    msg: string;
    data: T;
}

/**
 * Kramdown API 响应格式
 */
export interface KramdownResponse {
    code: number;
    msg: string;
    data: {
        id: string;
        kramdown: string;
    };
}

/**
 * 块属性查询响应
 */
export interface BlockAttrsResponse {
    code: number;
    msg: string;
    data: Record<string, string>;
}

/**
 * SQL 查询响应
 */
export interface SqlQueryResponse {
    code: number;
    msg: string;
    data: Array<Record<string, any>>;
}

export interface BatchDeleteShareResponseData {
    deleted?: string[];
    notFound?: string[];
    failed?: Record<string, string>;
    deletedAllCount?: number;
}

export interface BatchDeleteShareResponse {
    code: number;
    msg: string;
    data: BatchDeleteShareResponseData;
}

/**
 * 资源上传进度信息
 */
export interface UploadProgress {
    fileName: string;       // 文件名
    current: number;        // 当前已上传字节数
    total: number;          // 总字节数
    percentage: number;     // 百分比 (0-100)
    status: 'pending' | 'uploading' | 'success' | 'error';  // 状态
    error?: string;         // 错误信息
}

/**
 * 上传进度回调
 */
export type UploadProgressCallback = (progress: UploadProgress) => void;

/**
 * 批量上传进度信息
 */
export interface BatchUploadProgress {
    totalFiles: number;     // 总文件数
    completedFiles: number; // 已完成文件数
    currentFile: string;    // 当前处理的文件
    overallProgress: number; // 总体进度 (0-100)
    files: Map<string, UploadProgress>; // 每个文件的进度
}

/**
 * 资源上传记录
 */
export interface AssetUploadRecord {
    localPath: string;     // 本地文件路径（相对于workspace）
    s3Key: string;         // S3存储键名
    s3Url: string;         // S3访问URL
    contentType: string;   // 文件MIME类型
    size: number;          // 文件大小（字节）
    hash: string;          // 文件哈希值（用于去重）
    uploadedAt: number;    // 上传时间戳
}

/**
 * 文档资源映射记录
 */
export interface DocAssetMapping {
    docId: string;
    shareId: string;
    assets: AssetUploadRecord[];
    createdAt: number;
    updatedAt: number;
}
