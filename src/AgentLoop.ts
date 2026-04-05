/**
 * 主循环
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {ContextManager} from "./ContextManager";
import {ToolRegistry} from "./ToolRegistry";
import {PermissionChecker} from "./PermissionChecker";
import {ContentBlock, TextBlock, ToolResultBlock, ToolUseBlock} from "./types";

export class AgentLoop {
    private client: OpenAI;
    private model: string;

    constructor(
        private context: ContextManager,
        private registry: ToolRegistry,
        private permissions: PermissionChecker,
        options: { model?: string; apiBaseUrl?: string } = {}
    ) {
        this.client = new OpenAI({
            apiKey: process.env.API_KEY || process.env.OPENAI_API_KEY,
            baseURL: options.apiBaseUrl || process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com",
        });
        this.model = options.model ?? "deepseek-reasoner";
    }

    async run(
        userInput: string,
        onText: (delta: string) => void
    ): Promise<string> {

        // 1. 添加用户输入
        this.context.addUserMessage(userInput);

        // 2. 判断是否进行上下文压缩
        if (this.context.maybeCompact()) {
            `\n[系统：已压缩历史消息已节省空间]\n`
        }

        let fullResponse = "";
        let turnCount = 0;
        const MAX_TURNS = 20;

        // 3. agent 开始循环
        while (turnCount < MAX_TURNS) {
            turnCount++;

            // 4. 调用模型，流式返回内容
            const {contentBlocks, stopReason} = await this.callApi(onText);

            // 5. 将模型回复加入历史消息
            this.context.addAssistantMessage(contentBlocks)

            const textContext = contentBlocks
                .filter((b): b is TextBlock => b.type === "text")
                .map(b => b.text)
                .join("");
            fullResponse += textContext;

            // 6. 检查是否结束
            if (stopReason === "end_turn") {
                break;
            }

            if (stopReason === "tool_use") {
                // 7. 找到所有需要调用工具的部分
                const toolUseBlocks = contentBlocks.filter((b): b is ToolUseBlock => b.type === "tool_use");

                if (toolUseBlocks.length === 0) {
                    break;
                }

                // 8. 遍历调用所有工具
                const toolResults = await this.executeTools(toolUseBlocks);

                // 9. 将工具结果加入历史消息，继续循环
                this.context.addToolResults(toolResults);
                continue;
            }

            // 其他原因 -> 退出
            break;

        }

        if (turnCount >= MAX_TURNS) {
            console.log(`\n[景警告：达到最大轮次限制]\n`);
        }

        return fullResponse;
    }

    /**
     * 调用模型，流式返回内容
     */
    private async callApi(onText: (delta: string) => void): Promise<{
        contentBlocks: ContentBlock[];
        stopReason: string;
    }> {
        const messages = this.context.getMessages();
        const systemPrompt = this.context.buildSystemPrompt();

        const contentBlocks: ContentBlock[] = [];
        let stopReason = "end_turn";

        // 转换消息为 OpenAI 格式
        const openAIMessages: ChatCompletionMessageParam[] = [];

        // 添加系统提示
        if (systemPrompt) {
            openAIMessages.push({
                role: 'system',
                content: systemPrompt,
            });
        }

        // 转换历史消息
        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                // 简单文本消息
                openAIMessages.push({
                    role: msg.role,
                    content: msg.content,
                });
            } else if (Array.isArray(msg.content)) {
                // 内容块数组（可能是工具调用或结果）
                // 对于用户消息，合并所有文本块
                if (msg.role === 'user') {
                    const text = msg.content
                        .filter((b): b is TextBlock => b.type === 'text')
                        .map(b => b.text)
                        .join('');
                    openAIMessages.push({
                        role: 'user',
                        content: text,
                    });
                    // 工具结果块转换为 tool 角色消息
                    const toolResults = msg.content.filter((b): b is ToolResultBlock => b.type === 'tool_result');
                    for (const toolResult of toolResults) {
                        openAIMessages.push({
                            role: 'tool',
                            content: toolResult.content,
                            tool_call_id: toolResult.tool_use_id,
                        });
                    }
                } else if (msg.role === 'assistant') {
                    // 助手消息可能包含文本和工具调用
                    const textBlocks = msg.content.filter((b): b is TextBlock => b.type === 'text');
                    const toolUseBlocks = msg.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');

                    const textContent = textBlocks.map(b => b.text).join('');
                    if (textContent) {
                        openAIMessages.push({
                            role: 'assistant',
                            content: textContent,
                        });
                    }

                    if (toolUseBlocks.length > 0) {
                        openAIMessages.push({
                            role: 'assistant',
                            content: null,
                            tool_calls: toolUseBlocks.map(tool => ({
                                id: tool.id,
                                type: 'function' as const,
                                function: {
                                    name: tool.name,
                                    arguments: JSON.stringify(tool.input),
                                },
                            })),
                        });
                    }
                }
            }
        }

        // 获取 OpenAI 格式的工具定义
        const tools = this.registry.toOpenAIFormat();

        // 调用 OpenAI API
        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: openAIMessages,
            tools: tools.length > 0 ? tools : undefined,
            stream: true,
            max_completion_tokens: 8096,
        });

        let currentText = '';
        let currentToolCalls: Map<string, {
            id: string;
            name: string;
            arguments: string;
        }> = new Map();

        for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            const delta = choice.delta;

            // 处理文本增量
            if (delta.content) {
                currentText += delta.content;
                onText(delta.content);
            }

            // 处理工具调用增量
            if (delta.tool_calls) {
                for (const toolCallDelta of delta.tool_calls) {
                    const { index, id, function: funcDelta } = toolCallDelta;

                    if (!currentToolCalls.has(index.toString())) {
                        currentToolCalls.set(index.toString(), {
                            id: id || '',
                            name: '',
                            arguments: '',
                        });
                    }

                    const toolCall = currentToolCalls.get(index.toString())!;
                    if (id) toolCall.id = id;
                    if (funcDelta?.name) toolCall.name += funcDelta.name;
                    if (funcDelta?.arguments) toolCall.arguments += funcDelta.arguments;
                }
            }

            // 检查停止原因并映射到内部格式
            if (choice.finish_reason) {
                // 将 OpenAI 的 finish_reason 映射到内部 stopReason
                if (choice.finish_reason === 'tool_calls') {
                    stopReason = 'tool_use';
                } else if (choice.finish_reason === 'stop') {
                    stopReason = 'end_turn';
                } else {
                    stopReason = choice.finish_reason;
                }
            }
        }

        // 流结束后，构建最终的 contentBlocks
        if (currentText) {
            contentBlocks.push({
                type: 'text',
                text: currentText,
            });
        }

        // 添加工具调用块
        for (const toolCall of currentToolCalls.values()) {
            if (toolCall.name && toolCall.id) {
                try {
                    const input = JSON.parse(toolCall.arguments || '{}');
                    contentBlocks.push({
                        type: 'tool_use',
                        id: toolCall.id,
                        name: toolCall.name,
                        input,
                    });
                } catch (error) {
                    console.error('解析工具调用参数失败:', error);
                }
            }
        }

        return { contentBlocks, stopReason };
    }

    /**
     * 挨个执行工具
     *
     * 执行前进行权限检查
     */
    private async executeTools(toolUseBlocks: ToolUseBlock[]): Promise<ToolResultBlock[]> {
        const results: ToolResultBlock[] = [];

        for (let block of toolUseBlocks) {
            console.log(`\n[工具调用] ${block.name}(${JSON.stringify(block.input)})\n`);

            const tool = this.registry.find(block.name);
            if (!tool) {
                results.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: `错误：工具未找到 ${block.name}`,
                })
                continue;
            }

            // 权限检查
            const decision = await this.permissions.check({
                toolName: tool.name,
                input: block.input,
                description: tool.description,
            });

            if (decision === "deny") {
                results.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: `用户拒绝了此工具调用`,
                });
                console.log(`[权限] 已拒绝 ${block.name}`);
                continue;
            }

            try {
                const result = await tool.call(block.input);
                results.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: result,
                });
                console.log(`[工具结果] ${result.slice(0, 100)}${result.length > 100 ? "..." : ""}`);
            } catch (error) {
                const errorMsg = `工具执行异常：${(error as Error).message};`
                results.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: errorMsg,
                });
                console.error(`[工具异常] ${errorMsg}`);
            }
        }

        return results;
    }
}
