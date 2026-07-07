const WebSocket = require('ws');
const dgram = require('dgram');
const os = require('os');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { OPCUAClient, MessageSecurityMode, SecurityPolicy, resolveNodeId, AttributeIds } = require('node-opcua-client');
const { DataType, Variant } = require('node-opcua-variant');

const CONFIG = {
  HTTP_PORT: 3001,
  WS_PORT: 8082,
  UDP_PORT: 6060,
  MULTICAST_ADDRESS: 'ff03::c',
  TIMEOUT: 1000,
  DIRECT_OPCUA_IDLE_TIMEOUT: 5 * 60 * 1000
};

const STATIC_DIR = path.resolve(__dirname, '..', 'dist');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const httpServer = http.createServer((req, res) => {
  const requestedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const requestedPath = decodeURIComponent(requestedUrl.pathname);
  const normalizedPath = requestedPath === '/' ? '/index.html' : requestedPath;
  const filePath = path.resolve(STATIC_DIR, `.${normalizedPath}`);

  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const servePath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(STATIC_DIR, 'index.html');

  fs.readFile(servePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Frontend files were not found. Please build the app before starting the packaged server.');
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(servePath).toLowerCase()] || 'application/octet-stream'
    });
    res.end(content);
  });
});

httpServer.listen(CONFIG.HTTP_PORT, () => {
  console.log(`HTTP server started on http://localhost:${CONFIG.HTTP_PORT}`);
});

const nodeNameCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base'
});

function getSortableNodeName(node) {
  return node?.browseName || node?.displayName || node?.nodeId || '';
}

function sortOpcuaNodes(nodes) {
  return [...nodes]
    .sort((left, right) => nodeNameCollator.compare(
      getSortableNodeName(left),
      getSortableNodeName(right)
    ))
    .map((node) => ({
      ...node,
      children: Array.isArray(node.children) ? sortOpcuaNodes(node.children) : node.children
    }));
}

function formatAccessLevelBits(accessLevelValue) {
  const numericAccessLevel = Number(accessLevelValue);
  if (!Number.isFinite(numericAccessLevel)) {
    return undefined;
  }

  if (numericAccessLevel === 0) {
    return 'None';
  }

  const canRead = (numericAccessLevel & 1) === 1;
  const canWrite = (numericAccessLevel & 2) === 2;

  if (canRead && canWrite) return 'ReadWrite';
  if (canRead) return 'Read';
  if (canWrite) return 'Write';
  return undefined;
}

