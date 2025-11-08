import { Setting } from "siyuan";
import { ShareListDialog } from "./components/share-list";
import type SharePlugin from "./index";
import type { S3Config } from "./types";

export interface ShareConfig {
    serverUrl: string;
    apiToken: string;
    siyuanToken: string;
    defaultPassword: boolean;
    defaultExpireDays: number;
    defaultPublic: boolean;
    s3: S3Config;
}

export const DEFAULT_CONFIG: ShareConfig = {
    serverUrl: "",
    apiToken: "",
    siyuanToken: "",
    defaultPassword: false,
    defaultExpireDays: 7,
    defaultPublic: true,
    s3: {
        enabled: false,
        endpoint: "",
        region: "",
        bucket: "",
        accessKeyId: "",
        secretAccessKey: "",
        customDomain: "",
        pathPrefix: "siyuan-share",
    },
};

export class ShareSettings {
    private plugin: SharePlugin;
    private config: ShareConfig;

    constructor(plugin: SharePlugin) {
        this.plugin = plugin;
        this.config = { ...DEFAULT_CONFIG };
    }

    async load(): Promise<void> {
        const savedConfig = await this.plugin.loadData("share-config");
        if (savedConfig) {
            this.config = { ...DEFAULT_CONFIG, ...savedConfig };
        }
    }

    async save(): Promise<void> {
        await this.plugin.saveData("share-config", this.config);
    }

    getConfig(): ShareConfig {
        return { ...this.config };
    }

    updateConfig(config: Partial<ShareConfig>): void {
        this.config = { ...this.config, ...config };
    }

