import {promiseHooks} from "node:v8";
import {promisify} from "node:util";
import {exec} from "node:child_process";
import {Tool} from "../types";

const execAsync = promisify(exec);

// 危险命令黑名单 — 生产环境应当更严格
const DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+[\/~]/,      // rm -rf / 或 rm -rf ~
    /:\s*\(\s*\)\s*\{/,      // fork bomb
    /dd\s+if=/,              // dd 覆写磁盘
    /mkfs/,                  // 格式化文件系统
    />\s*\/dev\/[sh]d/,      // 写入磁盘设备
    /chmod\s+-R\s+777\s+\//,  // 递归修改根目录权限
];

export const BashTool: Tool = {
    name: "bash",
    description: "在 shell 中执行命令并返回输出。适合运行测试、查看目录结构、执行构建命令等。超时时间为 30 秒。",
    inputSchema: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "要执行的 shell 命令"
            },
            timeout: {
                type: "number",
                description: "超时时间（毫秒），默认 30000"
            },
        },
        required: ["command"]
    },

    async call(input) {
        const command = input["command"] as string;
        const timeout = (input["timeout"] as number) ?? 3_0000;

        if (!command) {
            return `错误：缺少 command 参数`;
        }

        // 安全检查
        for (const pattern of DANGEROUS_PATTERNS) {
            if (pattern.test(command)) {
                return `拒绝执行：命令 "${command}" 匹配危险模式，已阻止`;
            }
        }

        try {
            const {stdout, stderr} = await execAsync(command, {
                timeout,
                cwd: process.cwd(),
                maxBuffer: 1024 * 1024,
            });

            const output = [
                stdout.trim() && `STDOUT: \n${stdout.trim()}`,
                stderr.trim() && `STDERR: \n${stderr.trim()}`,
            ].filter(Boolean)
                .join("\n\n")

            return output || "(命令执行成果，无输出)";
        } catch (error) {

            const err = error as { killed?: boolean; code?: number, stderr?: string, message: string };

            if (err.killed) {
                return `错误：命令超时 (>${timeout}ms)`;
            }

            return [
                `命令退出码: ${err.code ?? "unknown"}`,
                err.stderr?.trim() && `STDERR: ${err.stderr?.trim()}`,
                `错误：${err.message}`
            ].filter(Boolean)
                .join("\n")
        }

    }
}







