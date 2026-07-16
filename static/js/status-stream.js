/**
 * 播放状态 WebSocket 客户端 + 轮询兜底协调
 *
 * 优先用 WebSocket 订阅后端的播放状态推送（替代每秒 HTTP 轮询）；
 * WS 建连失败 / 断线且重连不上时，自动降级回每秒调用 loadDeviceStatus() 轮询。
 * 设备切换时断开旧连接、按新设备重连。
 */

import { handlePushedStatus, loadDeviceStatus } from './playback.js';

const POLL_INTERVAL_MS = 1000;      // 兜底轮询间隔（对齐原行为）
const MAX_RECONNECT_DELAY_MS = 15000; // 重连退避上限

let ws = null;
let currentAccountId = '';
let currentDeviceId = '';
let manualClose = false;            // 主动断开（设备切换/停用），不触发重连
let connected = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let pollingTimer = null;

/** 构造状态订阅 WebSocket 绝对 URL（保留 BASE_PATH 子路径前缀，带 access_token 握手鉴权） */
function buildWsUrl(accountId, deviceId) {
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';

    // 插件页面 pathname 形如 [<base_path>]/api/v1/jsplugin/miot；WebSocket 需绝对 URL，
    // 从中截取到插件根再拼 /status/ws，兼容子路径部署。
    const marker = '/api/v1/jsplugin/miot';
    const idx = loc.pathname.indexOf(marker);
    const base = idx >= 0 ? loc.pathname.slice(0, idx + marker.length) : marker;

    let token = '';
    try {
        if (window.SongloftPlugin && typeof SongloftPlugin.getAuthToken === 'function') {
            token = SongloftPlugin.getAuthToken() || '';
        }
    } catch (_) { /* ignore */ }

    const q = 'account_id=' + encodeURIComponent(accountId) +
              '&device_id=' + encodeURIComponent(deviceId) +
              (token ? '&access_token=' + encodeURIComponent(token) : '');
    return proto + '//' + loc.host + base + '/status/ws?' + q;
}

function startPolling() {
    if (pollingTimer) return;
    pollingTimer = setInterval(() => loadDeviceStatus(), POLL_INTERVAL_MS);
}

function stopPolling() {
    if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
    }
}

function scheduleReconnect() {
    if (manualClose || reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_MS);
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        openSocket();
    }, delay);
}

function openSocket() {
    // 无设备或环境不支持 WS：直接走兜底轮询（loadDeviceStatus 内部对空设备会早退）
    if (!currentAccountId || !currentDeviceId || typeof WebSocket === 'undefined') {
        startPolling();
        return;
    }

    let socket;
    try {
        socket = new WebSocket(buildWsUrl(currentAccountId, currentDeviceId));
    } catch (e) {
        console.warn('[status-stream] WebSocket 建连异常，降级轮询', e);
        startPolling();
        scheduleReconnect();
        return;
    }
    ws = socket;

    socket.onopen = () => {
        connected = true;
        reconnectAttempts = 0;
        stopPolling(); // WS 上线，停止兜底轮询
    };

    socket.onmessage = (ev) => {
        try {
            const msg = JSON.parse(ev.data);
            if (msg && msg.type === 'status' && msg.data) {
                handlePushedStatus(msg.data);
            }
        } catch (_) { /* 忽略非法帧 */ }
    };

    socket.onerror = () => {
        // onerror 后浏览器通常紧跟 onclose，统一在 onclose 里处理降级/重连
        try { socket.close(); } catch (_) { /* ignore */ }
    };

    socket.onclose = () => {
        if (ws === socket) ws = null;
        connected = false;
        if (!manualClose) {
            startPolling();     // 断线立即用轮询兜住
            scheduleReconnect();
        }
    };
}

/**
 * 连接（或按新设备重连）状态推送。设备变化时先断旧再连新；同设备已连则跳过。
 * @param {string} accountId
 * @param {string} deviceId
 */
export function connectStatusStream(accountId, deviceId) {
    accountId = accountId || '';
    deviceId = deviceId || '';

    const changed = accountId !== currentAccountId || deviceId !== currentDeviceId;
    if (!changed && (connected || ws || reconnectTimer)) {
        return; // 同设备且已在连接/重连中
    }
    if (changed) {
        disconnectStatusStream();
    }

    currentAccountId = accountId;
    currentDeviceId = deviceId;
    manualClose = false;
    reconnectAttempts = 0;
    openSocket();
}

/** 主动断开连接并停止兜底轮询（设备切换前 / 停用时调用） */
export function disconnectStatusStream() {
    manualClose = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (ws) {
        try { ws.close(); } catch (_) { /* ignore */ }
        ws = null;
    }
    connected = false;
    stopPolling();
}
