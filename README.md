# Mini Agent

一个轻量级、可扩展的 LLM 代理框架，支持工具调用、权限管理、上下文压缩和 MCP 集成。

> 参考：[https://github.com/jiji262/build-code-agent](https://github.com/jiji262/build-code-agent)

## Agent Loop 的核心实现逻辑抽象

对应的控制流如下，感知 -> 决策 -> 行动 -> 反馈四个阶段不断循环，直到模型返回纯文本为止

[参考](https://x.com/HiTw93/status/2034627967926825175)

```typescript
const messages: MessageParam[] = [{ role: "user", content: userInput }];

while (true) {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8096,
    tools: toolDefinitions,
    messages,
  });

  if (response.stop_reason === "tool_use") {
    const toolResults = await Promise.all(
      response.content
        .filter((b) => b.type === "tool_use")
        .map(async (b) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: await executeTool(b.name, b.input),
        }))
    );
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  } else {
    return response.content.find((b) => b.type === "text")?.text ?? "";
  }
}
```


## ✨ 特性

- **🛠️ 工具系统**: 内置文件读写、Bash 命令、文本搜索等核心工具，支持自定义工具扩展
- **🔐 权限管理**: 三种权限模式（自动允许、询问用户、严格拒绝），确保安全可控
- **🧠 上下文管理**: 智能上下文压缩，防止 token 超限，支持长对话
- **🔌 MCP 集成**: 支持 Model Context Protocol (MCP) 服务器，无缝扩展工具能力
- **🎯 技能系统**: 预定义技能模块，支持快速调用常用操作
- **⚙️ 配置灵活**: 环境变量配置，支持多种 LLM 模型（DeepSeek、OpenAI、Claude 等）
- **🔄 代理循环**: 经典的 "思考 -> 行动 -> 观测" 循环，支持多轮对话

## 🚀 快速开始

### 安装依赖

```bash
# 克隆项目
git clone https://github.com/qin-gs/mini-agent.git
cd mini-agent

# 安装依赖
npm install
```

> 提示：如果你 fork 了此项目，请使用你自己的仓库 URL。

### 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，设置你的 API 密钥和配置
# 至少需要设置 API_KEY（对于 DeepSeek 或其他模型提供商）
```

### 运行代理

```bash
# 开发模式（使用 tsx）
npm run dev

# 或直接运行（使用 ts-node）
npm start

# 构建项目
npm run build
# 运行构建后的代码
node dist/index.js
```

## 💡 使用示例

启动代理后，你可以与它进行交互：

```
$ npm run dev

mini agent 权限模式: ask     模型: deepseek-reasoner
--------------------------------------------------
> 请帮我列出当前目录的文件

🤖 正在思考...

🛠️ 调用工具: bash
📝 参数: {"command": "ls -la"}
❓ 是否允许执行此命令？ (y/n): y

📁 执行结果:
total 192
drwxrwxr-x   15 user  staff    480 Apr  8 22:45 .
drwxr-xr-x   29 user  staff    928 Apr  7 21:54 ..
-rw-r--r--@   1 user  staff    123 Apr  8 22:45 README.md
...

> 请帮我搜索所有 TypeScript 文件中的 "Tool" 关键字

🤖 正在思考...

🛠️ 调用工具: grep
📝 参数: {"pattern": "Tool", "path": "src", "glob": "**/*.ts"}
❓ 是否允许执行此命令？ (y/n): y

🔍 搜索结果:
src/types.ts:16:export interface Tool {
src/ToolRegistry.ts:12:export class ToolRegistry {
...
```

## ⚙️ 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `MINI_AGENT_PERMISSION` | 权限模式：`auto`（自动允许）、`ask`（询问用户）、`strict`（严格拒绝） | `ask` |
| `MINI_AGENT_MODEL` | 使用的模型名称，如 `deepseek-reasoner`、`gpt-4`、`claude-3-opus` | `deepseek-reasoner` |
| `MINI_AGENT_MAX_TURNS` | 最大对话轮数（一轮 = user + assistant） | `20` |
| `MINI_AGENT_COMPACTION_THRESHOLD` | 触发上下文压缩的消息数阈值 | `40` |
| `API_KEY` | API 密钥（DeepSeek、OpenAI 等） | - |
| `DEEPSEEK_API_BASE` | DeepSeek API 基础 URL（可选） | - |
| `MCP_SERVERS` | MCP 服务器配置（JSON 数组格式，可选） | - |

### 权限模式

- **`auto`**: 自动允许所有工具调用（适合受信任环境）
- **`ask`**: 每次工具调用前询问用户确认（交互式）
- **`strict`**: 拒绝所有工具调用（只读模式）

## 🛠️ 工具系统

### 内置工具

1. **`read_file`** - 读取文件内容
2. **`write_file`** - 写入文件内容
3. **`grep`** - 在文件中搜索文本
4. **`bash`** - 执行 Bash 命令

### 自定义工具

实现 `Tool` 接口即可添加自定义工具：

```typescript
import { Tool, JSONSchema } from './src/types';

const MyTool: Tool = {
    name: 'my_tool',
    description: '我的自定义工具描述',
    inputSchema: {
        type: 'object',
        properties: {
            param1: { type: 'string', description: '参数说明' }
        },
        required: ['param1']
    },
    async call(input) {
        // 工具逻辑
        return '执行结果';
    }
};

// 注册到 ToolRegistry
registry.register(MyTool);
```

## 🔌 MCP 集成

支持 Model Context Protocol (MCP) 服务器，扩展代理能力：

### 配置 MCP 服务器

在 `.env` 中配置 `MCP_SERVERS`（JSON 数组格式）：

```markdown
MCP_SERVERS='[
  {"command": "npx", "args": ["mcp-time-workdays-node"]},
  {"command": "npx", "args": ["mcp-chrono"]}
]'
```

### 支持的 MCP 服务器示例

- **时间工具**: `mcp-time-workdays-node` - 工作日计算
- **时间处理**: `mcp-chrono` - 日期时间处理
- **文件系统**: `mcp-server-filesystem` - 文件系统操作
- **Git**: `mcp-server-git` - Git 操作

## 🎯 技能系统

预定义技能模块，支持快速调用：

### 可用技能

- **`/commit`** - Git 提交助手，帮助生成提交消息并执行 git 操作
- **`/review-pr`** - PR 代码审查，分析代码变更并提供改进建议
- **`/help`** - 显示帮助信息，获取使用指南
- **`/time`** - 获取当前时间，格式化为 yyyy-MM-dd HH:mm:ss

### 使用技能

在代理对话中直接使用技能命令：

```
用户：/commit -m "修复登录bug"
```

## 🏗️ 项目结构

```
mini-agent/
├── src/
│   ├── index.ts              # 主入口文件
│   ├── types.ts              # 类型定义
│   ├── ToolRegistry.ts       # 工具注册表
│   ├── AgentLoop.ts          # 代理循环核心
│   ├── ContextManager.ts     # 上下文管理
│   ├── PermissionChecker.ts  # 权限检查
│   ├── CLI.ts               # 命令行接口
│   ├── MCP.ts               # MCP 集成
│   ├── Skill.ts             # 技能系统
│   └── tools/               # 内置工具
│       ├── ReadFileTool.ts
│       ├── WriteFileTool.ts
│       ├── GrepTool.ts
│       └── BashTool.ts
├── dist/                    # 构建输出
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 📖 开发指南

### 添加新工具

1. 在 `src/tools/` 目录下创建新工具文件
2. 实现 `Tool` 接口
3. 在 `src/index.ts` 中注册工具

### 扩展技能系统

1. 在 `src/Skill.ts` 中添加技能定义
2. 实现技能处理逻辑
3. 注册到技能系统

### 调试提示

- 设置 `MINI_AGENT_PERMISSION=auto` 可跳过权限确认，方便测试
- 查看控制台输出的注册工具和技能列表
- 使用 `console.log` 调试工具调用

## 🔄 代理工作流程

```
启动代理
    ↓
加载配置 & 注册工具
    ↓
初始化上下文 & 权限系统
    ↓
等待用户输入
    ↓
LLM 思考 & 选择工具
    ↓
权限检查 → 用户确认（如果需要）
    ↓
执行工具 & 获取结果
    ↓
更新上下文 & 继续循环
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

MIT License

## 🙏 致谢

- 灵感来自 [build-code-agent](https://github.com/jiji262/build-code-agent)
- 使用 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 扩展工具能力
- 感谢所有开源贡献者