    createSettingPanel(): Setting {
        // 创建输入元素
        const serverUrlInput = document.createElement("input");
        serverUrlInput.className = "b3-text-field fn__block";
        serverUrlInput.placeholder = "https://share.example.com";
        serverUrlInput.value = this.config.serverUrl;
        
        const apiTokenInput = document.createElement("input");
        apiTokenInput.className = "b3-text-field fn__block";
        apiTokenInput.type = "password";
        apiTokenInput.placeholder = this.plugin.i18n.settingApiTokenPlaceholder;
        apiTokenInput.value = this.config.apiToken;
        
        const siyuanTokenInput = document.createElement("input");
        siyuanTokenInput.className = "b3-text-field fn__block";
        siyuanTokenInput.type = "password";
        siyuanTokenInput.placeholder = this.plugin.i18n.settingSiyuanTokenPlaceholder || "思源笔记内核 API Token";
        siyuanTokenInput.value = this.config.siyuanToken;
        
        const defaultPasswordCheckbox = document.createElement("input");
        defaultPasswordCheckbox.type = "checkbox";
        defaultPasswordCheckbox.className = "b3-switch fn__flex-center";
        defaultPasswordCheckbox.checked = this.config.defaultPassword;
        
        const defaultExpireInput = document.createElement("input");
        defaultExpireInput.className = "b3-text-field fn__block";
        defaultExpireInput.type = "number";
        defaultExpireInput.min = "1";
        defaultExpireInput.max = "365";
        defaultExpireInput.value = this.config.defaultExpireDays.toString();
        
        const defaultPublicCheckbox = document.createElement("input");
        defaultPublicCheckbox.type = "checkbox";
        defaultPublicCheckbox.className = "b3-switch fn__flex-center";
        defaultPublicCheckbox.checked = this.config.defaultPublic;

        // S3 配置输入元素
        const s3EnabledCheckbox = document.createElement("input");
        s3EnabledCheckbox.type = "checkbox";
        s3EnabledCheckbox.className = "b3-switch fn__flex-center";
        s3EnabledCheckbox.checked = this.config.s3.enabled;

        const s3EndpointInput = document.createElement("input");
        s3EndpointInput.className = "b3-text-field fn__block";
        s3EndpointInput.placeholder = "s3.amazonaws.com";
        s3EndpointInput.value = this.config.s3.endpoint;

        const s3RegionInput = document.createElement("input");
        s3RegionInput.className = "b3-text-field fn__block";
        s3RegionInput.placeholder = "us-east-1";
        s3RegionInput.value = this.config.s3.region;

        const s3BucketInput = document.createElement("input");
        s3BucketInput.className = "b3-text-field fn__block";
        s3BucketInput.placeholder = "my-bucket";
        s3BucketInput.value = this.config.s3.bucket;

        const s3AccessKeyInput = document.createElement("input");
        s3AccessKeyInput.className = "b3-text-field fn__block";
        s3AccessKeyInput.type = "password";
        s3AccessKeyInput.placeholder = "Access Key ID";
        s3AccessKeyInput.value = this.config.s3.accessKeyId;

        const s3SecretKeyInput = document.createElement("input");
        s3SecretKeyInput.className = "b3-text-field fn__block";
        s3SecretKeyInput.type = "password";
        s3SecretKeyInput.placeholder = "Secret Access Key";
        s3SecretKeyInput.value = this.config.s3.secretAccessKey;

        const s3CustomDomainInput = document.createElement("input");
        s3CustomDomainInput.className = "b3-text-field fn__block";
        s3CustomDomainInput.placeholder = "https://cdn.example.com";
        s3CustomDomainInput.value = this.config.s3.customDomain || "";

        const s3PathPrefixInput = document.createElement("input");
        s3PathPrefixInput.className = "b3-text-field fn__block";
        s3PathPrefixInput.placeholder = "siyuan-share";
        s3PathPrefixInput.value = this.config.s3.pathPrefix || "";

        const setting = new Setting({
            confirmCallback: async () => {
                // 保存配置
                this.config.serverUrl = serverUrlInput.value.trim();
                this.config.apiToken = apiTokenInput.value.trim();
                this.config.siyuanToken = siyuanTokenInput.value.trim();
                this.config.defaultPassword = defaultPasswordCheckbox.checked;
                this.config.defaultExpireDays = parseInt(defaultExpireInput.value) || 7;
                this.config.defaultPublic = defaultPublicCheckbox.checked;
                
                // 保存 S3 配置
                this.config.s3.enabled = s3EnabledCheckbox.checked;
                this.config.s3.endpoint = s3EndpointInput.value.trim();
                this.config.s3.region = s3RegionInput.value.trim();
                this.config.s3.bucket = s3BucketInput.value.trim();
                this.config.s3.accessKeyId = s3AccessKeyInput.value.trim();
                this.config.s3.secretAccessKey = s3SecretKeyInput.value.trim();
                this.config.s3.customDomain = s3CustomDomainInput.value.trim();
                this.config.s3.pathPrefix = s3PathPrefixInput.value.trim();
                
                await this.save();
            }
        });

        // 添加侧边菜单
        this.addGeneralTab(setting, serverUrlInput, apiTokenInput, siyuanTokenInput, defaultPasswordCheckbox, defaultExpireInput, defaultPublicCheckbox);
        this.addS3Tab(setting, s3EnabledCheckbox, s3EndpointInput, s3RegionInput, s3BucketInput, s3AccessKeyInput, s3SecretKeyInput, s3CustomDomainInput, s3PathPrefixInput);

        return setting;
    }

