/**
 * 主循环
 *
 * 兼容旧版本 CLI 的包装类，内部使用 AgentCore
 */
import {AgentCore, type AgentCoreCallbacks} from "./AgentCore";
import {ContextManager} from "./ContextManager";
import {ToolRegistry} from "./ToolRegistry";
import {PermissionChecker} from "./PermissionChecker";
import {SkillSystem} from "./Skill";

export class AgentLoop {
    private agentCore: AgentCore;

    constructor(
        private context: ContextManager,
        private registry: ToolRegistry,
        private permissions: PermissionChecker,
        options: { model?: string; apiBaseUrl?: string; skillSystem?: SkillSystem } = {}
    ) {
        this.agentCore = new AgentCore(context, registry, permissions, options);
    }

    async run(
        userInput: string,
        onText: (delta: string) => void
    ): Promise<string> {
        // 将 CLI 的回调转换为 AgentCore 的回调
        const callbacks: AgentCoreCallbacks = {
            onText: onText,
            onSystemMessage: (message) => {
                console.log(message);
            },
            onToolUse: (toolUse) => {
                console.log(`\n[工具调用] ${toolUse.name}(${JSON.stringify(toolUse.input)})\n`);
            },
            onToolResult: (toolResult) => {
                console.log(`[工具结果] ${toolResult.content.slice(0, 100)}${toolResult.content.length > 100 ? "..." : ""}`);
            },
            onError: (error) => {
                console.error(`[错误] ${error.message}`);
            }
        };

        return this.agentCore.run(userInput, callbacks);
    }

    /**
     * 重置上下文
     */
    reset(): void {
        this.agentCore.reset();
    }
}
