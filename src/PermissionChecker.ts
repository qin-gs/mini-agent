/**
 * 权限管理
 *
 * auto（全允许）
 * ask（总是询问写操作）
 * strict（总是询问）
 */
import {PermissionDecision, PermissionRequest} from "./types";

export type {PermissionDecision, PermissionRequest};
export type AskUserFunction = (request: PermissionRequest, isDangerous: boolean) => Promise<PermissionDecision>;

export class PermissionChecker {
    private mode: "auto" | "ask" | "strict";
    private askUserFn: AskUserFunction;

    /**
     * 只读工具，无需确认
     */
    private readonly readOnlyTools = new Set(["read_file", "grep"])

    /**
     * 危险操作
     */
    private readonly dangerousKeywords = ["rm", "delete", "drop", "truncate"]

    constructor(
        mode: "auto" | "ask" | "strict",
        askUserFn?: AskUserFunction
    ) {
        this.mode = mode;
        this.askUserFn = askUserFn || this.defaultAskUser;
    }

    async check(request: PermissionRequest): Promise<PermissionDecision> {
        // 只读工具 && 非 strict 模式 -> 直接放行
        if (this.mode === "auto"
            && this.readOnlyTools.has(request.toolName)) {
            return "allow";
        }

        // auto 模式：全部放行（适合信任环境）
        if (this.mode === "auto") {
            return "allow";
        }

        // 检查输入是否包含高危关键词
        const inputStr = JSON.stringify(request.input).toUpperCase();
        const isDangerous = this.dangerousKeywords.some(keyword => inputStr.includes(keyword));

        // ask 模式：只读工具放行，写操作和高危操作询问
        if (this.mode === "ask") {
            if (this.readOnlyTools.has(request.toolName)
                && !isDangerous) {
                return "allow";
            }
        }

        // 询问用户
        return this.askUser(request, isDangerous)
    }

    /**
     * 设置询问函数
     */
    setAskUserFn(fn: AskUserFunction): void {
        this.askUserFn = fn;
    }

    /**
     * 默认的命令行询问方式
     */
    private async defaultAskUser(request: PermissionRequest, isDangerous: boolean): Promise<PermissionDecision> {
        const prefix = isDangerous ? "高危操作" : "需要确认";
        console.log(`\n${prefix}: ${request.toolName}`)
        console.log(`描述：${request.description}`);
        console.log(`参数：${JSON.stringify(request.input, null, 2)}`);

        // 如果没有提供询问函数，则默认允许（为了向后兼容）
        return "allow";
    }

    /**
     * 询问用户（使用配置的询问函数）
     */
    private async askUser(request: PermissionRequest, isDangerous: boolean): Promise<PermissionDecision> {
        return this.askUserFn(request, isDangerous);
    }

}
