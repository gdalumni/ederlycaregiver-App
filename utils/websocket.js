/**
 * RuoYi WebSocket 服务
 *
 * 功能：
 * 1. JWT Token 认证
 * 2. WebSocket 自动连接
 * 3. 自动重连
 * 4. 心跳
 * 5. 消息监听
 * 6. 业务消息分发
 * 7. 主动断开
 */

class WebSocketService {

    constructor() {

        // WebSocket 实例
        this.ws = null;

        // WebSocket 地址
        this.wsUrl = '';

        // 当前 Token
        this.token = '';

        // 是否主动关闭
        this.manualClose = false;

        // 当前重连次数
        this.reconnectCount = 0;

        // 最大重连次数
        this.maxReconnectCount = 10;

        // 重连时间
        this.reconnectInterval = 3000;

        // 心跳定时器
        this.heartbeatTimer = null;

        // 心跳间隔
        this.heartbeatInterval = 10000;

        // 消息监听器
        this.messageListeners = [];

        // 连接状态监听器
        this.statusListeners = [];
    }


    /**
     * 建立连接
     *
     * @param token RuoYi JWT Token
     * @param url WebSocket 地址
     */
    connect(
        token,
        url = ''
    ) {

        if (!token) {

            console.error(
                '[WebSocket] Token 不存在'
            );

            return;
        }

        this.token = token;

        /*
         * 如果没有传 URL，
         * 默认使用当前服务器地址。
         */
        this.wsUrl =
            url ||
            this.getDefaultWsUrl();

        this.manualClose = false;

        /*
         * 已经连接
         */
        if (
            this.ws &&
            this.ws.readyState === WebSocket.OPEN
        ) {

            console.log(
                '[WebSocket] 已经连接'
            );

            return;
        }

        /*
         * 正在连接
         */
        if (
            this.ws &&
            this.ws.readyState === WebSocket.CONNECTING
        ) {

            return;
        }

        const fullUrl =
            this.wsUrl
            + '?token='
            + encodeURIComponent(this.token);

        console.log(
            '[WebSocket] 开始连接:',
            this.wsUrl
        );

        this.setStatus('connecting');

        try {

            this.ws =
                new WebSocket(fullUrl);

            this.bindEvents();

        } catch (error) {

            console.error(
                '[WebSocket] 创建连接失败:',
                error
            );

            this.setStatus('error');

            this.scheduleReconnect();
        }
    }


    /**
     * 获取默认 WebSocket 地址
     *
     * 开发环境：
     *
     * ws://localhost:8080/ws
     *
     * 生产环境：
     *
     * 根据当前页面协议自动判断
     */
    getDefaultWsUrl() {

        /*
         * 如果项目配置了环境变量，
         * 优先使用环境变量。
         */
        if (
            typeof import.meta !== 'undefined' &&
            import.meta.env &&
            import.meta.env.VITE_WS_URL
        ) {

            return import.meta.env.VITE_WS_URL;
        }

        /*
         * UniApp / Vue 环境
         */
        if (
            typeof window !== 'undefined' &&
            window.location
        ) {

            const protocol =
                window.location.protocol === 'https:'
                    ? 'wss:'
                    : 'ws:';

            return (
                protocol
                + '//'
                + window.location.host
                + '/ws'
            );
        }

        /*
         * 默认开发地址
         */
        return 'ws://localhost:8080/ws';
    }


    /**
     * 注册 WebSocket 事件
     */
    bindEvents() {

        if (!this.ws) {
            return;
        }


        /**
         * 连接成功
         */
        this.ws.onopen = () => {

            console.log(
                '[WebSocket] 连接成功'
            );

            this.reconnectCount = 0;

            this.setStatus('connected');

            this.startHeartbeat();
        };


        /**
         * 接收消息
         */
        this.ws.onmessage = (event) => {

            this.handleMessage(
                event.data
            );
        };


        /**
         * 连接错误
         */
        this.ws.onerror = (error) => {

            console.error(
                '[WebSocket] 连接错误',
                error
            );

            this.setStatus('error');
        };


        /**
         * 连接关闭
         */
        this.ws.onclose = (event) => {

            console.log(
                '[WebSocket] 连接关闭',
                event.code,
                event.reason
            );

            this.stopHeartbeat();

            this.ws = null;

            this.setStatus(
                'disconnected'
            );

            /*
             * 非主动关闭才自动重连
             */
            if (!this.manualClose) {

                this.scheduleReconnect();
            }
        };
    }


    /**
     * 处理服务器消息
     */
    handleMessage(data) {

        console.log(
            '[WebSocket] 收到:',
            data
        );

        let message;

        try {

            message =
                typeof data === 'string'
                    ? JSON.parse(data)
                    : data;

        } catch (error) {

            console.warn(
                '[WebSocket] 非 JSON 消息:',
                data
            );

            this.notifyMessage({
                type: 'RAW',
                data: data
            });

            return;
        }


        /*
         * PONG 不作为业务消息处理
         */
        if (
            message.type === 'PONG'
        ) {

            return;
        }


        /*
         * CONNECTED
         */
        if (
            message.type === 'CONNECTED'
        ) {

            console.log(
                '[WebSocket] 服务端确认连接'
            );
        }


        /*
         * 分发给业务层
         */
        this.notifyMessage(
            message
        );
    }


