import {promisify} from "node:util";
import {exec} from "node:child_process";
import {Tool} from "../types";

const execAsync = promisify(exec);

export const GrepTool: Tool = {
    name: "grep",
    description:
        "在文件中搜索匹配某个模式的内容。支持正则表达式。" +
        "返回匹配行及其行号。适合在代码库中查找函数定义、变量使用等。",
    inputSchema: {
        type: "object",
        properties: {
            pattern: {
                type: "string",
                description: "要搜索的正则表达式或字符串",
            },
            path: {
                type: "string",
                description: "搜索的文件或目录路径，默认为当前目录",
            },
            include: {
                type: "string",
                description: '文件名匹配模式，例如 "*.ts" 或 "*.{js,ts}"',
            },
        },
        required: ["pattern"],
    },

    async call(input) {
        const pattern = input["pattern"] as string;
        const path = (input["path"] as string) ?? ".";
        const include = input["include"] as string | undefined;

        if (!pattern) return "错误：缺少 pattern 参数";

        // 使用 ripgrep（如果可用）或回退到 grep
        const useRipgrep = await hasRipgrep();

        let command: string;
        if (useRipgrep) {
            command = [
                "rg",
                "--line-number",
                "--no-heading",
                "--color=never",
                include ? `--glob '${include}'` : "",
                `'${pattern.replace(/'/g, "'\\''")}'`,
                path,
            ]
                .filter(Boolean)
                .join(" ");
        } else {
            command = [
                "grep",
                "-rn",
                "--color=never",
                include ? `--include='${include}'` : "",
                `'${pattern.replace(/'/g, "'\\''")}'`,
                path,
            ]
                .filter(Boolean)
                .join(" ");
        }

        try {
            const { stdout } = await execAsync(command, {
                cwd: process.cwd(),
                maxBuffer: 512 * 1024,
            });

            const lines = stdout.trim().split("\n");
            if (lines.length > 200) {
                return (
                    lines.slice(0, 200).join("\n") +
                    `\n\n[结果被截断，共 ${lines.length} 行，只显示前 200 行]`
                );
            }

            return stdout.trim() || "没有找到匹配结果";
        } catch (err) {
            const error = err as { code?: number; message: string };
            // exit code 1 means no matches (not an error)
            if (error.code === 1) return "没有找到匹配结果";
            return `错误：${error.message}`;
        }
    },
};

async function hasRipgrep(): Promise<boolean> {
    try {
        await execAsync("which rg");
        return true;
    } catch {
        return false;
    }
}