function formatAccessLevel(accessLevelValue) {
  if (accessLevelValue === undefined || accessLevelValue === null) {
    return undefined;
  }

  if (typeof accessLevelValue === 'number' || typeof accessLevelValue === 'bigint') {
    return formatAccessLevelBits(accessLevelValue);
  }

  if (typeof accessLevelValue === 'string') {
    const trimmedAccessLevel = accessLevelValue.trim();
    if (!trimmedAccessLevel) {
      return undefined;
    }

    const numericAccessLevel = Number(trimmedAccessLevel);
    if (!Number.isNaN(numericAccessLevel)) {
      return formatAccessLevelBits(numericAccessLevel);
    }

    const compactAccessLevel = trimmedAccessLevel.toLowerCase().replace(/[^a-z0-9]/g, '');
    const canRead = compactAccessLevel.includes('read') || compactAccessLevel.includes('currentread') || compactAccessLevel.includes('readcurrent');
    const canWrite = compactAccessLevel.includes('write') || compactAccessLevel.includes('currentwrite') || compactAccessLevel.includes('writecurrent');

    if (canRead && canWrite) return 'ReadWrite';
    if (canRead) return 'Read';
    if (canWrite) return 'Write';
    if (compactAccessLevel === 'none') return 'None';
    return undefined;
  }

  if (Array.isArray(accessLevelValue)) {
    return formatAccessLevel(accessLevelValue.join('|'));
  }

  if (typeof accessLevelValue === 'object') {
    if (accessLevelValue.value !== undefined) {
      return formatAccessLevel(accessLevelValue.value);
    }

    const enabledKeys = Object.entries(accessLevelValue)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${key}:${value}`);

    return formatAccessLevel(enabledKeys.length > 0 ? enabledKeys.join('|') : accessLevelValue.toString?.());
  }

  return undefined;
}

// 创建WebSocket服务器
const wss = new WebSocket.Server({ port: CONFIG.WS_PORT });
console.log(`WebSocket server started on port ${CONFIG.WS_PORT}`);

// 存储OPC UA连接
const opcuaConnections = new Map();
// 存储OPC UA服务器模型数据（deviceId -> nodes）
const opcuaModels = new Map();
const pendingOpcuaRequests = new Map();

function isDirectOperationDevice(deviceId) {
  return typeof deviceId === 'string' && deviceId.startsWith('direct_');
}

async function closeOpcuaConnection(deviceId, reason = 'manual') {
  const connection = opcuaConnections.get(deviceId);
  if (!connection) {
    return;
  }

  if (connection.idleTimer) {
    clearTimeout(connection.idleTimer);
  }

  opcuaConnections.delete(deviceId);
  opcuaModels.delete(deviceId);

  try {
    if (connection.session) {
      await connection.session.close();
    }
  } catch (error) {
    console.error(`Failed to close OPC UA session for ${deviceId}:`, error);
  }

  try {
    if (connection.client) {
      await connection.client.disconnect();
    }
  } catch (error) {
    console.error(`Failed to disconnect OPC UA client for ${deviceId}:`, error);
  }

  console.log(`OPC UA connection closed for ${deviceId}, reason: ${reason}`);
}

function scheduleDirectOpcuaIdleCleanup(deviceId) {
  const connection = opcuaConnections.get(deviceId);
  if (!connection || !isDirectOperationDevice(deviceId)) {
    return;
  }

  if (connection.idleTimer) {
    clearTimeout(connection.idleTimer);
  }

  connection.idleTimer = setTimeout(() => {
    closeOpcuaConnection(deviceId, 'idle-timeout');
  }, CONFIG.DIRECT_OPCUA_IDLE_TIMEOUT);
}

function touchOpcuaConnection(deviceId) {
  const connection = opcuaConnections.get(deviceId);
  if (!connection) {
    return;
  }

  connection.lastUsed = Date.now();
  scheduleDirectOpcuaIdleCleanup(deviceId);
}

async function isOpcuaConnectionAlive(connection) {
  try {
    await connection.session.read([{
      nodeId: 'ns=0;i=2258',
      attributeId: AttributeIds.Value
    }]);
    return true;
  } catch (error) {
    console.warn('OPC UA connection health check failed:', error.message);
    return false;
  }
}

function normalizeAddressFamily(family) {
  if (family === 4 || family === 'IPv4') return 'IPv4';
  if (family === 6 || family === 'IPv6') return 'IPv6';
  return String(family);
}

function splitScopedIpv6Address(address) {
  const [host, zone] = String(address).split('%');
  return { host, zone };
}

function getSystemNetworkInterfaces() {
  return Object.entries(os.networkInterfaces()).map(([name, addresses = []]) => {
    const normalizedAddresses = addresses.map((addressInfo) => ({
      ...addressInfo,
      family: normalizeAddressFamily(addressInfo.family)
    }));

    const ipv4Addresses = normalizedAddresses
      .filter((addressInfo) => addressInfo.family === 'IPv4')
      .map((addressInfo) => addressInfo.address);

    const ipv6AddressInfos = normalizedAddresses
      .filter((addressInfo) => addressInfo.family === 'IPv6');

    const firstExternalAddress = normalizedAddresses.find((addressInfo) => !addressInfo.internal);
    const firstAddress = firstExternalAddress || normalizedAddresses[0];
    const firstMacAddress = normalizedAddresses.find((addressInfo) => addressInfo.mac && addressInfo.mac !== '00:00:00:00:00:00');
    const scopedIpv6Address = ipv6AddressInfos.find((addressInfo) => {
      const scoped = splitScopedIpv6Address(addressInfo.address);
      return !addressInfo.internal && scoped.host.toLowerCase().startsWith('fe80:') && (addressInfo.scopeid || scoped.zone);
    }) || ipv6AddressInfos.find((addressInfo) => {
      const scoped = splitScopedIpv6Address(addressInfo.address);
      return !addressInfo.internal && (addressInfo.scopeid || scoped.zone);
    }) || ipv6AddressInfos.find((addressInfo) => !addressInfo.internal) || ipv6AddressInfos[0];
    const scopedAddressParts = scopedIpv6Address ? splitScopedIpv6Address(scopedIpv6Address.address) : null;
    const scopeId = scopedIpv6Address?.scopeid ?? scopedAddressParts?.zone;
    const rawIpv6Addresses = ipv6AddressInfos.map((addressInfo) => splitScopedIpv6Address(addressInfo.address).host);
    const ipv6Addresses = scopedAddressParts
      ? [scopedAddressParts.host, ...rawIpv6Addresses.filter((address) => address !== scopedAddressParts.host)]
      : rawIpv6Addresses;

    return {
      id: name,
      name,
      ipv4Addresses,
      ipv6Addresses,
      macAddress: firstMacAddress?.mac || firstAddress?.mac || '00:00:00:00:00:00',
      isUp: normalizedAddresses.length > 0,
      isLoopback: normalizedAddresses.length > 0 && normalizedAddresses.every((addressInfo) => addressInfo.internal),
      scopeId,
      multicastInterface: scopedAddressParts && scopeId ? `${scopedAddressParts.host}%${scopeId}` : undefined
    };
  });
}

function getInterfaceById(interfaceId) {
  return getSystemNetworkInterfaces().find((networkInterface) => networkInterface.id === interfaceId);
}

function getMulticastTargetAddress(multicastAddress, networkInterface) {
  if (!networkInterface?.scopeId || String(multicastAddress).includes('%')) {
    return multicastAddress;
  }

  return `${multicastAddress}%${networkInterface.scopeId}`;
}

function macToBuffer(macAddress) {
  const buffer = Buffer.alloc(6);
  if (!macAddress) return buffer;

  String(macAddress)
    .split(/[:-]/)
    .slice(0, 6)
    .forEach((part, index) => {
      const value = parseInt(part, 16);
      buffer[index] = Number.isFinite(value) ? value : 0;
    });

  return buffer;
}

function ipv6ToBuffer(ipv6Address) {
  const buffer = Buffer.alloc(16);
  if (!ipv6Address) return buffer;

  const address = String(ipv6Address).split('%')[0];
  const [leftPart, rightPart = ''] = address.split('::');
  const left = leftPart ? leftPart.split(':') : [];
  const right = rightPart ? rightPart.split(':') : [];
  const zeroCount = Math.max(0, 8 - left.length - right.length);
  const parts = [...left, ...Array(zeroCount).fill('0'), ...right].slice(0, 8);

  parts.forEach((part, index) => {
    const value = parseInt(part || '0', 16);
    buffer.writeUInt16BE(Number.isFinite(value) ? value : 0, index * 2);
  });

  return buffer;
}

// 创建UDP套接字
const udpSocket = dgram.createSocket('udp6');
udpSocket.bind(CONFIG.UDP_PORT, () => {
  console.log(`UDP socket bound to port ${CONFIG.UDP_PORT}`);
});

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'get-network-interfaces':
          ws.send(JSON.stringify({
            type: 'network-interfaces',
            interfaces: getSystemNetworkInterfaces()
          }));
          break;

        case 'scan':
          console.log('Received scan request:', data);
          const selectedInterface = getInterfaceById(data.interfaceId);
          const multicastAddress = data.multicastAddress || CONFIG.MULTICAST_ADDRESS;
          const scanPort = data.port || CONFIG.UDP_PORT;
          const multicastTargetAddress = getMulticastTargetAddress(multicastAddress, selectedInterface);
          console.log('Selected network interface:', selectedInterface || data.interfaceId);
          
          // 发送IPv6组播扫描请求
          const devices = [];
          
          // 生成随机序列号
          const sequenceNumber = Math.floor(Math.random() * 0xFFFFFFFF);
          
          // 构建扫描请求报文
          const buffer = Buffer.alloc(32);
          // 协议标识 (0xABDE)
          buffer.writeUInt16LE(0xABDE, 0);
          // 版本 (0x01)
          buffer.writeUInt8(0x01, 2);
          // 报文类型 (0x01 = 扫描请求)
          buffer.writeUInt8(0x01, 3);
          // 报文长度 (32)
          buffer.writeUInt16LE(32, 4);
          // 序列号
          buffer.writeUInt32LE(sequenceNumber, 6);
          // 前端MAC地址 (模拟)
          macToBuffer(selectedInterface?.macAddress).copy(buffer, 10);
          // 前端IPv6地址 (模拟)
          ipv6ToBuffer(selectedInterface?.ipv6Addresses?.[0]).copy(buffer, 16);
          
          // 发送组播请求
          console.log('准备发送IPv6组播报文到:', multicastTargetAddress, '端口:', scanPort);
          console.log('报文内容:', buffer.toString('hex'));
          
          if (selectedInterface?.multicastInterface) {
            try {
              udpSocket.setMulticastInterface(selectedInterface.multicastInterface);
              console.log('Using multicast interface:', selectedInterface.multicastInterface);
            } catch (error) {
              console.error('Failed to set multicast interface:', error);
            }
          }

          udpSocket.send(buffer, scanPort, multicastTargetAddress, (err) => {
            if (err) {
              console.error('Error sending multicast request:', err);
            } else {
              console.log('Multicast scan request sent successfully to', multicastTargetAddress, ':', scanPort);
              console.log('报文长度:', buffer.length, '字节');
            }
          });
          
          const timeout = setTimeout(() => {
            console.log('Scan timeout, found', devices.length, 'devices');
            ws.send(JSON.stringify({ type: 'scan-complete', devices }));
          }, CONFIG.TIMEOUT);

          // 接收设备应答
          const messageHandler = (msg, rinfo) => {
            console.log('Received UDP response from:', rinfo.address, ':', rinfo.port);
            
            // 解析设备应答报文
            if (msg.length >= 32) {
              const protocolId = msg.readUInt16LE(0);
              const version = msg.readUInt8(2);
              const messageType = msg.readUInt8(3);
              
              if (protocolId === 0xABDE && version === 0x01 && messageType === 0x02) {
                console.log('Received valid ADDP device response');
                
                // 解析设备信息
                const deviceType = msg.readUInt8(32);
                const deviceIpv6 = msg.slice(33, 49);
                const deviceMac = msg.slice(49, 55);
                const deviceName = msg.slice(55, 87).toString('utf8').trim();
                const model = msg.slice(87, 119).toString('utf8').trim();
                const busCount = msg.readUInt8(119);
                const opcuaPort = msg.readUInt16LE(120);
                const opcuaPath = msg.slice(122, 154).toString('utf8').trim();

                // 打印ADDP协议应答报文的各字段
                console.log('ADDP Response Fields:');
                console.log('  Protocol ID:', protocolId.toString(16));
                console.log('  Version:', version);
                console.log('  Message Type:', messageType);
                console.log('  Device Type:', deviceType);
                console.log('  Device IPv6:', bytesToIpv6(deviceIpv6));
                console.log('  Device MAC:', deviceMac.toString('hex'));
                console.log('  Device Name:', deviceName);
                console.log('  Model:', model);
                console.log('  Bus Count:', busCount);
                console.log('  OPC UA Port:', opcuaPort);
                console.log('  OPC UA Path:', opcuaPath);

                // 构建设备对象
                const device = {
                  id: `controller-${devices.length + 1}`,
                  name: deviceName || `AUTBUS控制器-${devices.length + 1}`,
                  type: 'controller',
                  ipv6Address: bytesToIpv6(deviceIpv6),
                  status: 'online',
                  description: `AUTBUS控制器 ${model}`,
                  manufacturer: '东土科技',
                  model: model || 'ATB-3000',
                  firmwareVersion: 'v2.1.5',
                  opcuaEndpoint: `opc.tcp://[${bytesToIpv6(deviceIpv6)}]:${opcuaPort}${opcuaPath}`,
                  children: []
                };

                devices.push(device);
                console.log('Found device:', device.name, device.ipv6Address);
              }
            }
          };

          // 监听UDP消息
          udpSocket.on('message', messageHandler);

          // 清理超时和监听器
          clearTimeout(timeout);
          setTimeout(() => {
            udpSocket.off('message', messageHandler);
            console.log('Scan complete, found', devices.length, 'devices');
            
            // 只返回实际发现的设备，不使用模拟数据
            ws.send(JSON.stringify({ type: 'scan-complete', devices }));
          }, CONFIG.TIMEOUT);
          break;
          
        case 'opcua-connect':
          // OPC UA连接逻辑
          console.log('收到OPC UA连接请求:', data);
          const { endpoint, deviceId, skipBrowse } = data;
          
          try {
            const existingConnection = opcuaConnections.get(deviceId);
            if (existingConnection && existingConnection.endpoint === endpoint) {
              const isAlive = await isOpcuaConnectionAlive(existingConnection);
              if (isAlive) {
                touchOpcuaConnection(deviceId);
                ws.send(JSON.stringify({
                  type: 'opcua-connect-complete',
                  requestId: data.requestId,
                  deviceId,
                  status: 'connected',
                  nodes: skipBrowse ? [] : (opcuaModels.get(deviceId) || [])
                }));
                break;
              }

              await closeOpcuaConnection(deviceId, 'stale-before-reconnect');
            }

            // 创建OPC UA客户端
            const client = OPCUAClient.create({
              applicationName: 'AUTBUS Scanner',
              connectionStrategy: {
                initialDelay: 1000,
                maxRetry: 3
              },
              securityMode: MessageSecurityMode.None,
              securityPolicy: SecurityPolicy.None
            });
            pendingOpcuaRequests.set(data.requestId, { client, session: null, deviceId });
            
            // 连接到服务器
            await client.connect(endpoint);
            console.log('OPC UA客户端连接成功');
            
            // 创建会话
            const session = await client.createSession();
            pendingOpcuaRequests.set(data.requestId, { client, session, deviceId });
            console.log('OPC UA会话创建成功');
            
            // 保存连接信息
            opcuaConnections.set(deviceId, {
              client,
              session,
              endpoint,
              lastUsed: Date.now(),
              idleTimer: null
            });
            scheduleDirectOpcuaIdleCleanup(deviceId);

            if (skipBrowse) {
              pendingOpcuaRequests.delete(data.requestId);
              ws.send(JSON.stringify({
                type: 'opcua-connect-complete',
                requestId: data.requestId,
                deviceId,
                status: 'connected',
                nodes: []
              }));
              break;
            }
            
            // 浏览节点
            const nodes = await browseNodes(session);
            if (!pendingOpcuaRequests.has(data.requestId) && !opcuaConnections.has(deviceId)) {
              break;
            }
            pendingOpcuaRequests.delete(data.requestId);
            
            // 保存模型数据
            opcuaModels.set(deviceId, nodes);
            console.log(`保存了设备 ${deviceId} 的OPC UA模型数据，包含 ${nodes.length} 个根节点`);
            // 打印模型数据结构（前500个字符）
            console.log(`模型数据摘要: ${JSON.stringify(nodes).substring(0, 500)}...`);
            
            // 返回连接结果
            ws.send(JSON.stringify({
              type: 'opcua-connect-complete',
              requestId: data.requestId, // 包含requestId，以便前端能够正确处理响应
              deviceId,
              status: 'connected',
              nodes
            }));
          } catch (error) {
            pendingOpcuaRequests.delete(data.requestId);
            console.error('OPC UA连接失败:', error);
            ws.send(JSON.stringify({
              type: 'opcua-connect-complete',
              requestId: data.requestId, // 包含requestId，以便前端能够正确处理响应
              deviceId,
              status: 'error',
              errorMessage: error.message
            }));
          }
          break;
          
        case 'opcua-disconnect':
          // OPC UA断开连接逻辑
          console.log('收到OPC UA断开连接请求:', data);
          const { deviceId: disconnectDeviceId } = data;
          
          try {
            const connection = opcuaConnections.get(disconnectDeviceId);
            if (connection) {
              await closeOpcuaConnection(disconnectDeviceId, 'manual-disconnect');
              console.log('OPC UA连接已断开，模型数据已清理');
            }
            ws.send(JSON.stringify({
              type: 'opcua-disconnect-complete',
              requestId: data.requestId, // 包含requestId，以便前端能够正确处理响应
              deviceId: disconnectDeviceId,
              status: 'disconnected'
            }));
          } catch (error) {
            console.error('OPC UA断开连接失败:', error);
            ws.send(JSON.stringify({
              type: 'opcua-disconnect-complete',
              requestId: data.requestId, // 包含requestId，以便前端能够正确处理响应
              deviceId: disconnectDeviceId,
              status: 'error',
              errorMessage: error.message
            }));
          }
          break;

        case 'opcua-browse':
          // OPC UA重新浏览节点点表
          console.log('收到OPC UA浏览节点请求:', data);
          const { deviceId: browseDeviceId } = data;

          try {
            const connection = opcuaConnections.get(browseDeviceId);
            if (!connection) {
              throw new Error('未找到OPC UA连接');
            }
            touchOpcuaConnection(browseDeviceId);

            const nodes = await browseNodes(connection.session);
            opcuaModels.set(browseDeviceId, nodes);
            console.log(`设备 ${browseDeviceId} 点表刷新完成，包含 ${nodes.length} 个根节点`);

            ws.send(JSON.stringify({
              type: 'opcua-browse-complete',
              requestId: data.requestId,
              deviceId: browseDeviceId,
              status: 'success',
              nodes
            }));
          } catch (error) {
            console.error('OPC UA浏览节点失败:', error);
            ws.send(JSON.stringify({
              type: 'opcua-browse-complete',
              requestId: data.requestId,
              deviceId: browseDeviceId,
              status: 'error',
              errorMessage: error.message
            }));
          }
          break;
          
        case 'opcua-read':
          // OPC UA读取节点值逻辑
          console.log('收到OPC UA读取请求:', data);
          const { deviceId: readDeviceId, nodeId } = data;
          
          try {
            const connection = opcuaConnections.get(readDeviceId);
            if (!connection) {
              throw new Error('未找到OPC UA连接');
            }
            touchOpcuaConnection(readDeviceId);
            
            // 解析 NodeId
            const resolvedNodeId = resolveNodeId(nodeId);
            console.log('解析后的 NodeId:', resolvedNodeId);
            
            // 先从模型中获取显示名称
            let displayName = getDisplayNameFromModel(readDeviceId, nodeId);
            
            // 读取当前节点信息。Value/DataType/AccessLevel 对非变量节点可能为空，但 DisplayName 仍可刷新。
            const attributesToRead = [
              { nodeId: resolvedNodeId, attributeId: AttributeIds.Value },
              { nodeId: resolvedNodeId, attributeId: AttributeIds.DisplayName },
              { nodeId: resolvedNodeId, attributeId: AttributeIds.DataType },
              { nodeId: resolvedNodeId, attributeId: AttributeIds.AccessLevel }
            ];

            const result = await connection.session.read(attributesToRead);

            const value = result[0]?.value?.value;
            const dataType = result[0]?.value?.dataType
              ? result[0].value.dataType.toString()
              : (result[2]?.value?.value ? result[2].value.value.toString() : undefined);
            const accessLevel = formatAccessLevel(result[3]?.value?.value);

            // 如果模型中的显示名称不存在，则使用服务器返回的 DisplayName 属性。
            if (!displayName && result[1]?.value?.value) {
              displayName = result[1].value.value.text;
            }
            
            console.log(`读取节点成功: ${nodeId}, 值: ${value}, 显示名称: ${displayName}, 数据类型: ${dataType}, 访问级别: ${accessLevel}`);
            
            ws.send(JSON.stringify({
              type: 'opcua-read-complete',
              requestId: data.requestId, // 包含requestId，以便前端能够正确处理响应
              deviceId: readDeviceId,
              nodeId,
              status: 'success',
              value,
              displayName,
              dataType,
              accessLevel
            }));
          } catch (error) {
            console.error('读取节点值失败:', error);
            ws.send(JSON.stringify({
              type: 'opcua-read-complete',
              requestId: data.requestId, // 包含requestId，以便前端能够正确处理响应
              deviceId: readDeviceId,
              nodeId,
              errorMessage: error.message
            }));
          }
          break;
          
        case 'opcua-write':
          // OPC UA写入节点值逻辑
          console.log('收到OPC UA写入请求:', data);
          const { deviceId: writeDeviceId, nodeId: writeNodeId, value: writeValue } = data;
          
          let connection = null;
          let finalValue = null;
          let resolvedNodeId = null;
          let finalDataType = undefined;
          let finalAccessLevel = undefined;
          
          try {
            connection = opcuaConnections.get(writeDeviceId);
            if (!connection) {
              throw new Error('未找到OPC UA连接');
            }
            touchOpcuaConnection(writeDeviceId);
            
            // 解析 NodeId
            resolvedNodeId = resolveNodeId(writeNodeId);
            console.log('解析后的 NodeId:', resolvedNodeId);
            
            // 首先读取节点的数据类型和当前值
            const readResult = await connection.session.read([{
              nodeId: resolvedNodeId,
              attributeId: AttributeIds.Value
            }]);
            
            let valueToWrite = writeValue;
            let dataType = null;
            
            // 检查是否有现有值，并基于现有值的格式进行转换
            if (readResult && readResult[0] && readResult[0].value) {
              const existingValue = readResult[0].value.value;
              dataType = readResult[0].value.dataType;
              console.log(`节点 ${writeNodeId} 当前值:`, existingValue, '类型:', typeof existingValue, 'dataType:', dataType);
              
              // 根据现有值的类型转换新值
              if (typeof existingValue === 'number') {
                // 数字类型
                valueToWrite = Number(writeValue);
              } else if (typeof existingValue === 'boolean') {
                // 布尔类型
                if (typeof writeValue === 'string') {
                  valueToWrite = writeValue.toLowerCase() === 'true' || writeValue === '1';
                } else {
                  valueToWrite = Boolean(writeValue);
                }
              }
              // 字符串类型直接使用
            }
            
            console.log(`准备写入的值:`, valueToWrite, '类型:', typeof valueToWrite);
            
            // 创建正确的 Variant 对象
            let variant;
            if (dataType !== null) {
              // 使用读取到的 dataType
              variant = new Variant({
                dataType: dataType,
                value: valueToWrite
              });
            } else {
              // 根据值的类型推断 dataType
              if (typeof valueToWrite === 'number') {
                variant = new Variant({
                  dataType: DataType.Double,
                  value: valueToWrite
                });
              } else if (typeof valueToWrite === 'boolean') {
                variant = new Variant({
                  dataType: DataType.Boolean,
                  value: valueToWrite
                });
              } else {
                variant = new Variant({
                  dataType: DataType.String,
                  value: String(valueToWrite)
                });
              }
            }
            
            console.log('创建的 Variant:', variant);
            
            // 使用 node-opcua 的 writeSingleNode 方法
            const writeResult = await connection.session.writeSingleNode(resolvedNodeId, variant);
            
            console.log('写入结果:', writeResult);
            
            if (writeResult.value === 0) { // Good
              console.log('写入节点值成功');
            } else {
              throw new Error(`写入失败: ${writeResult.description}`);
            }
          } catch (error) {
            console.error('写入节点值失败:', error);
          }
          
          // 无论成功失败，都重新读取最新值
          let finalDisplayName = null;
          try {
            if (connection && resolvedNodeId) {
              console.log('重新读取节点最新值...');
              
              // 先从模型中获取显示名称
              finalDisplayName = getDisplayNameFromModel(writeDeviceId, writeNodeId);
              
              // 读取节点值（如果没有从模型中获取到显示名称，再读取DisplayName属性）
              const attributesToRead = [
                { nodeId: resolvedNodeId, attributeId: AttributeIds.Value },
                { nodeId: resolvedNodeId, attributeId: AttributeIds.DisplayName },
                { nodeId: resolvedNodeId, attributeId: AttributeIds.DataType },
                { nodeId: resolvedNodeId, attributeId: AttributeIds.AccessLevel }
              ];
              
              const verifyRead = await connection.session.read(attributesToRead);
              
              if (verifyRead && verifyRead[0] && verifyRead[0].value) {
                finalValue = verifyRead[0].value.value;
                if (verifyRead[0].value.dataType) {
                  finalDataType = verifyRead[0].value.dataType.toString();
                }
                console.log('Read latest node value:', finalValue);
              }

              if (!finalDataType && verifyRead[2]?.value?.value) {
                finalDataType = verifyRead[2].value.value.toString();
              }

              finalAccessLevel = formatAccessLevel(verifyRead[3]?.value?.value);
              
              if (!finalDisplayName && verifyRead[1]?.value?.value) {
                finalDisplayName = verifyRead[1].value.value.text;
                console.log('Read displayName:', finalDisplayName);
              }
            }
          } catch (readError) {
            console.error('读取最新值失败:', readError);
          }
          
          // 发送响应
          ws.send(JSON.stringify({
            type: 'opcua-write-complete',
            requestId: data.requestId,
            deviceId: writeDeviceId,
            nodeId: writeNodeId,
            status: finalValue !== null ? 'success' : 'error',
            value: finalValue,
            displayName: finalDisplayName,
            dataType: finalDataType,
            accessLevel: finalAccessLevel,
            errorMessage: finalValue !== null ? undefined : '读取值失败'
          }));
          
          break;
        
        case 'opcua-cancel':
          // 取消OPC UA操作
          console.log('收到取消OPC UA操作请求:', data);
          const pendingRequest = pendingOpcuaRequests.get(data.requestId);
          if (pendingRequest) {
            pendingOpcuaRequests.delete(data.requestId);
            try {
              const savedConnection = opcuaConnections.get(pendingRequest.deviceId);
              if (savedConnection) {
                await closeOpcuaConnection(pendingRequest.deviceId, 'cancel');
              } else {
                if (pendingRequest.session) {
                  await pendingRequest.session.close();
                }
                if (pendingRequest.client) {
                  await pendingRequest.client.disconnect();
                }
                opcuaModels.delete(pendingRequest.deviceId);
              }
              console.log('Canceled pending OPC UA request:', data.requestId);
            } catch (error) {
              console.error('Failed to cancel pending OPC UA request:', error);
            }
          }
          break;
          
        default:
          console.log('未知消息类型:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// 辅助函数：字节转IPv6地址
function bytesToIpv6(bytes) {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    parts.push(((bytes[i * 2] << 8) | bytes[i * 2 + 1]).toString(16));
  }
  return parts.join(':');
}

