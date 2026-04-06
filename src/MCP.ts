/**
 * MCP 支持
 */
import {Tool} from "./types";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {ToolRegistry} from "./ToolRegistry";


export async function loadMCPTools(command: string, args: string[]): Promise<Tool[]> {

    const transport = new StdioClientTransport({command, args});
    const client = new Client({name: "mini-agent", version: "0.1.0"})
    await client.connect(transport);

    const {tools} = await client.listTools();

    return tools.map((mcpTool) => ({
        name: `mcp_${mcpTool.name}`,
        description: mcpTool.description ?? "",
        inputSchema: mcpTool.inputSchema as Tool["inputSchema"],
        async call(input) {
            try {
                const result = await client.callTool({
                    name: mcpTool.name,
                    arguments: input
                });
                // 将结果内容转换为字符串
                if (result.content && Array.isArray(result.content)) {
                    const textParts = result.content.filter(item => item.type === 'text').map(item => item.text);
                    return textParts.join('\n');
                } else if (result.content && typeof result.content === 'string') {
                    return result.content;
                } else {
                    return JSON.stringify(result.content || result);
                }
            } catch (error) {
                return `MCP 工具调用失败: ${error instanceof Error ? error.message : String(error)}`;
            }
        }
    }));
}

/**
 * 从 JSON 配置加载所有 MCP 工具并注册到工具注册表
 * @param registry 工具注册表实例
 * @param configJson 可选的配置 JSON 字符串，如果未提供则从 MCP_SERVERS 环境变量读取
 * @returns 加载的 MCP 工具总数
 */
export async function registerMCPTools(
    registry: ToolRegistry,
    configJson?: string
): Promise<number> {
    const mcpServersEnv = configJson || process.env.MCP_SERVERS;
    if (!mcpServersEnv) {
        console.log("未配置 MCP_SERVERS，跳过 MCP 工具加载");
        return 0;
    }

    try {
        const mcpServers = JSON.parse(mcpServersEnv);

        // 验证配置格式
        if (!Array.isArray(mcpServers)) {
            throw new Error("MCP_SERVERS 必须是一个数组");
        }

        if (mcpServers.length === 0) {
            console.log("MCP_SERVERS 数组为空，跳过 MCP 工具加载");
            return 0;
        }

        let totalMCPTools = 0;
        let loadedServers = 0;

        for (const server of mcpServers) {
            if (!server || typeof server !== 'object' || !server.command) {
                console.warn(`跳过无效的 MCP 服务器配置: ${JSON.stringify(server)}`);
                continue;
            }

            const command = String(server.command);
            const args = Array.isArray(server.args)
                ? server.args.map((arg: unknown) => String(arg))
                : [];

            try {
                const mcpTools = await loadMCPTools(command, args);
                registry.registerAll(mcpTools);
                console.log(`已从 ${command} 加载 ${mcpTools.length} 个 MCP 工具`);
                totalMCPTools += mcpTools.length;
                loadedServers++;
            } catch (error) {
                console.warn(`加载 MCP 服务器 ${command} 失败: ${error}`);
            }
        }

        if (totalMCPTools > 0) {
            console.log(`从 ${loadedServers} 个服务器总计加载 ${totalMCPTools} 个 MCP 工具`);
        } else {
            console.log("未成功加载任何 MCP 工具");
        }

        return totalMCPTools;
    } catch (error) {
        console.warn(`解析 MCP_SERVERS 配置失败: ${error}`);
        return 0;
    }
}
