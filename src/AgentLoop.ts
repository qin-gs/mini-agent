/**
 * 主循环
 */
import Anthropic from "@anthropic-ai/sdk";
import {ContextManager} from "./ContextManager";
import {ToolRegistry} from "./ToolRegistry";
import {PermissionChecker} from "./PermissionChecker";
import {ContentBlock, TextBlock, ToolResultBlock, ToolUseBlock} from "./types";

export class AgentLoop {
    private client: Anthropic;
    private model: string;

    constructor(
        private context: ContextManager,
        private registry: ToolRegistry,
        private permissions: PermissionChecker,
        options: { model?: string } = {}
    ) {
        this.client = new Anthropic();
        this.model = options.model ?? "deepseek";
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

        const stream = await this.client.messages.stream({
            model: this.model,
            max_tokens: 8096,
            system: systemPrompt,
            // TODO 这里格式不对
            // tools: this.registry.toApiFormat(),
            messages: messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
            })) as Anthropic.MessageParam[],
        });

        let currentTextBlock: { type: "text"; text: string } | null = null;
        let currentToolBlock: ToolUseBlock | null = null;
        let currentToolInput = "";

        for await (const event of stream) {
            if (event.type === "content_block_start") {
                if (event.content_block.type === "text") {
                    currentTextBlock = {
                        type: "text",
                        text: "",
                    };
                    currentToolBlock = null;
                } else if (event.content_block.type === "tool_use") {
                    currentToolBlock = {
                        type: "tool_use",
                        id: event.content_block.id,
                        name: event.content_block.name,
                        input: {},
                    };
                    currentToolInput = "";
                    currentTextBlock = null;
                }
            } else if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta" && currentTextBlock) {
                    currentTextBlock.text += event.delta.text;
                    // 实时推送给调用方
                    onText(event.delta.text);
                } else if (event.delta.type === "input_json_delta" && currentToolBlock) {
                    currentToolInput += event.delta.partial_json;
                }
            } else if (event.type === "content_block_stop") {
                if (currentTextBlock) {
                    contentBlocks.push(currentTextBlock);
                    currentTextBlock = null;
                } else if (currentToolBlock) {
                    currentToolBlock.input = JSON.parse(currentToolInput || "{}");
                    contentBlocks.push(currentToolBlock);
                    currentToolBlock = null;
                    currentToolInput = "";
                }
            } else if (event.type === "message_delta") {
                stopReason = event.delta.stop_reason ?? "end_turn";
            }
        }

        return {contentBlocks, stopReason};
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
