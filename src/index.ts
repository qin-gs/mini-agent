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

async function main() {

    // 1. 注册内置工具
    const registry = new ToolRegistry();
    registry.registerAll([
        ReadFileTool,
        WriteFileTool,
        GrepTool,
        BashTool
    ])

    // 2. 从环境变量加载配置
    const permission = (process.env.MINI_AGENT_PERMISSION ?? 'ask') as 'auto' | 'ask' | 'strict';
    const model = process.env.MINI_AGENT_MODEL ?? 'deepseek-reasoner';
    const apiBaseUrl = process.env.DEEPSEEK_API_BASE;

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
    const agent = new AgentLoop(context, registry, permissions, {model, apiBaseUrl});

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
