# Mini Agent

一个基于 OpenAI API 的 AI 助手，支持命令行和 Web 界面两种交互方式。

## 特性

- **双模式运行**: 支持 CLI 命令行、Web 界面、或同时运行两种模式
- **工具调用**: 内置文件读写、代码搜索、命令执行等工具
- **权限管理**: 支持自动、询问、严格三种权限模式，保障操作安全
- **技能系统**: 支持预定义技能（commit、review-pr、help、time 等）
- **MCP 集成**: 支持 Model Context Protocol 服务器扩展工具能力
- **上下文管理**: 自动压缩历史对话，节省 token 使用

## 安装

1. 克隆项目并安装依赖：

```bash
git clone <项目地址>
cd mini-agent
npm install
```

2. 配置环境变量：

复制 `.env.example` 为 `.env` 并填写你的 API 密钥：

```bash
cp .env.example .env
# 编辑 .env 文件，设置 API_KEY 等参数
```

## 配置

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `MINI_AGENT_PERMISSION` | 权限模式：`auto`(自动允许)、`ask`(询问用户)、`strict`(严格拒绝) | `ask` |
| `MINI_AGENT_MODEL` | 使用的 AI 模型 | `deepseek-reasoner` |
| `MINI_AGENT_MODE` | 运行模式：`cli`、`web`、`both` | `cli` |
| `MINI_AGENT_MAX_TURNS` | 最大对话轮数 | `20` |
| `MINI_AGENT_COMPACTION_THRESHOLD` | 触发压缩的消息数阈值 | `40` |
| `API_KEY` | DeepSeek/OpenAI API 密钥 | 无 |
| `DEEPSEEK_API_BASE` | API 基础地址 | `https://api.deepseek.com` |
| `MCP_SERVERS` | MCP 服务器配置（JSON 数组） | `[]` |
| `WEB_PORT` | Web 服务器端口 | `3000` |

### 权限模式说明

- **auto**: 完全信任模式，所有工具调用自动允许（适合安全环境）
- **ask**: 交互式询问，高危操作和写操作需要用户确认（默认）
- **strict**: 严格模式，拒绝所有工具调用（仅对话）

### 运行模式说明

- **cli**: 仅命令行界面，适合本地开发使用
- **web**: 仅 Web 界面，启动 HTTP 服务器和 WebSocket 服务
- **both**: 同时运行 CLI 和 Web 界面，适合多用户场景

## 使用

### CLI 模式

```bash
# 使用默认 CLI 模式
npm start

# 或直接运行
MINI_AGENT_MODE=cli npm run dev
```

启动后，在命令行中输入问题即可与 AI 对话。AI 可以调用工具执行文件操作、搜索代码、运行命令等。

### Web 模式

```bash
# 启动 Web 服务器
MINI_AGENT_MODE=web npm run dev
```

服务器启动后，访问以下地址：

- Web 界面: http://localhost:3000
- 健康检查: http://localhost:3000/health
- API 状态: http://localhost:3000/api/status

Web 界面提供实时聊天功能，支持工具调用的可视化展示。

### 双模式运行

```bash
# 同时运行 CLI 和 Web 服务器
MINI_AGENT_MODE=both npm run dev
```

此模式下，CLI 在后台运行，Web 服务器同时提供服务。

## 内置工具

| 工具名 | 描述 | 权限要求 |
|--------|------|----------|
| `read_file` | 读取文件内容 | 只读工具，auto 模式自动放行 |
| `write_file` | 写入文件内容 | 写操作，ask 模式需要确认 |
| `grep` | 搜索文件内容 | 只读工具 |
| `bash` | 执行 shell 命令 | 高危操作，ask 模式需要确认 |

## 技能系统

Mini Agent 内置了多个实用技能：

- `commit`: 帮助生成 Git 提交消息
- `review-pr`: 代码审查助手
- `help`: 显示帮助信息
- `time`: 时间相关操作

技能可通过特定命令触发，例如输入 `/commit` 激活提交助手。

## MCP 扩展

支持通过 Model Context Protocol 集成外部工具服务。在 `.env` 中配置 `MCP_SERVERS` 即可加载：

```json
MCP_SERVERS='[
  {"command": "npx", "args": ["mcp-time-workdays-node"]},
  {"command": "npx", "args": ["mcp-chrono"]}
]'
```

## 项目结构

```
mini-agent/
├── src/
│   ├── AgentCore.ts          # AI 核心逻辑
│   ├── AgentLoop.ts          # CLI 包装层
│   ├── server.ts             # Web 服务器
│   ├── CLI.ts                # 命令行界面
│   ├── ContextManager.ts     # 对话上下文管理
│   ├── ToolRegistry.ts       # 工具注册中心
│   ├── PermissionChecker.ts  # 权限检查器
│   ├── Skill.ts              # 技能系统
│   ├── MCP.ts                # MCP 集成
│   ├── types.ts              # 类型定义
│   └── tools/                # 内置工具实现
├── public/                   # Web 前端文件
│   ├── index.html
│   ├── style.css
│   └── app.js
├── dist/                     # TypeScript 编译输出
└── package.json
```

## 开发

### 添加新工具

1. 在 `src/tools/` 目录下创建新工具类
2. 实现 `Tool` 接口
3. 在 `src/index.ts` 中注册工具

### 添加新技能

1. 在 `src/Skill.ts` 的 `createDefaultSkillSystem` 函数中添加技能定义
2. 包含技能名称、匹配模式、系统提示等

### 构建项目

```bash
npm run build  # 编译 TypeScript
npm run dev    # 开发模式运行
```

## 故障排除

### Web 服务器启动失败

- 检查端口 3000 是否被占用
- 确认环境变量配置正确
- 查看控制台错误信息

### 工具调用权限被拒绝

- 检查 `MINI_AGENT_PERMISSION` 设置
- 在 ask 模式下需要在 CLI 确认或 Web 界面授权

### MCP 服务器加载失败

- 确认 MCP 服务器命令路径正确
- 检查服务器是否已安装
- 查看控制台错误日志

## 许可证

MIT

## 致谢

项目参考自 [build-code-agent](https://github.com/jiji262/build-code-agent)