// 辅助函数：规范化NodeId（处理大小写、GUID格式等）
function normalizeNodeId(nodeId) {
  if (typeof nodeId !== 'string') return nodeId;
  
  // 转换为小写
  let normalized = nodeId.toLowerCase();
  
  // 检查是否是GUID格式的NodeId
  if (normalized.startsWith('ns=1;g=')) {
    const guidPart = normalized.substring(6);
    // 移除GUID中的分隔符（-）以进行更宽松的比较
    const strippedGuid = guidPart.replace(/-/g, '');
    return strippedGuid;
  }
  
  return normalized;
}

// 辅助函数：从模型中查找节点
function findNodeInModel(nodes, targetNodeId) {
  for (const node of nodes) {
    // 规范化比较
    const normalizedNodeId = normalizeNodeId(node.nodeId);
    const normalizedTargetId = normalizeNodeId(targetNodeId);
    
    console.log(`比较节点: ${node.nodeId} (规范化: ${normalizedNodeId}) 与目标: ${targetNodeId} (规范化: ${normalizedTargetId})`);
    
    if (normalizedNodeId === normalizedTargetId) {
      console.log(`找到匹配的节点: ${node.nodeId}, 显示名称: ${node.displayName}`);
      return node;
    }
    
    // 也尝试直接比较（防止规范化导致的问题）
    if (node.nodeId === targetNodeId || node.nodeId.toLowerCase() === targetNodeId.toLowerCase()) {
      console.log(`找到匹配的节点（直接比较）: ${node.nodeId}, 显示名称: ${node.displayName}`);
      return node;
    }
    
    if (node.children && node.children.length > 0) {
      console.log(`递归查找子节点: ${node.nodeId} 有 ${node.children.length} 个子节点`);
      const found = findNodeInModel(node.children, targetNodeId);
      if (found) {
        return found;
      }
    }
  }
  console.log(`未找到节点: ${targetNodeId}`);
  return null;
}

