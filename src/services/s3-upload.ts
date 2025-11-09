import { showMessage } from "siyuan";
import type { AssetUploadRecord, S3Config, UploadProgressCallback } from "../types";

/**
 * S3 上传服务
 * 负责将资源上传到 S3 兼容存储
 */
export class S3UploadService {
    private config: S3Config;

    constructor(config: S3Config) {
        this.config = config;
    }

    /**
     * 上传文件到 S3
     * @param file 文件对象
     * @param localPath 本地路径（用于记录）
     * @param onProgress 进度回调
     * @returns 上传记录
     */
    async uploadFile(
        file: File, 
        localPath: string, 
        onProgress?: UploadProgressCallback,
        precomputedHash?: string
    ): Promise<AssetUploadRecord> {
        if (!this.config.enabled) {
            throw new Error("S3 存储未启用");
        }

        if (!this.validateConfig()) {
            throw new Error("S3 配置不完整");
        }

        // 通知开始
        if (onProgress) {
            onProgress({
                fileName: file.name,
                current: 0,
                total: file.size,
                percentage: 0,
                status: 'pending',
            });
        }

        try {
            // 生成文件哈希（允许外部传入预计算值以复用与去重）
            const hash = precomputedHash || await this.calculateFileHash(file);
            
            // 构造 S3 对象键名
            const timestamp = Date.now();
            const ext = this.getFileExtension(file.name);
            const s3Key = `${this.config.pathPrefix || 'siyuan-share'}/${timestamp}-${hash}${ext}`;

            // 上传到 S3
            if (onProgress) {
                onProgress({
                    fileName: file.name,
                    current: 0,
                    total: file.size,
                    percentage: 0,
                    status: 'uploading',
                });
            }

            const s3Url = await this.performUpload(file, s3Key, onProgress);

            // 上传成功
            if (onProgress) {
                onProgress({
                    fileName: file.name,
                    current: file.size,
                    total: file.size,
                    percentage: 100,
                    status: 'success',
                });
            }

            // 返回上传记录
            return {
                localPath,
                s3Key,
                s3Url,
                contentType: file.type || this.guessContentType(file.name),
                size: file.size,
                hash,
                uploadedAt: timestamp,
            };
        } catch (error) {
            // 上传失败
            if (onProgress) {
                onProgress({
                    fileName: file.name,
                    current: 0,
                    total: file.size,
                    percentage: 0,
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            throw error;
        }
    }

    /**
     * 批量上传文件
     * @param files 文件列表及其本地路径
     * @param onProgress 进度回调
     * @returns 上传记录列表
     */
    async uploadFiles(
        files: Array<{ file: File; localPath: string }>,
        onProgress?: UploadProgressCallback
    ): Promise<AssetUploadRecord[]> {
        const results: AssetUploadRecord[] = [];
        const errors: string[] = [];

        for (const { file, localPath } of files) {
            try {
                const record = await this.uploadFile(file, localPath, onProgress);
                results.push(record);
            } catch (error) {
                console.error(`上传文件失败: ${localPath}`, error);
                errors.push(`${localPath}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        if (errors.length > 0) {
            showMessage(`部分文件上传失败:\n${errors.join('\n')}`, 5000, 'error');
        }

        return results;
    }

    /**
     * 删除 S3 上的单个文件
     * @param s3Key S3 对象键名
     */
    async deleteFile(s3Key: string): Promise<void> {
        if (!this.config.enabled) {
            throw new Error("S3 存储未启用");
        }

        if (!this.validateConfig()) {
            throw new Error("S3 配置不完整");
        }

        try {
            await this.performDelete(s3Key);
        } catch (error) {
            console.error(`删除文件失败: ${s3Key}`, error);
            throw error;
        }
    }

    /**
     * 批量删除 S3 上的文件
     * @param s3Keys S3 对象键名列表
     * @returns 删除结果 { success: 成功删除的键列表, failed: 失败的键列表 }
     */
    async deleteFiles(s3Keys: string[]): Promise<{ success: string[]; failed: string[] }> {
        const success: string[] = [];
        const failed: string[] = [];

        for (const s3Key of s3Keys) {
            try {
                await this.deleteFile(s3Key);
                success.push(s3Key);
            } catch (error) {
                console.error(`删除文件失败: ${s3Key}`, error);
                failed.push(s3Key);
            }
        }

        return { success, failed };
    }

    /**
     * 执行实际的 S3 上传
     */
    private async performUpload(
        file: File, 
        s3Key: string,
        onProgress?: UploadProgressCallback
    ): Promise<string> {
        // 构造 S3 URL
        const endpoint = this.config.endpoint.replace(/^https?:\/\//, '');
        const bucket = this.config.bucket;
        
        // 使用 AWS Signature Version 4
        const url = `https://${bucket}.${endpoint}/${s3Key}`;
        
        // 根据 provider 生成不同的签名头
        const contentType = file.type || this.guessContentType(file.name);
        let headers: Record<string, string>;
        const provider = this.config.provider || 'aws';
        if (provider === 'oss') {
            headers = await this.generateOssHeaders('PUT', s3Key, contentType);
        } else {
            headers = await this.generateSignedHeaders(
                'PUT',
                s3Key,
                contentType,
                file.size
            );
        }

        // 使用 XMLHttpRequest 以支持上传进度（失败后自动回退到 forwardProxy 二段上传）
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const startTs = Date.now();
            const meta = { key: s3Key, size: file.size, name: file.name };
            console.debug('[S3Upload] start', meta, { url });
            
            // 监听上传进度
            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentage = Math.round((e.loaded / e.total) * 100);
                        onProgress({
                            fileName: file.name,
                            current: e.loaded,
                            total: e.total,
                            percentage,
                            status: 'uploading',
                        });
                    }
                });
            }

            // 监听完成
            xhr.addEventListener('load', () => {
                const duration = Date.now() - startTs;
                if (xhr.status >= 200 && xhr.status < 300) {
                    // 返回访问 URL（使用自定义域名或默认 URL）
                    if (this.config.customDomain) {
                        const domain = this.config.customDomain.replace(/\/$/, '');
                        const finalUrl = `${domain}/${s3Key}`;
                        console.debug('[S3Upload] success', { ...meta, duration, status: xhr.status, finalUrl });
                        resolve(finalUrl);
                    } else {
                        console.debug('[S3Upload] success', { ...meta, duration, status: xhr.status, finalUrl: url });
                        resolve(url);
                    }
                } else {
                    console.error('[S3Upload] http-error', { ...meta, status: xhr.status, resp: xhr.responseText, duration });
                    reject(new Error(`S3 上传失败: HTTP ${xhr.status} - ${xhr.responseText}`));
                }
            });

            // 监听错误
            xhr.addEventListener('error', async () => {
                const duration = Date.now() - startTs;
                console.error('[S3Upload] network-error', { ...meta, duration });
                // 尝试使用思源内核 forwardProxy 进行二段上传（规避移动端或小程序环境的直传限制/CORS）
                try {
                    if (onProgress) {
                        onProgress({ fileName: file.name, current: 0, total: file.size, percentage: 0, status: 'uploading' });
                    }
                    const proxiedUrl = await this.uploadViaForwardProxy(file, s3Key, headers, onProgress);
                    resolve(proxiedUrl);
                    return;
                } catch (proxyErr) {
                    reject(proxyErr instanceof Error ? proxyErr : new Error(String(proxyErr)));
                }
            });

            // 监听中止
            xhr.addEventListener('abort', () => {
                const duration = Date.now() - startTs;
                console.warn('[S3Upload] aborted', { ...meta, duration });
                reject(new Error('上传已取消'));
            });

            // 发送请求
            xhr.open('PUT', url, true);
            // 一些兼容性的额外 header（有的 S3 兼容服务对 Content-Length/Date 严格，浏览器无法手动设定 Content-Length）
            
            // 设置请求头
            for (const key in headers) {
                if (headers.hasOwnProperty(key)) {
                    xhr.setRequestHeader(key, headers[key]);
                }
            }

            xhr.send(file);
        });
    }

