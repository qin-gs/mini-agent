import type { ChatCompletionMessageParam } from "./types";
import type { InternalContentBlock, InternalToolResultBlock, InternalTextBlock, InternalToolUseBlock } from "./types";

/**
 * 上下文管理
 *
 * laude Code 的上下文系统并不是一个扁平的消息列表。它由三个性质不同的层次叠加而成：
 * 1. System Prompt（系统提示） 是 Agent 的"人格"与"能力声明"。它告诉模型自己是谁、有哪些工具可以使用、当前运行的环境是什么。这部分内容在一次对话启动时生成，全程不变。
 * 2. User Context（用户上下文） 是用户提前写好的"给 Agent 的备忘录"。Claude Code 的做法是从文件系统里读取 CLAUDE.md 文件，将它注入到每次对话开头。用户在这里写下自己的编码规范、项目特有的约定、以及希望 Agent 记住的任何偏好。
 * 3. Conversation History（对话历史） 是实际发生的消息流：用户的提问、助手的回复、工具调用请求、工具执行结果。这是唯一会随时间增长的部分，也是上下文管理最复杂的地方。
 *
 * 这三层叠加在一起，构成了模型在每次推理时能"看到"的全部信息。
 *
 * 1. 组装系统提示词
 * 2. 维护消息历史
 * 3. 当 context 过长时进行简单压缩
 */
export class ContextManager {

    private messages: ChatCompletionMessageParam[] = [];

    /**
     * 最大保留的消息轮数（一轮 = user + assistant）
     */
    private readonly maxTurns: number;

    /**
     * 触发压缩的消息数阈值
     */
    private readonly compactionThreshold: number;

    constructor(options: { maxTurns?: number; compactionThreshold?: number }) {
        this.maxTurns = options.maxTurns ?? 20;
        this.compactionThreshold = options.compactionThreshold ?? 40;
    }

    /**
     * 组装系统提示词
     *
     * 按需扩展：工具使用规范、安全指引、工作目录信息、git 状态等
     */
    buildSystemPrompt(): string {
        const now = new Date().toISOString();
        const cwd = process.cwd();

        return `你是 MiniAgent，一个强大的代码助手。你运行在用户的计算机上，可以直接读写文件、执行命令。
                ## 基本信息
                - 当前时间：${now}
                - 工作目录：${cwd}
                - 操作系统：${process.platform}
                
                ## 工具使用原则
                1. 优先使用工具获取真实信息，不要凭记忆猜测文件内容
                2. 读取文件后再修改，不要假设文件结构
                3. 执行破坏性操作前，先确认用户意图
                4. 命令执行失败时，分析错误并尝试修复
                
                ## 回复风格
                - 用中文回复
                - 操作完成后，简洁地告知结果
                - 遇到歧义时，主动询问而不是猜测
                
                ## 安全约束
                - 不执行会损坏系统的命令
                - 不读取明显的敏感文件（/etc/shadow 等）
                - 对于删除操作，始终二次确认`;
    }

    /**
     * 用户消息
     */
    addUserMessage(text: string): void {
        this.messages.push({
            role: "user",
            content: text,
        });
    }

    /**
     * 助手消息
     */
    addAssistantMessage(content: InternalContentBlock[]): void {
        // 分离文本块和工具调用块
        const textBlocks = content.filter((b): b is InternalTextBlock => b.type === 'text');
        const toolUseBlocks = content.filter((b): b is InternalToolUseBlock => b.type === 'tool_use');

        const textContent = textBlocks.map(b => b.text).join('');

        // 构建 OpenAI 格式的助手消息
        const assistantMessage: ChatCompletionMessageParam = {
            role: 'assistant',
            content: textContent || null,
        };

        // 如果有工具调用，添加到消息中
        if (toolUseBlocks.length > 0) {
            assistantMessage.tool_calls = toolUseBlocks.map(tool => ({
                id: tool.id,
                type: 'function' as const,
                function: {
                    name: tool.name,
                    arguments: JSON.stringify(tool.input),
                },
            }));
        }

        this.messages.push(assistantMessage);
    }

    /**
     * 添加工具结果
     */
    addToolResults(results: InternalToolResultBlock[]): void {
        // 每个工具结果创建一个独立的 tool 角色消息
        for (const result of results) {
            this.messages.push({
                role: 'tool',
                content: result.content,
                tool_call_id: result.tool_use_id,
            });
        }
    }

    /**
     * 获取当前所有消息
     */
    getMessages(): ChatCompletionMessageParam[] {
        return this.messages;
    }

    /**
     * 压缩消息
     *
     * 当前实现：对于旧消息中的 tool 角色消息，压缩其内容
     */
    maybeCompact(): boolean {
        if (this.messages.length < this.compactionThreshold) {
            return false;
        }

        const keepFrom = Math.max(0, this.messages.length - this.maxTurns * 2);

        for (let i = 0; i < keepFrom; i++) {
            const msg = this.messages[i];
            // 压缩 tool 消息的内容
            if (msg.role === 'tool' && typeof msg.content === 'string') {
                // 保留消息结构，但缩短内容
                msg.content = '[内容已压缩以节省 context 空间]';
            }
        }
        return true;
    }

    /**
     * 获取当前消息数
     */
    getMessageCount(): number {
        return this.messages.length;
    }
}