// 错误处理
function getNodeDisplayName(node) {
  return node ? (node.displayName || node.browseName || null) : null;
}

function findDisplayNameInModel(model, nodeId, modelDeviceId) {
  if (!model) {
    return null;
  }

  console.log(`Searching model displayName - DeviceId: ${modelDeviceId}, NodeId: ${nodeId}, RootCount: ${model.length}`);

  let node = findNodeInModel(model, nodeId);

  if (!node && typeof nodeId === 'string' && nodeId.startsWith('ns=1;g=')) {
    const guidPart = nodeId.substring(6);
    const guidVariants = [
      guidPart,
      guidPart.toUpperCase(),
      guidPart.toLowerCase(),
      guidPart.replace(/-/g, ''),
      guidPart.toUpperCase().replace(/-/g, '')
    ];

    for (const variant of guidVariants) {
      const variantNodeId = `ns=1;g=${variant}`;
      console.log(`Trying GUID variant: ${variantNodeId}`);
      node = findNodeInModel(model, variantNodeId);
      if (node) break;
    }
  }

  const displayName = getNodeDisplayName(node);
  console.log(`Model displayName result: ${displayName}`);
  return displayName;
}

function getDisplayNameFromModel(deviceId, nodeId) {
  console.log(`Get displayName from model - DeviceId: ${deviceId}, NodeId: ${nodeId}`);

  const model = opcuaModels.get(deviceId);
  if (model) {
    const displayName = findDisplayNameInModel(model, nodeId, deviceId);
    if (displayName) {
      return displayName;
    }
  } else {
    console.log(`No model found for device ${deviceId}`);
  }

  const currentConnection = opcuaConnections.get(deviceId);
  const currentEndpoint = currentConnection ? currentConnection.endpoint : null;
  if (!currentEndpoint) {
    console.log(`No endpoint found for device ${deviceId}, cannot search peer models`);
    return null;
  }

  for (const [candidateDeviceId, connection] of opcuaConnections.entries()) {
    if (candidateDeviceId === deviceId) {
      continue;
    }

    if (!connection || connection.endpoint !== currentEndpoint) {
      continue;
    }

    const candidateModel = opcuaModels.get(candidateDeviceId);
    if (!candidateModel) {
      console.log(`Peer device ${candidateDeviceId} has same endpoint but no model`);
      continue;
    }

    console.log(`Trying peer model with same endpoint - SourceDeviceId: ${candidateDeviceId}`);
    const displayName = findDisplayNameInModel(candidateModel, nodeId, candidateDeviceId);
    if (displayName) {
      return displayName;
    }
  }

  console.log('No displayName found in current or same-endpoint models');
  return null;
}

