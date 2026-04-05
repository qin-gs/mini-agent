/**
 * 组合工具
 */
import {ToolRegistry} from "./ToolRegistry";
import {ReadFileTool} from "./tools/ReadFileTool";
import {BashTool} from "./tools/BashTool";
import {GrepTool} from "./tools/GrepTool";
import {WriteFileTool} from "./tools/WriteFileTool";
import {ContextManager} from "./ContextManager";
import {PermissionChecker} from "./PermissionChecker";
import {AgentLoop} from "./AgentLoop";
import {CLI} from "./CLI";
import {loadConfig} from "./config";

async function main() {

    // 1. 注册内置工具
    const registry = new ToolRegistry();
    registry.registerAll([
        ReadFileTool,
        WriteFileTool,
        GrepTool,
        BashTool
    ])

    // 2. 加载配置
    const config = loadConfig();

    // 3. 上下文管理
    const context = new ContextManager({
        maxTurns: config.maxTurns,
        compactionThreshold: config.compactionThreshold
    })

    // 4. 准备命令行
    const {createInterface} = await import("node:readline")
    const rl = createInterface({input: process.stdin, output: process.stdout})

    // 5. 权限检查器
    const permissions = new PermissionChecker(config.permission, rl)

    // 6. 创建 agent loop
    const agent = new AgentLoop(context, registry, permissions, {model: config.model});

    // 7. 启动 cli
    console.log("-".repeat(50));
    console.log(`mini agent 权限模式: ${config.permission.padEnd(6)} 模型: ${config.model.slice(10).padStart(10)}`);
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