    private addGeneralTab(
        setting: Setting,
        serverUrlInput: HTMLInputElement,
        apiTokenInput: HTMLInputElement,
        siyuanTokenInput: HTMLInputElement,
        defaultPasswordCheckbox: HTMLInputElement,
        defaultExpireInput: HTMLInputElement,
        defaultPublicCheckbox: HTMLInputElement
    ): void {
        // 创建常规设置标签页
        setting.addItem({
            title: "⚙️ " + (this.plugin.i18n.settingTabGeneral || "常规设置"),
            createActionElement: () => {
                const element = document.createElement("div");
                return element;
            },
        });
        
        // 服务端 URL
        setting.addItem({
            title: this.plugin.i18n.settingServerUrl,
            description: this.plugin.i18n.settingServerUrlDesc,
            createActionElement: () => serverUrlInput,
        });

        // API Token
        setting.addItem({
            title: this.plugin.i18n.settingApiToken,
            description: this.plugin.i18n.settingApiTokenDesc,
            createActionElement: () => apiTokenInput,
        });

        // 思源内核 Token
        setting.addItem({
            title: this.plugin.i18n.settingSiyuanToken || "思源内核 Token",
            description: this.plugin.i18n.settingSiyuanTokenDesc || "用于调用思源笔记内部 API 的认证令牌（设置 -> 关于 -> API token）",
            createActionElement: () => siyuanTokenInput,
        });

        // 测试连接按钮
        const testButton = document.createElement("button");
        testButton.className = "b3-button b3-button--outline fn__block";
        testButton.textContent = this.plugin.i18n.settingTestConnection;
        testButton.addEventListener("click", async () => {
            testButton.disabled = true;
            testButton.textContent = this.plugin.i18n.testConnectionTesting;
            
            try {
                // 使用输入框的当前值进行测试,而不是已保存的配置
                const testConfig = {
                    serverUrl: serverUrlInput.value.trim(),
                    apiToken: apiTokenInput.value.trim(),
                    siyuanToken: siyuanTokenInput.value.trim(),
                };
                const result = await this.testConnection(testConfig);
                if (result.success) {
                    this.plugin.showMessage(this.plugin.i18n.testConnectionSuccess + "\n" + result.message, 4000);
                } else {
                    this.plugin.showMessage(this.plugin.i18n.testConnectionFailed + "\n" + result.message, 6000, "error");
                }
            } catch (error: any) {
                this.plugin.showMessage(this.plugin.i18n.testConnectionFailed + ": " + error.message, 5000, "error");
            } finally {
                testButton.disabled = false;
                testButton.textContent = this.plugin.i18n.settingTestConnection;
            }
        });

        setting.addItem({
            title: this.plugin.i18n.settingTestConnection,
            description: this.plugin.i18n.settingTestConnectionDesc,
            createActionElement: () => testButton,
        });

        // 默认启用密码保护
        setting.addItem({
            title: this.plugin.i18n.settingDefaultPassword,
            description: this.plugin.i18n.settingDefaultPasswordDesc,
            createActionElement: () => defaultPasswordCheckbox,
        });

        // 默认有效期（天）
        setting.addItem({
            title: this.plugin.i18n.settingDefaultExpire,
            description: this.plugin.i18n.settingDefaultExpireDesc,
            createActionElement: () => defaultExpireInput,
        });

        // 默认公开分享
        setting.addItem({
            title: this.plugin.i18n.settingDefaultPublic,
            description: this.plugin.i18n.settingDefaultPublicDesc,
            createActionElement: () => defaultPublicCheckbox,
        });

        // 查看全部分享按钮
        const viewSharesButton = document.createElement("button");
        viewSharesButton.className = "b3-button b3-button--outline fn__block";
        viewSharesButton.innerHTML = `
            <svg class="b3-button__icon"><use xlink:href="#iconShare"></use></svg>
            ${this.plugin.i18n.shareListTitle || "全部分享"}
        `;
        viewSharesButton.addEventListener("click", async () => {
            // 检查配置
            if (!this.isConfigured()) {
                this.plugin.showMessage(
                    this.plugin.i18n.shareErrorNotConfigured || "请先配置服务器信息",
                    3000,
                    "error"
                );
                return;
            }
            
            // 弹出分享列表对话框
            const shareListDialog = new ShareListDialog(this.plugin);
            await shareListDialog.show();
        });

        setting.addItem({
            title: this.plugin.i18n.shareListTitle || "全部分享",
            description: this.plugin.i18n.shareListViewDesc || "查看和管理所有已创建的分享链接",
            createActionElement: () => viewSharesButton,
        });
    }

