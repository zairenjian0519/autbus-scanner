const WebSocket = require('ws');
const dgram = require('dgram');
const { OPCUAClient, MessageSecurityMode, SecurityPolicy, resolveNodeId } = require('node-opcua-client');
const { DataType, Variant } = require('node-opcua-variant');

const CONFIG = {
  WS_PORT: 8082,
  UDP_PORT: 6060,
  MULTICAST_ADDRESS: 'ff03::c',
  TIMEOUT: 1000
};

// 创建WebSocket服务器
const wss = new WebSocket.Server({ port: CONFIG.WS_PORT });
console.log(`WebSocket server started on port ${CONFIG.WS_PORT}`);

// 存储OPC UA连接
const opcuaConnections = new Map();

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
        case 'scan':
          console.log('Received scan request:', data);
          
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
          buffer.writeUInt8(0x00, 10);
          buffer.writeUInt8(0x11, 11);
          buffer.writeUInt8(0x22, 12);
          buffer.writeUInt8(0x33, 13);
          buffer.writeUInt8(0x44, 14);
          buffer.writeUInt8(0x55, 15);
          // 前端IPv6地址 (模拟)
          for (let i = 0; i < 16; i++) {
            buffer.writeUInt8(0x00, 16 + i);
          }
          
          // 发送组播请求
          console.log('准备发送IPv6组播报文到:', CONFIG.MULTICAST_ADDRESS, '端口:', CONFIG.UDP_PORT);
          console.log('报文内容:', buffer.toString('hex'));
          
          udpSocket.send(buffer, CONFIG.UDP_PORT, CONFIG.MULTICAST_ADDRESS, (err) => {
            if (err) {
              console.error('Error sending multicast request:', err);
            } else {
              console.log('Multicast scan request sent successfully to', CONFIG.MULTICAST_ADDRESS, ':', CONFIG.UDP_PORT);
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
          const { endpoint, deviceId } = data;
          
          try {
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
            
            // 连接到服务器
            await client.connect(endpoint);
            console.log('OPC UA客户端连接成功');
            
            // 创建会话
            const session = await client.createSession();
            console.log('OPC UA会话创建成功');
            
            // 保存连接信息
            opcuaConnections.set(deviceId, { client, session });
            
            // 浏览节点
            const nodes = await browseNodes(session);
            
            // 返回连接结果
            ws.send(JSON.stringify({
              type: 'opcua-connect-complete',
              requestId: data.requestId, // 包含requestId，以便前端能够正确处理响应
              deviceId,
              status: 'connected',
              nodes
            }));
          } catch (error) {
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
              await connection.session.close();
              await connection.client.disconnect();
              opcuaConnections.delete(disconnectDeviceId);
              console.log('OPC UA连接已断开');
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
          
        case 'opcua-read':
          // OPC UA读取节点值逻辑
          console.log('收到OPC UA读取请求:', data);
          const { deviceId: readDeviceId, nodeId } = data;
          
          try {
            const connection = opcuaConnections.get(readDeviceId);
            if (!connection) {
              throw new Error('未找到OPC UA连接');
            }
            
            // 解析 NodeId
            const resolvedNodeId = resolveNodeId(nodeId);
            console.log('解析后的 NodeId:', resolvedNodeId);
            
            const result = await connection.session.read([{
              nodeId: resolvedNodeId,
              attributeId: 13 // Value attribute
            }]);
            
            const value = result[0].value.value;
            console.log('读取节点值成功:', value);
            
            ws.send(JSON.stringify({
              type: 'opcua-read-complete',
              requestId: data.requestId, // 包含requestId，以便前端能够正确处理响应
              deviceId: readDeviceId,
              nodeId,
              value
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
          
          try {
            connection = opcuaConnections.get(writeDeviceId);
            if (!connection) {
              throw new Error('未找到OPC UA连接');
            }
            
            // 解析 NodeId
            resolvedNodeId = resolveNodeId(writeNodeId);
            console.log('解析后的 NodeId:', resolvedNodeId);
            
            // 首先读取节点的数据类型和当前值
            const readResult = await connection.session.read([{
              nodeId: resolvedNodeId,
              attributeId: 13 // Value attribute
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
          try {
            if (connection && resolvedNodeId) {
              console.log('重新读取节点最新值...');
              const verifyRead = await connection.session.read([{
                nodeId: resolvedNodeId,
                attributeId: 13
              }]);
              
              if (verifyRead && verifyRead[0] && verifyRead[0].value) {
                finalValue = verifyRead[0].value.value;
                console.log('读取到的最新值:', finalValue);
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
            errorMessage: finalValue !== null ? undefined : '读取值失败'
          }));
          
          break;
        
        case 'opcua-cancel':
          // 取消OPC UA操作
          console.log('收到取消OPC UA操作请求:', data);
          // 这里可以添加取消正在进行的OPC UA操作的逻辑
          // 例如，取消正在进行的连接操作
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

// 错误处理
udpSocket.on('error', (error) => {
  console.error('UDP socket error:', error);
});

// 递归浏览节点
async function recursiveBrowse(session, nodeId, depth = 0) {
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
      console.log(`  子节点: ${ref.browseName.name} (${ref.nodeClass}) nodeid(${ref.nodeId.toString()})`);
      
      const childNode = {
        nodeId: ref.nodeId.toString(),
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
              attributeId: 13 // Value attribute
            },
            {
              nodeId: ref.nodeId,
              attributeId: 12 // AccessLevel attribute
            }
          ];
          
          const readResults = await session.read(readValues);
          
          // 读取值
          if (readResults && readResults[0] && readResults[0].value && readResults[0].value.value !== undefined) {
            childNode.value = readResults[0].value.value;
            childNode.dataType = readResults[0].value.dataType ? readResults[0].value.dataType.toString() : undefined;
            console.log(`  变量值: ${childNode.value} (数据类型: ${childNode.dataType})`);
          }
          
          // 读取访问级别
          if (readResults && readResults[1] && readResults[1].value && readResults[1].value.value !== undefined) {
            const accessLevelValue = readResults[1].value.value;
            // 解析访问级别：0=无访问权限，1=可读，2=可写，3=可读可写
            let accessLevelStr = "";
            if ((accessLevelValue & 1) === 1) accessLevelStr = "Read";
            if ((accessLevelValue & 2) === 2) {
              if (accessLevelStr.length > 0) accessLevelStr = "ReadWrite";
              else accessLevelStr = "Write";
            }
            if (accessLevelStr.length === 0) accessLevelStr = "None";
            childNode.accessLevel = accessLevelStr;
            console.log(`  访问级别: ${childNode.accessLevel} (原始值: ${accessLevelValue})`);
          }
        } catch (readErr) {
          console.error(`读取节点 ${ref.nodeId.toString()} 值或访问级别失败:`, readErr);
        }
      }

      // 递归浏览子节点，限制深度以避免无限递归
      // 不仅对Object节点递归，也对其他可能有子节点的节点类型递归
      if (depth < 7) { // 深度小于5
        childNode.children = await recursiveBrowse(session, ref.nodeId, depth + 1);
      }

      children.push(childNode);
    }

    return children;
  } catch (err) {
    console.error(`浏览节点 ${nodeId} 失败:`, err);
    return [];
  }
}

// 浏览OPC UA节点
async function browseNodes(session) {
  try {
    // 从根节点开始浏览
    const rootNodeId = 'ns=0;i=84'; // Server节点
    const objectsNodeId = 'ns=0;i=85'; // Objects节点

    // 构建节点树
    const nodes = [];

    // 处理Server节点
    const serverNode = {
      nodeId: rootNodeId,
      browseName: 'Server',
      displayName: 'Server',
      nodeClass: 'Object',
      children: await recursiveBrowse(session, rootNodeId, 1)
    };
    nodes.push(serverNode);

    // 处理Objects节点
    const objectsNode = {
      nodeId: objectsNodeId,
      browseName: 'Objects',
      displayName: 'Objects',
      nodeClass: 'Object',
      children: await recursiveBrowse(session, objectsNodeId, 1)
    };
    nodes.push(objectsNode);

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
