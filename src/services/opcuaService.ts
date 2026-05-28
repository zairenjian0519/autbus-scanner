import type { OPCUANode, OPCUAConnection } from '../types/device';

export class OPCUAService {
  private ws: WebSocket | null = null;
  private callbacks: Map<string, (data: any) => void> = new Map();
  private requestId: number = 0;

  // 连接到WebSocket后端服务
  private async connectWebSocket(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:8082');
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        this.ws = ws;
        
        // 处理WebSocket消息
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const callback = this.callbacks.get(data.requestId);
            if (callback) {
              callback(data);
              this.callbacks.delete(data.requestId);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        resolve(ws);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

  // 发送请求到后端
  private async sendRequest(type: string, data: any): Promise<{ result: any; cancel: () => void }> {
    const ws = await this.connectWebSocket();
    const requestId = `req_${++this.requestId}_${Date.now()}`;

    const promise = new Promise<any>((resolve) => {
      this.callbacks.set(requestId, resolve);
      ws.send(JSON.stringify({
        type,
        requestId,
        ...data
      }));
    });
    
    // 返回结果和取消方法
    return {
      result: promise,
      cancel: () => {
        // 从回调列表中删除，这样即使收到响应也不会处理
        this.callbacks.delete(requestId);
        // 发送取消请求到后端
        ws.send(JSON.stringify({
          type: 'opcua-cancel',
          requestId,
          originalType: type
        }));
      }
    };
  }

  // 连接到OPC UA服务器
  async connect(
    endpoint: string,
    deviceId: string,
    options: { skipBrowse?: boolean; timeoutMs?: number } = {}
  ): Promise<OPCUAConnection> {
    console.log(`连接到OPC UA服务器: ${endpoint}`);

    try {
      // 发送连接请求
      const request = await this.sendRequest('opcua-connect', {
        endpoint,
        deviceId,
        skipBrowse: options.skipBrowse
      });

      // 10秒连接超时管理
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          // 超时后取消连接操作
          request.cancel();
          reject(new Error('连接超时'));
        }, options.timeoutMs ?? 30000); // 30秒超时
      });

      const result = await Promise.race([
        request.result,
        timeoutPromise
      ]);

      // 连接成功后清除超时计时器
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (result.status === 'connected') {
        const connection: OPCUAConnection = {
          deviceId,
          endpoint,
          status: 'connected',
          nodes: result.nodes
        };
        return connection;
      } else {
        throw new Error(result.errorMessage || '连接失败');
      }
    } catch (error) {
      if (error instanceof Error && error.message === '连接超时') {
        console.error('OPC UA连接超时:', error);
      } else {
        console.error('OPC UA连接失败:', error);
      }
      throw error;
    }
  }

  // 断开连接
  async disconnect(deviceId: string): Promise<void> {
    console.log(`断开OPC UA连接: ${deviceId}`);
    
    try {
      await this.sendRequest('opcua-disconnect', {
        deviceId
      });
    } catch (error) {
      console.error('断开OPC UA连接失败:', error);
    }
  }

  // 浏览节点
  async browseNodes(deviceId: string): Promise<OPCUANode[]> {
    console.log(`浏览OPC UA节点: ${deviceId}`);

    const request = await this.sendRequest('opcua-browse', {
      deviceId
    });

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        request.cancel();
        reject(new Error('浏览节点超时'));
      }, 30000);
    });

    try {
      const result = await Promise.race([
        request.result,
        timeoutPromise
      ]);

      if (result.status === 'success') {
        return result.nodes || [];
      }

      throw new Error(result.errorMessage || '浏览节点失败');
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  // 读取节点值
  async readNodeValue(nodeId: string, deviceId?: string): Promise<{ value: any; displayName?: string }> {
    console.log(`读取节点值: ${nodeId}`);

    try {
      const response = await this.sendRequest('opcua-read', {
        deviceId,
        nodeId
      });
      
      const result = await response.result;
      
      console.log('读取节点值响应:', result);
      
      if (result.value !== undefined) {
        return {
          value: result.value,
          displayName: result.displayName
        };
      } else {
        throw new Error(result.errorMessage || '读取失败');
      }
    } catch (error) {
      console.error('读取节点值失败:', error);
      throw error;
    }
  }

  // 写入节点值
  async writeNodeValue(nodeId: string, value: any, deviceId?: string): Promise<{ value: any; displayName?: string }> {
    console.log(`写入节点值: ${nodeId} = ${value}`);

    try {
      const response = await this.sendRequest('opcua-write', {
        deviceId,
        nodeId,
        value
      });

      const result = await response.result;
      console.log('写入操作响应:', result);
      return {
        value: result.value,
        displayName: result.displayName
      };
    } catch (error) {
      console.error('写入节点值失败:', error);
      throw error;
    }
  }

  // 订阅节点
  async subscribeNode(nodeId: string, _callback: (value: any) => void, _deviceId?: string): Promise<string> {
    console.log(`订阅节点: ${nodeId}`);

    // 这里可以实现订阅功能
    // 由于WebSocket是长连接，可以在后端实现订阅，然后通过WebSocket推送数据
    const subscriptionId = `sub_${Date.now()}`;
    return subscriptionId;
  }

  // 取消订阅
  async unsubscribe(subscriptionId: string): Promise<void> {
    console.log(`取消订阅: ${subscriptionId}`);
    
    // 这里可以实现取消订阅功能
  }
}

export const opcuaService = new OPCUAService();
