/**
 * 权限管理
 *
 * auto（全允许）
 * ask（总是询问写操作）
 * strict（总是询问）
 */
import * as readline from "readline";
import {PermissionDecision, PermissionRequest} from "./types";

export class PermissionChecker {
    private mode: "auto" | "ask" | "strict";
    private rl: readline.Interface;

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
        rl: readline.Interface
    ) {
        this.mode = mode;
        this.rl = rl;
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

    private async askUser(request: PermissionRequest, isDangerous: boolean): Promise<PermissionDecision> {
        const prefix = isDangerous ? "高危操作" : "需要确认";
        console.log(`\n${prefix}: ${request.toolName}`)
        console.log(`描述：${request.description}`);
        console.log(`参数：${JSON.stringify(request.input, null, 2)}`);

        return new Promise<PermissionDecision>((resolve) => {
            this.rl.question("允许执行? [y/N] ", (answer) => {
                const decision = answer.toLowerCase() === "y" ? "allow" : "deny";
                resolve(decision);
            });
        });
    }

}
