/**
 * JSON Schema 对象类型描述符
 */
export interface JSONSchema {
    type: string;
    properties?: Record<string, JSONSchema>;
    required?: string[];
    description?: string;
    items?: JSONSchema;
    enum?: unknown[];
    [key: string]: any;
}

/**
 * Tool 接口 — MiniAgent 的核心契约
 *
 * 每个工具必须：
 * 1. 声明自己的名字和用途（供 Claude 理解何时调用它）
 * 2. 声明输入参数的 JSON Schema
 * 3. 实现 call() — 接收 Claude 传来的参数，返回字符串结果
 */
export interface Tool {

    /** 工具名，Claude 用这个名字来调用工具 */
    name: string;

    /** 自然语言描述，告诉 Claude 这个工具能做什么、何时用它 */
    description: string;

    /** 输入参数的 JSON Schema，Claude 按此格式传参 */
    inputSchema: JSONSchema;

    /**
     * 执行工具
     * @param input Claude 传来的参数对象
     * @returns 工具执行结果（字符串），将作为 tool_result 返回给 Claude
     */
    call(input: Record<string, unknown>): Promise<string>;
}

// 重新导出 OpenAI 的消息类型
export type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * 内部使用的消息块类型（用于流式处理）
 * 这些类型用于处理 API 返回的流式响应，最终会转换为 OpenAI 格式的消息
 */
export interface InternalTextBlock {
    type: "text";
    text: string;
}

export interface InternalToolUseBlock {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, unknown>;
}

export interface InternalToolResultBlock {
    type: "tool_result";
    tool_use_id: string;
    content: string;
}

export type InternalContentBlock = InternalTextBlock | InternalToolResultBlock | InternalToolUseBlock;


export type PermissionDecision  = "allow" | "deny";

export interface PermissionRequest {
    toolName: string;
    input: Record<string, unknown>;
    description: string;
}