udpSocket.on('error', (error) => {
  console.error('UDP socket error:', error);
});

// 递归浏览节点
async function recursiveBrowse(session, nodeId, depth = 0, visitedNodeIds = new Set()) {
  try {
    const browseResult = await session.browse({
      nodeId: nodeId,
      referenceTypeId: 'ns=0;i=35', // Organizes
      browseDirection: 0, // Forward
      includeSubtypes: true,
      nodeClassMask: 0,
      resultMask: 63 // All
    });

    const children = [];
    
    console.log(`浏览节点 ${nodeId}，找到 ${browseResult.references.length} 个子节点`);
    
    for (const ref of browseResult.references) {
      const childNodeId = ref.nodeId.toString();

      if (visitedNodeIds.has(childNodeId)) {
        console.log(`  跳过重复节点: ${ref.browseName.name} nodeid(${childNodeId})`);
        continue;
      }

      visitedNodeIds.add(childNodeId);
      console.log(`  子节点: ${ref.browseName.name} (${ref.nodeClass}) nodeid(${childNodeId})`);
      
      const childNode = {
        nodeId: childNodeId,
        browseName: ref.browseName.name,
        displayName: ref.displayName.text || ref.browseName.name,
        nodeClass: ref.nodeClass.toString(),
        children: []
      };

      // 对于变量节点，尝试获取其值和访问级别
      if (ref.nodeClass === 2) { // Variable 节点
        try {
          const readValues = [
            {
              nodeId: ref.nodeId,
              attributeId: AttributeIds.Value
            },
            {
              nodeId: ref.nodeId,
              attributeId: AttributeIds.AccessLevel
            }
          ];
          
          const readResults = await session.read(readValues);
          
          if (readResults && readResults[0] && readResults[0].value && readResults[0].value.value !== undefined) {
            childNode.value = readResults[0].value.value;
            childNode.dataType = readResults[0].value.dataType ? readResults[0].value.dataType.toString() : undefined;
            console.log(`  ???: ${childNode.value} (????: ${childNode.dataType})`);
          }

          const valueStatus = readResults?.[0]?.statusCode?.toString?.() || 'Unknown';
          const accessStatus = readResults?.[1]?.statusCode?.toString?.() || 'Unknown';
          let accessLevelValue;
          let accessLevelStr;

          if (readResults && readResults[1] && readResults[1].value && readResults[1].value.value !== undefined) {
            accessLevelValue = readResults[1].value.value;
            accessLevelStr = formatAccessLevel(accessLevelValue);
            if (accessLevelStr) {
              childNode.accessLevel = accessLevelStr;
              console.log(`  ????: ${childNode.accessLevel} (???: ${accessLevelValue})`);
            }
          }

          console.log(
            `[OPCUA-BROWSE-ACCESS] browseName="${childNode.browseName}" displayName="${childNode.displayName}" nodeId="${childNode.nodeId}" nodeClass="${childNode.nodeClass}" dataType="${childNode.dataType || '-'}" valueStatus="${valueStatus}" accessStatus="${accessStatus}" accessLevelRaw=${accessLevelValue ?? 'undefined'} accessLevel="${accessLevelStr ?? 'undefined'}" readWrite=${accessLevelStr === 'ReadWrite'}`
          );
        } catch (readErr) {
          console.error(`读取节点 ${ref.nodeId.toString()} 值或访问级别失败:`, readErr);
        }
      }

      // 递归浏览子节点，限制深度以避免无限递归
      // 不仅对Object节点递归，也对其他可能有子节点的节点类型递归
      if (depth < 7) { // 深度小于5
        childNode.children = await recursiveBrowse(session, ref.nodeId, depth + 1, visitedNodeIds);
      }

      children.push(childNode);
    }

    return sortOpcuaNodes(children);
  } catch (err) {
    console.error(`浏览节点 ${nodeId} 失败:`, err);
    return [];
  }
}

