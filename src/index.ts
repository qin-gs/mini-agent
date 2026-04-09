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
import {PermissionChecker, type PermissionRequest, type PermissionDecision} from "./PermissionChecker";
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

    // 5. 创建 CLI 专用的询问函数
    const cliAskUser = async (request: PermissionRequest, isDangerous: boolean): Promise<PermissionDecision> => {
        const prefix = isDangerous ? "高危操作" : "需要确认";
        console.log(`\n${prefix}: ${request.toolName}`)
        console.log(`描述：${request.description}`);
        console.log(`参数：${JSON.stringify(request.input, null, 2)}`);

        return new Promise<PermissionDecision>((resolve) => {
            rl.question("允许执行? [y/N] ", (answer) => {
                const decision = answer.toLowerCase() === "y" ? "allow" : "deny";
                resolve(decision);
            });
        });
    };

    // 6. 权限检查器
    const permissions = new PermissionChecker(permission, cliAskUser)

    // 6. 创建 agent loop
    const agent = new AgentLoop(context, registry, permissions, {model, apiBaseUrl, skillSystem});

    // 7. 确定运行模式
    const mode = (process.env.MINI_AGENT_MODE || 'cli').toLowerCase() as 'cli' | 'web' | 'both';
    const webPort = parseInt(process.env.WEB_PORT || '3000', 10);

    console.log("-".repeat(50));
    console.log(`mini agent 权限模式: ${permission.padEnd(6)} 模型: ${model.padStart(16)}`);
    console.log(`运行模式: ${mode.padEnd(6)} ${mode.includes('web') ? `端口: ${webPort}` : ''}`);
    console.log("-".repeat(50));

    // 8. 根据模式启动服务
    if (mode === 'cli' || mode === 'both') {
        const cli = new CLI(agent, rl);

        process.on("SIGINT", () => {
            console.log(`\n\n 收到中断信号，正在退出...`);
            process.exit(0);
        });

        // CLI 模式可以直接启动
        if (mode === 'cli') {
            await cli.start();
        } else {
            // both 模式：启动 CLI 但不阻塞，同时启动 Web 服务器
            cli.start().catch(console.error);
        }
    }

    if (mode === 'web' || mode === 'both') {
        // 导入 WebServer（动态导入以避免不必要的依赖）
        const { WebServer } = await import('./server.js');

        // 创建 Web 服务器
        const webServer = new WebServer(
            context,
            registry,
            permissions,
            skillSystem,
            {
                port: webPort,
                mode: mode as 'web' | 'both'
            }
        );

        webServer.start();

        console.log(`Web 服务器已启动: http://localhost:${webPort}`);
        console.log(`前端界面: http://localhost:${webPort}/index.html`);

        // 在 both 模式下，CLI 已经在运行
        if (mode === 'web') {
            // Web 模式下，保持进程运行
            process.on("SIGINT", () => {
                console.log(`\n\n 收到中断信号，正在退出...`);
                process.exit(0);
            });
        }
    }

    // 如果都没有启动（不应该发生），则等待
    if (mode !== 'cli' && mode !== 'web' && mode !== 'both') {
        console.error(`未知模式: ${mode}`);
        process.exit(1);
    }

}

main().catch((error) => {
    console.log("启动失败", error);
    process.exit(1);
})