    private addS3Tab(
        setting: Setting,
        s3EnabledCheckbox: HTMLInputElement,
        s3EndpointInput: HTMLInputElement,
        s3RegionInput: HTMLInputElement,
        s3BucketInput: HTMLInputElement,
        s3AccessKeyInput: HTMLInputElement,
        s3SecretKeyInput: HTMLInputElement,
        s3CustomDomainInput: HTMLInputElement,
        s3PathPrefixInput: HTMLInputElement
    ): void {
        // 创建 S3 设置标签页
        setting.addItem({
            title: "☁️ " + (this.plugin.i18n.settingTabS3 || "S3 存储配置"),
            createActionElement: () => {
                const element = document.createElement("div");
                return element;
            },
        });

        // 启用 S3
        setting.addItem({
            title: this.plugin.i18n.settingS3Enabled || "启用 S3 存储",
            description: this.plugin.i18n.settingS3EnabledDesc || "开启后将图片和附件上传到 S3 兼容存储，提升分享访问速度",
            createActionElement: () => s3EnabledCheckbox,
        });

        // S3 端点
        setting.addItem({
            title: this.plugin.i18n.settingS3Endpoint || "S3 端点地址",
            description: this.plugin.i18n.settingS3EndpointDesc || "S3 兼容服务的端点，如 s3.amazonaws.com 或自建 MinIO 地址",
            createActionElement: () => s3EndpointInput,
        });

        // S3 区域
        setting.addItem({
            title: this.plugin.i18n.settingS3Region || "区域 (Region)",
            description: this.plugin.i18n.settingS3RegionDesc || "存储桶所在区域，如 us-east-1",
            createActionElement: () => s3RegionInput,
        });

        // S3 存储桶
        setting.addItem({
            title: this.plugin.i18n.settingS3Bucket || "存储桶 (Bucket)",
            description: this.plugin.i18n.settingS3BucketDesc || "用于存储分享资源的存储桶名称",
            createActionElement: () => s3BucketInput,
        });

        // Access Key ID
        setting.addItem({
            title: this.plugin.i18n.settingS3AccessKey || "Access Key ID",
            description: this.plugin.i18n.settingS3AccessKeyDesc || "S3 访问密钥 ID（仅保存在本机）",
            createActionElement: () => s3AccessKeyInput,
        });

        // Secret Access Key
        setting.addItem({
            title: this.plugin.i18n.settingS3SecretKey || "Secret Access Key",
            description: this.plugin.i18n.settingS3SecretKeyDesc || "S3 访问密钥（仅保存在本机）",
            createActionElement: () => s3SecretKeyInput,
        });

        // 自定义域名
        setting.addItem({
            title: this.plugin.i18n.settingS3CustomDomain || "自定义 CDN 域名",
            description: this.plugin.i18n.settingS3CustomDomainDesc || "可选，使用自定义域名访问资源，如 https://cdn.example.com",
            createActionElement: () => s3CustomDomainInput,
        });

        // 路径前缀
        setting.addItem({
            title: this.plugin.i18n.settingS3PathPrefix || "路径前缀",
            description: this.plugin.i18n.settingS3PathPrefixDesc || "存储对象的路径前缀，用于组织文件结构",
            createActionElement: () => s3PathPrefixInput,
        });
    }

    isConfigured(): boolean {
        return !!(this.config.serverUrl && this.config.apiToken && this.config.siyuanToken);
    }

