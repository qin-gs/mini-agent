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
            terminal: true
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

    private async handleCommand(command: string): Promise<string | void> {
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
                break;
            }
            case "/reset": {
                // this.agent.reset();
                console.log("已清空对话历史，开始新会话");
                break;
            }
            case "/exit": {
                console.log("bye~");
                return "quit"
            }
            case "/status": {
                console.log(`[状态] REPL 运行中`);
                break;
            }
            default: {
                console.log(`未知命令: ${command}。输入 /help 查看可用命令。`);
            }
        }

    }
}
