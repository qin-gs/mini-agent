/**
 * Web 服务器
 *
 * 提供 HTTP API、WebSocket 服务和静态文件服务
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ContextManager } from './ContextManager';
import { ToolRegistry } from './ToolRegistry';
import { PermissionChecker } from './PermissionChecker';
import { SkillSystem } from './Skill';
import { AgentCore, type AgentCoreCallbacks } from './AgentCore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WebServerOptions {
    port?: number;
    staticDir?: string;
    mode?: 'web' | 'both';
}

/**
 * WebSocket 客户端连接信息
 */
interface WebSocketClient {
    socket: WebSocket;
    context: ContextManager;
    agentService: AgentCore;
}

/**
 * Web 服务器
 */
export class WebServer {
    private app: express.Application;
    private wss: WebSocketServer;
    private port: number;
    private staticDir: string;
    private mode: 'web' | 'both';

    private clients = new Map<string, WebSocketClient>();

    constructor(
        private context: ContextManager,
        private registry: ToolRegistry,
        private permissions: PermissionChecker,
        private skillSystem: SkillSystem,
        options: WebServerOptions = {}
    ) {
        this.port = options.port || 3000;
        this.staticDir = options.staticDir || path.join(__dirname, '../public');
        this.mode = options.mode || 'web';

        // 创建 Express 应用
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();

        // 创建 WebSocket 服务器
        this.wss = new WebSocketServer({ noServer: true });
        this.setupWebSocket();
    }

    /**
     * 设置中间件
     */
    private setupMiddleware(): void {
        // CORS 中间件
        this.app.use(cors());

        // JSON 解析
        this.app.use(express.json());

        // 静态文件服务
        this.app.use(express.static(this.staticDir));

        // 请求日志
        this.app.use((req, res, next) => {
            console.log(`[HTTP] ${req.method} ${req.url}`);
            next();
        });
    }

