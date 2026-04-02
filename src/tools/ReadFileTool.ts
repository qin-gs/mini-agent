/**
 * 内置工具
 */
import {Tool} from "../types";
import {resolve} from "node:path";
import {readFile} from "node:fs/promises";

export const ReadFileTool: Tool = {
    name: "read_file",
    description: "读取文件内容。当你需要查看某个文件时使用此工具，返回文件的完整文本内容",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "要读取的文件路径（绝对路径或相对于工作目录的路径）"
            },
        },
        required: ["path"]
    },

    async call(input) {
        const path = input['path'] as string;
        if (!path) {
            return "错误: 缺少 path 参数";
        }

        try {
            const absolutePath = resolve(process.cwd(), path);
            const content = await readFile(absolutePath, "utf-8");

            const MAX_CHARS = 5_0000;
            if (content.length > MAX_CHARS) {
                return (
                    content.slice(0, MAX_CHARS) +
                        `\n\n[文件被截断，共${content.length}个字符，只显示前 ${MAX_CHARS} 字符]`
                )
            }
            return content;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === "ENOENT") {
                return `错误: 文件不存在: ${path}`
            }
            if (err.code === "EACCES") {
                return `错误: 没有读取权限: ${path}`
            }
            return `错误: ${err.message};`
        }
    },
}