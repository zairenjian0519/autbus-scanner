import type { AUTBUSDevice, NetworkInterface, ScanResult } from '../types/device';
import { ADDP_CONSTANTS, mockNetworkInterfaces, mockAUTBUSDevices } from '../constants';

class NetworkService {
  private ws: WebSocket | null = null;
  private scanCallback: ((devices: AUTBUSDevice[]) => void) | null = null;
  private timeout: NodeJS.Timeout | null = null;
  private isBrowser: boolean = typeof window !== 'undefined';
  private Buffer: any = this.isBrowser ? (window as any).Buffer : Buffer;

  // 连接WebSocket后端服务
  private connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:8082');
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        this.ws = ws;
        resolve(ws);
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.ws = null;
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'scan-complete') {
            console.log('Received scan results:', data.devices);
            if (this.scanCallback) {
              this.scanCallback(data.devices);
              this.scanCallback = null;
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    });
  }

  // 获取网络接口列表
  async getNetworkInterfaces(): Promise<NetworkInterface[]> {
    // 实际环境中，这里应该使用os.networkInterfaces()获取真实的网络接口
    // 为了前端演示，返回模拟数据
    console.log('getNetworkInterfaces called');
    console.log('mockNetworkInterfaces:', mockNetworkInterfaces);
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('Resolving network interfaces:', mockNetworkInterfaces);
        resolve(mockNetworkInterfaces);
      }, 500);
    });
  }

  // 发送IPv6组播扫描报文
  async scanDevices(interfaceId: string, multicastAddress: string, port: number): Promise<AUTBUSDevice[]> {
    return new Promise((resolve) => {
      console.log(`开始扫描设备，接口: ${interfaceId}, 组播地址: ${multicastAddress}, 端口: ${port}`);
      
      // 尝试连接后端服务
      this.connectWebSocket()
        .then((ws) => {
          console.log('Sending scan request to backend');
          
          // 发送扫描请求
          ws.send(JSON.stringify({
            type: 'scan',
            interfaceId,
            multicastAddress,
            port
          }));

          // 设置回调
          this.scanCallback = (devices) => {
            console.log('扫描完成，发现设备:', devices.length);
            resolve(devices);
          };

          // 超时处理
          this.timeout = setTimeout(() => {
            console.log('Scan timeout, no devices found');
            if (this.scanCallback) {
              this.scanCallback([]);
              this.scanCallback = null;
            }
          }, ADDP_CONSTANTS.TIMEOUT + 2000);
        })
        .catch((error) => {
          console.error('Failed to connect to backend, no devices found:', error);
          // 后端连接失败，返回空数组
          setTimeout(() => {
            console.log('Backend connection failed, no devices found');
            resolve([]);
          }, 1000);
        });
    });
  }

  // 发送ADDP扫描请求（保留用于未来扩展）
  private sendScanRequest(interfaceId: string, multicastAddress: string, port: number): void {
    // 构建ADDP扫描请求报文
    const sequenceNumber = Math.floor(Math.random() * 0xFFFFFFFF);
    const interfaceInfo = mockNetworkInterfaces.find(intf => intf.id === interfaceId);
    
    if (!interfaceInfo) {
      console.error('网络接口不存在');
      return;
    }

    // 构建报文头
    const buffer = this.Buffer.alloc(32); // 公共报文头长度
    
    // 协议标识
    buffer.writeUInt16LE(ADDP_CONSTANTS.PROTOCOL_ID, 0);
    // 版本
    buffer.writeUInt8(ADDP_CONSTANTS.VERSION, 2);
    // 报文类型
    buffer.writeUInt8(ADDP_CONSTANTS.MESSAGE_TYPE.SCAN_REQUEST, 3);
    // 报文长度
    buffer.writeUInt16LE(32, 4);
    // 序列号
    buffer.writeUInt32LE(sequenceNumber, 6);
    // 前端MAC地址
    const macBytes = this.macToBytes(interfaceInfo.macAddress);
    macBytes.copy(buffer, 10);
    // 前端IPv6地址
    const ipv6Bytes = this.ipv6ToBytes(interfaceInfo.ipv6Addresses[0]);
    ipv6Bytes.copy(buffer, 16);

    console.log('发送ADDP扫描请求:', {
      sequenceNumber,
      macAddress: interfaceInfo.macAddress,
      ipv6Address: interfaceInfo.ipv6Addresses[0]
    });

    // 实际发送由后端处理
  }

  // 解析ADDP设备应答
  private parseDeviceResponse(data: Buffer): AUTBUSDevice | null {
    // 实际环境中，这里应该解析真实的设备应答报文
    // 为了前端演示，返回模拟数据
    return null;
  }

  // MAC地址转字节
  private macToBytes(mac: string): any {
    const bytes = this.Buffer.alloc(6);
    const parts = mac.split(':');
    parts.forEach((part, index) => {
      bytes[index] = parseInt(part, 16);
    });
    return bytes;
  }

  // IPv6地址转字节
  private ipv6ToBytes(ipv6: string): any {
    const bytes = this.Buffer.alloc(16);
    const parts = ipv6.split(':');
    let index = 0;
    
    parts.forEach((part) => {
      if (part === '') {
        // 处理双冒号
        const zeroCount = 8 - parts.length + 1;
        for (let i = 0; i < zeroCount; i++) {
          bytes[index++] = 0;
          bytes[index++] = 0;
        }
      } else {
        const value = parseInt(part, 16);
        bytes[index++] = (value >> 8) & 0xFF;
        bytes[index++] = value & 0xFF;
      }
    });
    
    return bytes;
  }

  // 断开WebSocket连接
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

export const networkService = new NetworkService();
