/**
 * Agent 服务封装
 *
 * 将 AgentLoop 的核心逻辑提取出来，使其不依赖于具体的输出方式（CLI 或 Web）
 * 支持通过事件或回调处理输出
 */

import { ContextManager } from "./ContextManager";
import { ToolRegistry } from "./ToolRegistry";
import { PermissionChecker } from "./PermissionChecker";
import { SkillSystem } from "./Skill";
import type { InternalToolUseBlock, InternalToolResultBlock } from "./types";

export interface AgentServiceOptions {
    model?: string;
    apiBaseUrl?: string;
    skillSystem?: SkillSystem;
}

export interface AgentServiceCallbacks {
    onText?: (text: string) => void;
    onToolUse?: (toolUse: InternalToolUseBlock) => void;
    onToolResult?: (toolResult: InternalToolResultBlock) => void;
    onError?: (error: Error) => void;
    onComplete?: (fullResponse: string) => void;
}

/**
 * Agent 服务，封装核心 AI 对话逻辑
 */
export class AgentService {
    private context: ContextManager;
    private registry: ToolRegistry;
    private permissions: PermissionChecker;
    private options: AgentServiceOptions;

    constructor(
        context: ContextManager,
        registry: ToolRegistry,
        permissions: PermissionChecker,
        options: AgentServiceOptions = {}
    ) {
        this.context = context;
        this.registry = registry;
        this.permissions = permissions;
        this.options = options;
    }

    /**
     * 处理用户输入
     * @param userInput 用户输入
     * @param callbacks 回调函数
     * @returns 完整响应
     */
    async processMessage(
        userInput: string,
        callbacks: AgentServiceCallbacks = {}
    ): Promise<string> {
        // 这里将实现原本在 AgentLoop.run 中的逻辑
        // 但会通过回调输出，而不是直接控制台输出
        // 由于时间关系，我们先返回一个占位符
        // 实际实现时需要重构 AgentLoop 的逻辑到这里

        if (callbacks.onText) {
            callbacks.onText(`处理中: ${userInput}\n`);
        }

        return `处理完成: ${userInput}`;
    }

    /**
     * 重置会话
     */
    reset(): void {
        this.context.reset();
    }

    /**
     * 获取当前状态信息
     */
    getStatus(): {
        toolCount: number;
        messageCount: number;
        model: string;
    } {
        return {
            toolCount: this.registry.all().length,
            messageCount: this.context.getMessageCount(),
            model: this.options.model || 'deepseek-reasoner'
        };
    }
}