import * as readline from "node:readline";
import {AgentLoop} from "./AgentLoop";

/**
 * 命令行
 */
export class CLI {
    private rl: readline.Interface;

    constructor(private agent: AgentLoop) {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        })
    }

    getReadLine(): readline.Interface {
        return this.rl;
    }

    async start(): Promise<void> {
        console.log(`mini agent 已启动。输入 /help 查看可用命令`);
        console.log("-".repeat(50));

        while (true) {
            const input = await this.prompt();

            if (!input.trim()) {
                continue;
            }

            if (input.startsWith("/")) {
                const handled = await this.handleCommand(input.trim());
                if (handled === "quit") {
                    break;
                }
                if (handled === "handled") {
                    continue;
                }
                // handled === "not_handled"，继续执行普通输入流程
            }

            try {
                process.stdout.write("\nmini agent：")
                await this.agent.run(input, (delta) => {
                    process.stdout.write(delta)
                })

                console.log("\n" + "-".repeat(50));
            } catch (error) {
                console.error(`\n[错误] ${(error as Error).message}\n`);
            }
        }

        this.rl.close();
        console.log("\n再见");
    }

    /**
     * 获取用户输入
     */
    private prompt(): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question("\n你：", resolve);
        })
    }

    private async handleCommand(command: string): Promise<string> {
        switch (command) {
            case "/help": {
                console.log(
                    `
                        /help - 显示帮助
                        /reset - 清空对话历史，开始新会话
                        /exit - 退出
                        /status - 显示当前状态
                    `
                )
                return "handled";
            }
            case "/reset": {
                // this.agent.reset();
                console.log("已清空对话历史，开始新会话");
                return "handled";
            }
            case "/exit": {
                console.log("bye~");
                return "quit";
            }
            case "/status": {
                console.log(`[状态] REPL 运行中`);
                return "handled";
            }
            default: {
                // 未知命令，交给技能系统处理
                return "not_handled";
            }
        }
    }
}
