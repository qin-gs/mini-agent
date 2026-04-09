/**
 * MiniAgent Web 界面 JavaScript
 */

class MiniAgentWeb {
    constructor() {
        // WebSocket 连接
        this.ws = null;
        this.clientId = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;

        // 权限请求处理
        this.pendingPermissionRequest = null;
        this.permissionResolve = null;

        // 状态
        this.messageCount = 0;
        this.toolCount = 4; // 默认工具数
        this.currentAssistantMessage = null;
        this.currentAssistantText = '';
        this.loadingMessageElement = null;

        // 初始化
        this.initElements();
        this.initEventListeners();
        this.initWebSocket();
        this.updateStatus();
    }

    /**
     * 初始化 DOM 元素
     */
    initElements() {
        // 状态元素（可能不存在）
        this.connectionStatus = document.getElementById('connection-status');
        this.connectionText = document.getElementById('connection-text');

        // 按钮
        this.resetBtn = document.getElementById('reset-btn');
        this.sendBtn = document.getElementById('send-btn');

        // 输入
        this.messageInput = document.getElementById('message-input');
        this.messagesContainer = document.getElementById('messages');

        // 模态框
        this.permissionModal = document.getElementById('permission-modal');
        this.permissionToolName = document.getElementById('permission-tool-name');
        this.permissionDescription = document.getElementById('permission-description');
        this.permissionInput = document.getElementById('permission-input');
        this.permissionAllow = document.getElementById('permission-allow');
        this.permissionDeny = document.getElementById('permission-deny');
        this.modalClose = document.querySelector('.modal-close');

        // 链接（可能不存在）
        this.githubLink = document.getElementById('github-link');
    }

