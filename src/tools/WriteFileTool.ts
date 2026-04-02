import {Tool} from "../types";
import {resolve, dirname} from "node:path";
import {mkdir, writeFile} from "node:fs/promises";

export const WriteFileTool: Tool = {
    name: "write_file",
    description: "将内容写入文件。如果文件不存在则创建，如果存在则覆盖。（会自动创建所需的父目录）",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "要写入的文件路径",
            },
            content: {
                type: "string",
                description: "要写入的文件内容",
            }
        },
        required: ["path", "content"]
    },

    async call(input ) {
        const path = input['path'] as string;
        const content = input['content'] as string;

        if (!path) {
            return `错误：缺少 path 参数`;
        }
        if (content === undefined) {
            return `错误：缺少 content 参数 `;
        }

        try {
            const absolutePath = resolve(process.cwd(), path);

            await mkdir(dirname(absolutePath), {recursive: true});
            await writeFile(absolutePath, content, "utf-8");

            return `成功写入文件：${path} (${content.length} 字符)`;
        } catch (error) {
            return `错误：${(error as Error).message}`
        }

    }
}