    /**
     * 设置路由
     */
    private setupRoutes(): void {
        // 健康检查
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // API: 发送消息（非流式）
        this.app.post('/api/chat', async (req, res) => {
            try {
                const { message, sessionId } = req.body;

                if (!message) {
                    res.status(400).json({ error: '缺少 message 参数' });
                    return;
                }

                // 这里实现非流式聊天逻辑
                // 暂时返回占位符
                res.json({
                    response: `收到消息: ${message}`,
                    sessionId: sessionId || 'default'
                });
            } catch (error) {
                console.error('API 错误:', error);
                res.status(500).json({ error: '服务器内部错误' });
            }
        });

        // API: 获取状态
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'running',
                mode: this.mode,
                port: this.port,
                clientCount: this.clients.size
            });
        });

        // 默认路由：返回前端页面
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(this.staticDir, 'index.html'));
        });
    }

    /**
     * 设置 WebSocket
     */
    private setupWebSocket(): void {
        this.wss.on('connection', (socket, request) => {
            console.log('[WebSocket] 新连接');

            // 为每个连接创建独立的上下文
            const clientContext = new ContextManager({
                maxTurns: this.context['maxTurns'],
                compactionThreshold: this.context['compactionThreshold']
            });

            // 为 Web 客户端创建权限检查器（使用 auto 模式）
            const webPermissions = new PermissionChecker('auto');

            // 创建独立的 AgentCore
            const agentService = new AgentCore(
                clientContext,
                this.registry,
                webPermissions,
                {
                    model: process.env.MINI_AGENT_MODEL || 'deepseek-reasoner',
                    apiBaseUrl: process.env.DEEPSEEK_API_BASE,
                    skillSystem: this.skillSystem
                }
            );

            const clientId = this.generateClientId();
            const client: WebSocketClient = {
                socket,
                context: clientContext,
                agentService
            };

            this.clients.set(clientId, client);

            // 发送欢迎消息
            socket.send(JSON.stringify({
                type: 'system',
                message: '已连接到 MiniAgent Web 服务器',
                clientId
            }));

            // 处理消息
            socket.on('message', async (data) => {
                await this.handleWebSocketMessage(clientId, data.toString());
            });

            // 处理连接关闭
            socket.on('close', () => {
                console.log(`[WebSocket] 连接关闭: ${clientId}`);
                this.clients.delete(clientId);
            });

            // 处理错误
            socket.on('error', (error) => {
                console.error(`[WebSocket] 错误: ${clientId}`, error);
            });
        });
    }

    /**
     * 处理 WebSocket 消息
     */
    private async handleWebSocketMessage(clientId: string, data: string): Promise<void> {
        const client = this.clients.get(clientId);
        if (!client) {
            console.error(`找不到客户端: ${clientId}`);
            return;
        }

        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'chat':
                    await this.handleChatMessage(client, message);
                    break;

                case 'reset':
                    client.context.reset();
                    client.socket.send(JSON.stringify({
                        type: 'system',
                        message: '会话已重置'
                    }));
                    break;

                case 'status':
                    const status = client.agentService.getStatus();
                    client.socket.send(JSON.stringify({
                        type: 'status',
                        data: status
                    }));
                    break;

                default:
                    console.warn(`未知消息类型: ${message.type}`);
            }
        } catch (error) {
            console.error('处理 WebSocket 消息失败:', error);
            client.socket.send(JSON.stringify({
                type: 'error',
                message: '消息处理失败'
            }));
        }
    }

    /**
     * 处理聊天消息
     */
    private async handleChatMessage(client: WebSocketClient, message: any): Promise<void> {
        const { text } = message;

        if (!text) {
            client.socket.send(JSON.stringify({
                type: 'error',
                message: '缺少消息内容'
            }));
            return;
        }

        // 定义回调函数
        const callbacks: AgentCoreCallbacks = {
            onText: (text) => {
                client.socket.send(JSON.stringify({
                    type: 'text',
                    text,
                    timestamp: new Date().toISOString()
                }));
            },

            onToolUse: (toolUse) => {
                client.socket.send(JSON.stringify({
                    type: 'tool_use',
                    tool: toolUse.name,
                    input: toolUse.input,
                    id: toolUse.id,
                    timestamp: new Date().toISOString()
                }));
            },

            onToolResult: (toolResult) => {
                client.socket.send(JSON.stringify({
                    type: 'tool_result',
                    toolUseId: toolResult.tool_use_id,
                    content: toolResult.content,
                    timestamp: new Date().toISOString()
                }));
            },

            onError: (error) => {
                client.socket.send(JSON.stringify({
                    type: 'error',
                    message: error.message,
                    timestamp: new Date().toISOString()
                }));
            },

            onSystemMessage: (message) => {
                client.socket.send(JSON.stringify({
                    type: 'system',
                    message,
                    timestamp: new Date().toISOString()
                }));
            }
        };

        try {
            // 调用 AgentCore 处理消息
            const fullResponse = await client.agentService.run(text, callbacks);

            // 发送完成消息
            client.socket.send(JSON.stringify({
                type: 'complete',
                fullResponse,
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            console.error('处理聊天消息失败:', error);
            client.socket.send(JSON.stringify({
                type: 'error',
                message: `处理失败: ${(error as Error).message}`,
                timestamp: new Date().toISOString()
            }));
        }
    }

    /**
     * 生成客户端 ID
     */
    private generateClientId(): string {
        return `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }

    /**
     * 启动服务器
     */
    start(): void {
        // 创建 HTTP 服务器
        const server = this.app.listen(this.port, () => {
            console.log(`Web 服务器运行在 http://localhost:${this.port}`);
            console.log(`静态文件目录: ${this.staticDir}`);
            console.log(`模式: ${this.mode}`);
        });

        // 将 WebSocket 服务器挂载到 HTTP 服务器
        server.on('upgrade', (request, socket, head) => {
            this.wss.handleUpgrade(request, socket, head, (ws) => {
                this.wss.emit('connection', ws, request);
            });
        });
    }

    /**
     * 停止服务器
     */
    stop(): void {
        // 关闭所有 WebSocket 连接
        for (const client of this.clients.values()) {
            client.socket.close();
        }
        this.clients.clear();

        // 关闭 WebSocket 服务器
        this.wss.close();

        console.log('Web 服务器已停止');
    }
}