    /**
     * 注册消息监听器
     */
    onMessage(callback) {

        if (
            typeof callback !== 'function'
        ) {
            return () => {};
        }

        this.messageListeners.push(
            callback
        );

        /*
         * 返回取消监听函数
         */
        return () => {

            this.offMessage(
                callback
            );
        };
    }


    /**
     * 移除消息监听器
     */
    offMessage(callback) {

        this.messageListeners =
            this.messageListeners.filter(
                item => item !== callback
            );
    }


    /**
     * 通知业务层
     */
    notifyMessage(message) {

        this.messageListeners
            .forEach(callback => {

                try {

                    callback(message);

                } catch (error) {

                    console.error(
                        '[WebSocket] 消息监听器异常:',
                        error
                    );
                }
            });
    }


    /**
     * 发送消息
     */
    send(message) {

        if (
            !this.ws ||
            this.ws.readyState !==
            WebSocket.OPEN
        ) {

            console.warn(
                '[WebSocket] 当前未连接'
            );

            return false;
        }

        try {

            const data =
                typeof message === 'string'
                    ? message
                    : JSON.stringify(message);

            this.ws.send(data);

            console.log(
                '[WebSocket] 发送:',
                data
            );

            return true;

        } catch (error) {

            console.error(
                '[WebSocket] 发送失败:',
                error
            );

            return false;
        }
    }


    /**
     * 发送 PING
     */
    ping() {

        return this.send({
            type: 'PING'
        });
    }


    /**
     * 开启心跳
     */
    startHeartbeat() {

        this.stopHeartbeat();

        this.heartbeatTimer =
            setInterval(() => {

                if (
                    this.ws &&
                    this.ws.readyState ===
                    WebSocket.OPEN
                ) {

                    this.ping();
                }

            }, this.heartbeatInterval);
    }


    /**
     * 停止心跳
     */
    stopHeartbeat() {

        if (this.heartbeatTimer) {

            clearInterval(
                this.heartbeatTimer
            );

            this.heartbeatTimer = null;
        }
    }


    /**
     * 自动重连
     */
    scheduleReconnect() {

        if (this.manualClose) {
            return;
        }

        if (
            this.reconnectCount >=
            this.maxReconnectCount
        ) {

            console.error(
                '[WebSocket] 达到最大重连次数'
            );

            return;
        }

        this.reconnectCount++;

        console.log(
            `[WebSocket] ${this.reconnectInterval / 1000} 秒后重连，第 ${this.reconnectCount} 次`
        );

        setTimeout(() => {

            if (!this.manualClose) {

                this.connect(
                    this.token,
                    this.wsUrl
                );
            }

        }, this.reconnectInterval);
    }


    /**
     * 主动关闭
     */
    close() {

        this.manualClose = true;

        this.stopHeartbeat();

        this.reconnectCount = 0;

        if (this.ws) {

            try {

                this.ws.close(
                    1000,
                    'client close'
                );

            } catch (error) {

                console.warn(
                    '[WebSocket] 关闭失败',
                    error
                );
            }

            this.ws = null;
        }

        this.setStatus(
            'disconnected'
        );
    }


    /**
     * 判断是否连接
     */
    isConnected() {

        return (
            this.ws &&
            this.ws.readyState ===
            WebSocket.OPEN
        );
    }


    /**
     * 获取连接状态
     */
    getStatus() {

        if (!this.ws) {
            return 'disconnected';
        }

        switch (
            this.ws.readyState
        ) {

            case WebSocket.CONNECTING:
                return 'connecting';

            case WebSocket.OPEN:
                return 'connected';

            case WebSocket.CLOSING:
                return 'closing';

            case WebSocket.CLOSED:
                return 'disconnected';

            default:
                return 'unknown';
        }
    }


    /**
     * 状态监听
     */
    onStatus(callback) {

        if (
            typeof callback !== 'function'
        ) {
            return () => {};
        }

        this.statusListeners.push(
            callback
        );

        return () => {

            this.statusListeners =
                this.statusListeners.filter(
                    item => item !== callback
                );
        };
    }


    /**
     * 更新状态
     */
    setStatus(status) {

        this.statusListeners
            .forEach(callback => {

                try {

                    callback(status);

                } catch (error) {

                    console.error(
                        '[WebSocket] 状态监听器异常:',
                        error
                    );
                }
            });
    }
}


/*
 * 全局只创建一个 WebSocket 实例。
 *
 * 非常重要：
 *
 * 整个 App 不要在每个页面 new WebSocketService。
 *
 * 否则可能出现：
 *
 * 首页一个连接
 * AI页面一个连接
 * 订单页面一个连接
 *
 * 最后一个用户产生多个 WebSocket。
 */
const websocketService =
    new WebSocketService();


export default websocketService;