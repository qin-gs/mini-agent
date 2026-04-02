import {Tool} from "./types";

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
     * 将工具列表转为想要的格式
     */
    toApiFormat(): Array<{
        name: string;
        description: string;
        input_schema: Tool["inputSchema"];
    }> {
        return this.all().map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema,
        }));
    }
}
