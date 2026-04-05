import {Tool, JSONSchema} from "./types";

/**
 * 注册工具
 */
export class ToolRegistry {

    private tools = new Map<string, Tool>();

    /**
     * 注册工具
     */
    register(tool: Tool): this {
        if (this.tools.has(tool.name)) {
            throw new Error(`工具 ${tool.name} 已经注册过了`);
        }
        this.tools.set(tool.name, tool);
        return this;
    }

    /**
     * 批量注册
     */
    registerAll(tools: Tool[]): this {
        for (const tool of tools) {
            this.register(tool);
        }
        return this;
    }

    /**
     * 按名字查找工具
     */
    find(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /**
     * 获取所有工具
     */
    all(): Tool[] {
        return Array.from(this.tools.values());
    }

    /**
     * 将工具列表转为 Anthropic API 格式
     */
    toApiFormat(): Array<{
        name: string;
        description: string;
        input_schema: JSONSchema & { type: "object" };
    }> {
        return this.all().map(tool => {
            // 确保工具输入模式是对象类型
            if (tool.inputSchema.type !== "object") {
                throw new Error(`工具 ${tool.name} 的输入模式类型必须是 "object"，实际是 ${tool.inputSchema.type}`);
            }
            return {
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema as JSONSchema & { type: "object" },
            };
        });
    }

    /**
     * 将工具列表转为 OpenAI API 格式
     */
    toOpenAIFormat(): Array<{
        type: "function";
        function: {
            name: string;
            description: string;
            parameters: JSONSchema;
        };
    }> {
        return this.all().map(tool => {
            // 确保工具输入模式是对象类型
            if (tool.inputSchema.type !== "object") {
                throw new Error(`工具 ${tool.name} 的输入模式类型必须是 "object"，实际是 ${tool.inputSchema.type}`);
            }
            return {
                type: "function" as const,
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                },
            };
        });
    }
}
