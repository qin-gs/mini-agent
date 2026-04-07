/**
 * 组合工具
 */
import 'dotenv/config';
import {ToolRegistry} from "./ToolRegistry";
import {ReadFileTool} from "./tools/ReadFileTool";
import {BashTool} from "./tools/BashTool";
import {GrepTool} from "./tools/GrepTool";
import {WriteFileTool} from "./tools/WriteFileTool";
import {ContextManager} from "./ContextManager";
import {PermissionChecker} from "./PermissionChecker";
import {AgentLoop} from "./AgentLoop";
import {CLI} from "./CLI";
import {registerMCPTools} from "./MCP";
import {createDefaultSkillSystem} from "./Skill";

async function main() {

    // 1. 注册内置工具
    const registry = new ToolRegistry();
    registry.registerAll([
        ReadFileTool,
        WriteFileTool,
        GrepTool,
        BashTool
    ])

    // 加载 MCP 工具（如果配置了）
    await registerMCPTools(registry);

    // 初始化技能系统
    const skillSystem = createDefaultSkillSystem();

    // 打印所有已注册的工具（调试用）
    const allTools = registry.all();
    console.log(`已注册 ${allTools.length} 个工具: ${allTools.map(t => t.name).join(', ')}`);
    console.log(`已注册 ${skillSystem.getSkillNames().length} 个技能: ${skillSystem.getSkillNames().join(', ')}`);

    // 2. 从环境变量加载配置
    const permission = (process.env.MINI_AGENT_PERMISSION ?? 'ask') as 'auto' | 'ask' | 'strict';
    const model = process.env.MINI_AGENT_MODEL ?? 'qwen-plus';
    const apiBaseUrl = process.env.API_BASE_URL;

    // 3. 上下文管理
    const context = new ContextManager({
        maxTurns: parseInt(process.env.MINI_AGENT_MAX_TURNS ?? '20', 10),
        compactionThreshold: parseInt(process.env.MINI_AGENT_COMPACTION_THRESHOLD ?? '40', 10)
    })

    // 4. 准备命令行
    const {createInterface} = await import("node:readline")
    const rl = createInterface({input: process.stdin, output: process.stdout})

    // 5. 权限检查器
    const permissions = new PermissionChecker(permission, rl)

    // 6. 创建 agent loop
    const agent = new AgentLoop(context, registry, permissions, {model, apiBaseUrl, skillSystem});

    // 7. 启动 cli
    console.log("-".repeat(50));
    console.log(`mini agent 权限模式: ${permission.padEnd(6)} 模型: ${model.padStart(16)}`);
    console.log("-".repeat(50));
    const cli = new CLI(agent)

    process.on("SIGINT", () => {
        console.log(`\n\n 收到中断信号，正在退出...`);
        process.exit(0);
    })

    await cli.start();

}

main().catch((error) => {
    console.log("启动失败", error);
    process.exit(1);
})