    /**
     * 初始化事件监听器
     */
    initEventListeners() {
        // 发送消息
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this.messageInput.value = '';
            }
        });

        // 重置会话（如果按钮存在）
        if (this.resetBtn) {
            this.resetBtn.addEventListener('click', () => this.resetSession());
        }

        // 权限请求
        this.permissionAllow.addEventListener('click', () => this.handlePermissionResponse(true));
        this.permissionDeny.addEventListener('click', () => this.handlePermissionResponse(false));
        this.modalClose.addEventListener('click', () => this.hidePermissionModal());

        // 点击模态框外部关闭
        this.permissionModal.addEventListener('click', (e) => {
            if (e.target === this.permissionModal) {
                this.hidePermissionModal();
            }
        });

        // GitHub 链接（如果存在）
        if (this.githubLink) {
            this.githubLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.open('https://github.com', '_blank');
            });
        }
    }

    /**
     * 初始化 WebSocket 连接
     */
    initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        this.updateConnectionStatus('connecting', '连接中...');

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket 连接已建立');
            this.reconnectAttempts = 0;
            this.updateConnectionStatus('connected', '已连接');
            this.addActivity('WebSocket 连接已建立');
        };

        this.ws.onmessage = (event) => {
            this.handleWebSocketMessage(event.data);
        };

        this.ws.onclose = () => {
            console.log('WebSocket 连接已关闭');
            this.updateConnectionStatus('disconnected', '未连接');
            this.addActivity('WebSocket 连接已关闭');

            // 清除loading消息
            this.resetCurrentAssistantMessage();

            // 尝试重新连接
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const delay = this.reconnectDelay * this.reconnectAttempts;
                console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts}) 在 ${delay}ms 后`);

                setTimeout(() => {
                    this.initWebSocket();
                }, delay);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket 错误:', error);
            this.updateConnectionStatus('disconnected', '连接错误');
            this.addActivity('WebSocket 连接错误');
            // 清除loading消息
            this.resetCurrentAssistantMessage();
        };
    }

    /**
     * 处理 WebSocket 消息
     */
    handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'system':
                    this.resetCurrentAssistantMessage();
                    this.addSystemMessage(message.message);
                    if (message.clientId) {
                        this.clientId = message.clientId;
                    }
                    break;

                case 'text':
                    this.appendAssistantText(message.text);
                    break;

                case 'tool_use':
                    // 不显示工具调用消息，但保持当前助手消息（包括loading）
                    break;

                case 'tool_result':
                    // 不显示工具结果消息，但保持当前助手消息（包括loading）
                    break;

                case 'error':
                    this.resetCurrentAssistantMessage();
                    this.addErrorMessage(message.message);
                    break;

                case 'complete':
                    this.resetCurrentAssistantMessage();
                    // 不显示处理完成消息，避免重复
                    break;

                case 'status':
                    this.resetCurrentAssistantMessage();
                    this.updateToolCount(message.data.toolCount || 0);
                    break;

                case 'permission_request':
                    this.resetCurrentAssistantMessage();
                    this.showPermissionModal(message);
                    break;

                default:
                    console.warn('未知消息类型:', message.type);
            }

            // 更新活动列表
            this.addActivity(`收到 ${message.type} 消息`);
        } catch (error) {
            console.error('解析 WebSocket 消息失败:', error, data);
        }
    }

    /**
     * 发送消息
     */
    sendMessage() {
        const text = this.messageInput.value.trim();

        if (!text) {
            return;
        }

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.addErrorMessage('未连接到服务器，请稍后重试');
            return;
        }

        // 添加用户消息到界面
        this.addUserMessage(text);
        this.resetCurrentAssistantMessage();

        // 添加loading消息
        this.addLoadingMessage();

        // 清空输入框
        this.messageInput.value = '';

        // 发送到服务器
        this.ws.send(JSON.stringify({
            type: 'chat',
            text: text
        }));

        // 更新消息计数
        this.messageCount++;
        this.updateMessageCount();
    }

    /**
     * 重置会话
     */
    resetSession() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.addErrorMessage('未连接到服务器');
            return;
        }

        // 清空消息界面
        this.messagesContainer.innerHTML = '';
        this.resetCurrentAssistantMessage();
        this.addSystemMessage('会话已重置');

        // 重置消息计数
        this.messageCount = 0;
        this.updateMessageCount();

        // 发送重置请求到服务器
        this.ws.send(JSON.stringify({
            type: 'reset'
        }));

        this.addActivity('会话已重置');
    }

    /**
     * 添加用户消息
     */
    addUserMessage(text) {
        const messageEl = this.createMessageElement('user', '你', text);
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    /**
     * 添加助手消息
     */
    addAssistantMessage(text) {
        // 旧方法，用于直接添加完整消息
        const messageEl = this.createMessageElement('assistant', 'MiniAgent', text);
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
        // 重置当前助手消息，因为这是一条完整的新消息
        this.currentAssistantMessage = null;
        this.currentAssistantText = '';
    }

    appendAssistantText(text) {
        // 如果存在loading消息，先移除
        if (this.loadingMessageElement) {
            this.removeLoadingMessage();
        }

        // 如果当前没有活动的助手消息，创建一个新的
        if (!this.currentAssistantMessage) {
            const messageEl = this.createMessageElement('assistant', 'MiniAgent', '');
            this.messagesContainer.appendChild(messageEl);
            this.currentAssistantMessage = messageEl;
            this.currentAssistantText = '';
        }

        // 追加文本到当前助手消息
        const contentDiv = this.currentAssistantMessage.querySelector('.message-content');
        if (contentDiv) {
            this.currentAssistantText += text;
            // 处理内容中的代码块和特殊格式
            const processedContent = this.processContent(this.currentAssistantText);
            contentDiv.innerHTML = processedContent;
        }

        this.scrollToBottom();
    }

    resetCurrentAssistantMessage() {
        this.currentAssistantMessage = null;
        this.currentAssistantText = '';
        // 清除loading消息
        this.removeLoadingMessage();
    }

    /**
     * 添加系统消息
     */
    addSystemMessage(text) {
        const messageEl = this.createMessageElement('system', '系统', text);
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    /**
     * 添加工具调用消息
     */
    addToolUseMessage(toolName, input, id) {
        const text = `调用工具: ${toolName}\n参数: ${JSON.stringify(input, null, 2)}`;
        const messageEl = this.createMessageElement('tool', `工具 ${toolName}`, text);
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    /**
     * 添加工具结果消息
     */
    addToolResultMessage(toolUseId, content) {
        const text = `工具结果:\n${content}`;
        const messageEl = this.createMessageElement('tool', '工具结果', text);
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    /**
     * 添加错误消息
     */
    addErrorMessage(text) {
        const messageEl = this.createMessageElement('error', '错误', text);
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    /**
     * 添加加载中消息
     */
    addLoadingMessage() {
        // 如果已经有loading消息，先移除
        if (this.loadingMessageElement && this.loadingMessageElement.parentNode) {
            this.loadingMessageElement.parentNode.removeChild(this.loadingMessageElement);
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        headerDiv.innerHTML = '<i class="fas fa-robot"></i> MiniAgent';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // 创建三个点动画
        const loadingDots = document.createElement('div');
        loadingDots.className = 'loading-dots';
        loadingDots.innerHTML = '<div></div><div></div><div></div>';
        contentDiv.appendChild(loadingDots);

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);

        this.messagesContainer.appendChild(messageDiv);
        this.loadingMessageElement = messageDiv;
        this.scrollToBottom();
    }

    /**
     * 移除加载中消息
     */
    removeLoadingMessage() {
        if (this.loadingMessageElement && this.loadingMessageElement.parentNode) {
            this.loadingMessageElement.parentNode.removeChild(this.loadingMessageElement);
            this.loadingMessageElement = null;
        }
    }

    /**
     * 创建消息元素
     */
    createMessageElement(type, header, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';

        // 根据类型添加图标
        let icon = 'fas fa-user';
        if (type === 'assistant') icon = 'fas fa-robot';
        if (type === 'system') icon = 'fas fa-info-circle';
        if (type === 'tool') icon = 'fas fa-cog';
        if (type === 'error') icon = 'fas fa-exclamation-triangle';

        headerDiv.innerHTML = `<i class="${icon}"></i> ${header}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // 处理内容中的代码块和特殊格式
        const processedContent = this.processContent(content);
        contentDiv.innerHTML = processedContent;

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);

        return messageDiv;
    }

    /**
     * 处理消息内容（简单 Markdown 支持）
     */
    processContent(content) {
        // 转义 HTML
        let processed = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 代码块
        processed = processed.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // 行内代码
        processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 换行
        processed = processed.replace(/\n/g, '<br>');

        return processed;
    }

    /**
     * 滚动到底部
     */
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * 更新连接状态
     */
    updateConnectionStatus(status, text) {
        if (this.connectionStatus) {
            this.connectionStatus.className = `status-dot ${status}`;
        }
        if (this.connectionText) {
            this.connectionText.textContent = text;
        }
    }

    /**
     * 更新消息计数
     */
    updateMessageCount() {
        // 不再显示消息计数
    }

    /**
     * 更新工具计数
     */
    updateToolCount(count) {
        this.toolCount = count;
        // 不再显示工具计数
    }

    /**
     * 更新状态
     */
    updateStatus() {
        // 状态更新不再需要
    }

    /**
     * 添加活动记录
     */
    addActivity(text) {
        // 活动记录不再显示
    }

    /**
     * 显示权限请求模态框
     */
    showPermissionModal(request) {
        this.pendingPermissionRequest = request;

        this.permissionToolName.textContent = request.toolName || '未知工具';
        this.permissionDescription.textContent = request.description || '无描述';
        this.permissionInput.textContent = JSON.stringify(request.input || {}, null, 2);

        this.permissionModal.classList.add('active');

        // 返回一个 Promise，用于等待用户响应
        return new Promise((resolve) => {
            this.permissionResolve = resolve;
        });
    }

    /**
     * 隐藏权限请求模态框
     */
    hidePermissionModal() {
        this.permissionModal.classList.remove('active');
        this.pendingPermissionRequest = null;

        // 如果还有未解决的 Promise，拒绝它
        if (this.permissionResolve) {
            this.permissionResolve(false);
            this.permissionResolve = null;
        }
    }

    /**
     * 处理权限响应
     */
    handlePermissionResponse(allowed) {
        this.hidePermissionModal();

        if (this.permissionResolve) {
            this.permissionResolve(allowed);
            this.permissionResolve = null;
        }

        // 发送响应到服务器
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.pendingPermissionRequest) {
            this.ws.send(JSON.stringify({
                type: 'permission_response',
                requestId: this.pendingPermissionRequest.requestId,
                allowed: allowed
            }));
        }

        this.addActivity(`权限 ${allowed ? '允许' : '拒绝'}: ${this.pendingPermissionRequest?.toolName}`);
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.miniAgent = new MiniAgentWeb();
});