// 浏览OPC UA节点
async function browseNodes(session) {
  try {
    // 只从 Objects 文件夹建模。RootFolder(ns=0;i=84) 本身已经包含 Objects，
    // 同时把两者作为根节点会让 Objects 子树在页面上重复出现。
    const objectsNodeId = 'ns=0;i=85';
    const visitedNodeIds = new Set([objectsNodeId]);
    const nodes = [{
      nodeId: objectsNodeId,
      browseName: 'Objects',
      displayName: 'Objects',
      nodeClass: 'Object',
      children: await recursiveBrowse(session, objectsNodeId, 1, visitedNodeIds)
    }];

    // 打印详细的节点信息
    console.log('=== OPC UA节点树 ===');
    console.log(JSON.stringify(nodes, null, 2));
    console.log('==================');

    // 打印格式化的节点树
    console.log('=== 格式化节点树 ===');
    function printNodeTree(node, indent = '') {
      console.log(`${indent}${node.browseName} (${node.nodeClass}) nodeid(${node.nodeId})`);
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          printNodeTree(child, indent + '  ├─ ');
        }
      }
    }
    nodes.forEach(node => printNodeTree(node));
    console.log('==================');

    return nodes;
  } catch (error) {
    console.error('浏览节点失败:', error);
    return [];
  }
}

// 启动服务器
console.log('Backend service ready for device discovery');