    /**
     * 通过思源内核 forwardProxy 端点上传文件（后端代签名/代转发）
     * 前端先向目标直传 URL 发起预检失败时回退此策略。
     * 要求内核 Token 已配置。
     */
    private async uploadViaForwardProxy(
        file: File,
        s3Key: string,
        originalHeaders: Record<string, string>,
        onProgress?: UploadProgressCallback
    ): Promise<string> {
        // 构造目标直传 URL 与请求体（多段 FormData）
        const endpoint = this.config.endpoint.replace(/^https?:\/\//, '');
        const bucket = this.config.bucket;
        const url = `https://${bucket}.${endpoint}/${s3Key}`;

        // 将文件作为二进制转发；forwardProxy 要求：url, method, headers, payload(base64)
        const arrayBuf = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuf);
        // 分块转 base64，避免移动端内存/调用栈溢出
        const CHUNK = 0x8000; // 32KB
        let binary = '';
        for (let i = 0; i < uint8.length; i += CHUNK) {
            const slice = uint8.subarray(i, i + CHUNK);
            binary += String.fromCharCode.apply(null, Array.from(slice) as any);
        }
        const base64Payload = btoa(binary);

        // 移除浏览器限制的头（Host 等）
        const safeHeaders: Record<string, string> = {};
        for (const k of Object.keys(originalHeaders)) {
            if (/^host$/i.test(k)) continue;
            safeHeaders[k] = originalHeaders[k];
        }

        // 进度无法真实获取（后端一次性转发），这里模拟分段进度
        if (onProgress) {
            onProgress({ fileName: file.name, current: 0, total: file.size, percentage: 5, status: 'uploading' });
        }
        const configToken = (window as any).sharePlugin?.settings?.getConfig?.().siyuanToken || '';
        if (!configToken) throw new Error('forwardProxy 失败：缺少思源内核 Token');
        const resp = await fetch('/api/network/forwardProxy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${configToken}`,
            },
            body: JSON.stringify({
                url,
                method: 'PUT',
                headers: safeHeaders,
                payload: base64Payload,
                // 额外元数据用于后端可选日志（兼容旧后端忽略）
                meta: { s3Key, size: file.size, contentType: file.type || this.guessContentType(file.name) }
            })
        });
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            const result = await resp.json().catch(()=>({}));
            if (!resp.ok || (typeof result.code !== 'undefined' && result.code !== 0)) {
                throw new Error('forwardProxy 上传失败: ' + (result.msg || `HTTP ${resp.status}`));
            }
        } else if (!resp.ok) {
            throw new Error(`forwardProxy 上传失败: HTTP ${resp.status}`);
        }
        if (onProgress) {
            onProgress({ fileName: file.name, current: file.size, total: file.size, percentage: 100, status: 'success' });
        }
        // 自定义域名处理保持一致
        if (this.config.customDomain) {
            const domain = this.config.customDomain.replace(/\/$/, '');
            return `${domain}/${s3Key}`;
        }
        return url;
    }

    /**
     * 执行实际的 S3 删除
     */
    private async performDelete(s3Key: string): Promise<void> {
        // 构造 S3 URL
        const endpoint = this.config.endpoint.replace(/^https?:\/\//, '');
        const bucket = this.config.bucket;
        const url = `https://${bucket}.${endpoint}/${s3Key}`;
        
        const provider = this.config.provider || 'aws';
        let headers: Record<string, string>;
        if (provider === 'oss') {
            headers = await this.generateOssHeaders('DELETE', s3Key, '');
        } else {
            headers = await this.generateSignedHeaders(
                'DELETE',
                s3Key,
                '',
                0
            );
        }

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else if (xhr.status === 404) {
                    // 文件不存在，视为删除成功
                    resolve();
                } else {
                    reject(new Error(`S3 删除失败: HTTP ${xhr.status} - ${xhr.responseText}`));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('网络错误，删除失败'));
            });

            xhr.open('DELETE', url);
            
            for (const key in headers) {
                if (headers.hasOwnProperty(key)) {
                    xhr.setRequestHeader(key, headers[key]);
                }
            }

            xhr.send();
        });
    }

    /**
     * 生成 AWS Signature V4 签名头
     */
    private async generateSignedHeaders(
        method: string,
        key: string,
        contentType: string,
        contentLength: number
    ): Promise<Record<string, string>> {
        const now = new Date();
        const dateStamp = this.formatDateStamp(now);
        const amzDate = this.formatAmzDate(now);
        const endpoint = this.config.endpoint.replace(/^https?:\/\//, '');
        const bucket = this.config.bucket;
        // 按照 AWS Signature V4 规范，Host 头需要参与签名（浏览器自动发送 Host，无需手动设置）
        const host = `${bucket}.${endpoint}`;

        // 步骤 1: 创建规范化请求
        const payloadHash = 'UNSIGNED-PAYLOAD';
        
        // 规范化 URI（需要编码）
        const canonicalUri = '/' + key.split('/').map(part => encodeURIComponent(part)).join('/');
        
        // 规范化查询字符串（空）
        const canonicalQueryString = '';
        
        // 规范化头部（按字母序排序：host, x-amz-content-sha256, x-amz-date）
        const canonicalHeaders = `host:${host}\n` +
            `x-amz-content-sha256:${payloadHash}\n` +
            `x-amz-date:${amzDate}\n`;
        
        // 已签名的头部列表（与 canonicalHeaders 对应顺序）
        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
        
        // 规范化请求
        const canonicalRequest = 
            `${method}\n` +
            `${canonicalUri}\n` +
            `${canonicalQueryString}\n` +
            `${canonicalHeaders}\n` +
            `${signedHeaders}\n` +
            `${payloadHash}`;

        // 步骤 2: 创建待签名字符串
        const algorithm = 'AWS4-HMAC-SHA256';
        const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
        
        // 计算规范化请求的哈希
        const canonicalRequestHash = await this.sha256(canonicalRequest);
        
        const stringToSign = 
            `${algorithm}\n` +
            `${amzDate}\n` +
            `${credentialScope}\n` +
            `${canonicalRequestHash}`;

        // 步骤 3: 计算签名
        const signingKey = await this.getSignatureKey(
            this.config.secretAccessKey,
            dateStamp,
            this.config.region,
            's3'
        );
        
        const signature = await this.hmacSha256Hex(signingKey, stringToSign);

        // 步骤 4: 构造 Authorization 头部
        const authorizationHeader = 
            `${algorithm} ` +
            `Credential=${this.config.accessKeyId}/${credentialScope}, ` +
            `SignedHeaders=${signedHeaders}, ` +
            `Signature=${signature}`;

        // 返回所有必需的头部
        return {
            'Content-Type': contentType,
            'x-amz-date': amzDate,
            'x-amz-content-sha256': payloadHash,
            // 不返回 Host：浏览器环境无法主动设置该保留头，但它已被签名
            'Authorization': authorizationHeader,
        };
    }

    /**
     * 生成阿里云 OSS 简单签名头（HMAC-SHA1）
     * 参考：https://help.aliyun.com/zh/oss/developer-reference/signature-methods
     * 与 AWS V4 不同，OSS 这里仅使用简单签名，降低跨域预检复杂度
     */
    private async generateOssHeaders(
        method: string,
        key: string,
        contentType: string
    ): Promise<Record<string, string>> {
        const endpoint = this.config.endpoint.replace(/^https?:\/\//, '');
        const bucket = this.config.bucket;
        const resource = `/${bucket}/${key}`;
        const date = new Date().toUTCString();
        const contentMD5 = '';
        const canonicalizedOSSHeaders = '';
        const stringToSign = [
            method,
            contentMD5,
            contentType,
            date,
            canonicalizedOSSHeaders + resource
        ].join('\n');
        const signature = await this.hmacSha1Base64(this.config.secretAccessKey, stringToSign);
        return {
            'Date': date,
            'Content-Type': contentType || 'application/octet-stream',
            'Authorization': `OSS ${this.config.accessKeyId}:${signature}`,
        };
    }

    /**
     * HMAC-SHA1 计算并返回 Base64 签名（用于 OSS）
     */
    private async hmacSha1Base64(secret: string, message: string): Promise<string> {
        const enc = new TextEncoder();
        const keyData = enc.encode(secret);
        const msgData = enc.encode(message);
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        );
        const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
        // 转 Base64
        const bytes = Array.from(new Uint8Array(sigBuf));
        const binary = bytes.map(b => String.fromCharCode(b)).join('');
        // 浏览器有 btoa
        return btoa(binary);
    }

    /**
     * 计算 SHA256 哈希（十六进制字符串）
     */
    private async sha256(message: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => {
            const hex = b.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    /**
     * HMAC-SHA256 计算（返回 ArrayBuffer）
     */
    private async hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
        const encoder = new TextEncoder();
        const messageData = encoder.encode(message);
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        return await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    }

    /**
     * HMAC-SHA256 计算（返回十六进制字符串）
     */
    private async hmacSha256Hex(key: ArrayBuffer, message: string): Promise<string> {
        const signature = await this.hmacSha256(key, message);
        const signatureArray = Array.from(new Uint8Array(signature));
        return signatureArray.map(b => {
            const hex = b.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    /**
     * 生成签名密钥
     */
    private async getSignatureKey(
        secretKey: string,
        dateStamp: string,
        regionName: string,
        serviceName: string
    ): Promise<ArrayBuffer> {
        const encoder = new TextEncoder();
        const kDate = await this.hmacSha256(encoder.encode('AWS4' + secretKey), dateStamp);
        const kRegion = await this.hmacSha256(kDate, regionName);
        const kService = await this.hmacSha256(kRegion, serviceName);
        const kSigning = await this.hmacSha256(kService, 'aws4_request');
        return kSigning;
    }

    /**
     * 计算文件哈希值
     */
    private async calculateFileHash(file: File): Promise<string> {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => {
            const hex = b.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
        return hashHex.substring(0, 16); // 使用前 16 个字符
    }

    /**
     * 公开的哈希计算方法，供去重调用
     */
    public async calculateFileHashPublic(file: File): Promise<string> {
        return this.calculateFileHash(file);
    }

    /**
     * 获取文件扩展名
     */
    private getFileExtension(filename: string): string {
        const lastDot = filename.lastIndexOf('.');
        return lastDot > 0 ? filename.substring(lastDot) : '';
    }

    /**
     * 猜测内容类型
     */
    private guessContentType(filename: string): string {
        const ext = this.getFileExtension(filename).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.pdf': 'application/pdf',
            '.mp4': 'video/mp4',
            '.mp3': 'audio/mpeg',
            '.zip': 'application/zip',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    /**
     * 格式化日期戳 (YYYYMMDD)
     */
    private formatDateStamp(date: Date): string {
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        const monthStr = month < 10 ? '0' + month : String(month);
        const dayStr = day < 10 ? '0' + day : String(day);
        return `${year}${monthStr}${dayStr}`;
    }

    /**
     * 格式化 AMZ 日期 (YYYYMMDD'T'HHMMSS'Z')
     */
    private formatAmzDate(date: Date): string {
        const dateStamp = this.formatDateStamp(date);
        const hours = date.getUTCHours();
        const minutes = date.getUTCMinutes();
        const seconds = date.getUTCSeconds();
        const hoursStr = hours < 10 ? '0' + hours : String(hours);
        const minutesStr = minutes < 10 ? '0' + minutes : String(minutes);
        const secondsStr = seconds < 10 ? '0' + seconds : String(seconds);
        return `${dateStamp}T${hoursStr}${minutesStr}${secondsStr}Z`;
    }

    /**
     * 验证配置完整性
     */
    private validateConfig(): boolean {
        return !!(
            this.config.enabled &&
            this.config.endpoint &&
            this.config.region &&
            this.config.bucket &&
            this.config.accessKeyId &&
            this.config.secretAccessKey
        );
    }
}
