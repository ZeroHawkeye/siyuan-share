import type SharePlugin from "../index";

// 定义日志级别常量，使用 const 断言帮助类型收窄
const LEVELS = ["log", "info", "warn", "error", "debug"] as const;
export type LogLevel = typeof LEVELS[number];

export interface LogEntry {
    ts: number; // epoch ms
    level: LogLevel;
    msg: string;
}

const STORAGE_KEY = "plugin-logs";

export class PluginLogger {
    private plugin: SharePlugin;
    private buffer: LogEntry[] = [];
    private maxEntries = 1000;
    private installed = false;
    private original: Partial<Record<LogLevel, (...args:any[])=>void>> = {};

    constructor(plugin: SharePlugin) {
        this.plugin = plugin;
    }

    async load(): Promise<void> {
        try {
            const saved = await this.plugin.loadData(STORAGE_KEY);
            if (Array.isArray(saved)) {
                this.buffer = saved as LogEntry[];
            }
        } catch { /* ignore */ }
    }

    async save(): Promise<void> {
        try {
            await this.plugin.saveData(STORAGE_KEY, this.buffer);
        } catch { /* ignore */ }
    }

    install(): void {
        if (this.installed) return;
        this.installed = true;

        // 代理 console 方法（保持原始调用）
        LEVELS.forEach((lvl) => {
            const originalFn = console[lvl].bind(console) as (...args:any[])=>void;
            this.original[lvl] = originalFn;
            console[lvl] = ((...args: any[]) => {
                try { this.push(lvl, args); } catch { /* ignore */ }
                originalFn(...args);
            }) as typeof console[typeof lvl];
        });

        // 捕获未处理错误
        window.addEventListener("error", (ev) => {
            this.push("error", ["Uncaught Error:", ev.message, ev.error || ""]); 
        });
        window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
            this.push("error", ["Unhandled Rejection:", ev.reason]);
        });
    }

    uninstall(): void {
        if (!this.installed) return;
        this.installed = false;
        (Object.keys(this.original) as Array<keyof typeof this.original>).forEach((k) => {
            if (this.original[k]) {
                (console as any)[k] = this.original[k];
            }
        });
        this.original = {};
    }

    private push(level: LogLevel, args: any[]): void {
        const msg = args.map(a => {
            try {
                if (typeof a === "string") return a;
                if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ""}`;
                return JSON.stringify(a);
            } catch {
                return String(a);
            }
        }).join(" ");

        this.buffer.push({ ts: Date.now(), level, msg });
        if (this.buffer.length > this.maxEntries) {
            this.buffer.splice(0, this.buffer.length - this.maxEntries);
        }
        // 异步落盘，避免频繁 IO 阻塞
        this.save();
    }

    clear(): void {
        this.buffer = [];
        this.save();
    }

    toText(): string {
        return this.buffer.map(e => {
            const t = new Date(e.ts).toISOString();
            return `[${t}] [${e.level.toUpperCase()}] ${e.msg}`;
        }).join("\n");
    }
}