    /**
     * 测试连接
     * @param testConfig 可选的测试配置,如果不提供则使用当前保存的配置
     */
    async testConnection(testConfig?: { serverUrl: string; apiToken: string; siyuanToken: string }): Promise<{ success: boolean; message: string }> {
        const config = testConfig || this.config;
        const results: string[] = [];
        let hasError = false;

        // 1. 测试后端 API Token（优先使用需要认证的 /api/auth/health，若不存在再回退公开 /api/health）
        if (!config.serverUrl || !config.apiToken) {
            results.push("❌ " + this.plugin.i18n.testBackendFailed + ": 配置缺失");
            hasError = true;
        } else {
            const base = config.serverUrl.replace(/\/$/, "");
            const authHealth = `${base}/api/auth/health`;
            const publicHealth = `${base}/api/health`;

            const fetchWithToken = async (url: string) => {
                return fetch(url, {
                    method: "GET",
                    headers: { "Authorization": `Bearer ${config.apiToken}` },
                });
            };

            try {
                let response = await fetchWithToken(authHealth);
                let usedAuthEndpoint = true;

                // 回退：404 或 405 说明旧版本后端可能没有 /auth/health
                if (response.status === 404 || response.status === 405) {
                    usedAuthEndpoint = false;
                    response = await fetchWithToken(publicHealth);
                }

                if (response.status === 401 || response.status === 403) {
                    results.push("❌ " + this.plugin.i18n.testBackendFailed + ": Token 无效或未授权");
                    hasError = true;
                } else if (!response.ok) {
                    const errorText = await response.text().catch(() => response.statusText);
                    results.push(`❌ ${this.plugin.i18n.testBackendFailed}: HTTP ${response.status} - ${errorText}`);
                    hasError = true;
                } else {
                    // 解析 JSON
                    let json: any = null;
                    try { json = await response.json(); } catch { json = {}; }

                    if (usedAuthEndpoint) {
                        // 认证端点必须返回 code===0 才视为成功
                        if (json && json.code === 0) {
                            const userID = json?.data?.userID || "unknown";
                            results.push(`✅ ${this.plugin.i18n.testBackendSuccess} (用户: ${userID})`);
                        } else {
                            results.push(`❌ ${this.plugin.i18n.testBackendFailed}: 返回格式异常或 code!=0`);
                            hasError = true;
                        }
                    } else {
                        // 公开端点无法验证 Token，只提示回退结果
                        results.push(`⚠️ ${this.plugin.i18n.testBackendFailed}: 后端缺少 /api/auth/health，已回退公开健康检查，无法校验 Token 有效性`);
                        hasError = true; // 标记为失败避免误判
                    }
                }
            } catch (error: any) {
                results.push(`❌ ${this.plugin.i18n.testBackendFailed}: ${error.message}`);
                hasError = true;
            }
        }

        // 2. 测试思源内核 API Token
        if (!config.siyuanToken) {
            results.push("❌ " + this.plugin.i18n.testSiyuanFailed + ": Token 缺失");
            hasError = true;
        } else {
            try {
                const response = await fetch("/api/system/version", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Token ${config.siyuanToken}`,
                    },
                    body: JSON.stringify({}),
                });

                if (response.status === 401 || response.status === 403) {
                    // Token 无效
                    results.push("❌ " + this.plugin.i18n.testSiyuanFailed + ": Token 无效");
                    hasError = true;
                } else if (!response.ok) {
                    results.push(`❌ ${this.plugin.i18n.testSiyuanFailed}: HTTP ${response.status}`);
                    hasError = true;
                } else {
                    const result = await response.json();
                    if (result.code !== 0) {
                        results.push(`❌ ${this.plugin.i18n.testSiyuanFailed}: ${result.msg || '未知错误'}`);
                        hasError = true;
                    } else {
                        results.push(`✅ ${this.plugin.i18n.testSiyuanSuccess} (版本: ${result.data || 'unknown'})`);
                    }
                }
            } catch (error: any) {
                results.push(`❌ ${this.plugin.i18n.testSiyuanFailed}: ${error.message}`);
                hasError = true;
            }
        }

        return {
            success: !hasError,
            message: results.join("\n"),
        };
    }
}
