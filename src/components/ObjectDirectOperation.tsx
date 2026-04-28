import React, { useState } from 'react';
import { Input, InputNumber, Switch, Button } from 'antd';
import { opcuaService } from '../services/opcuaService';

interface NodeInfo {
  nodeId: string;
  dataType: string;
  value: any;
}

const ObjectDirectOperation: React.FC = () => {
  const [ipv6Address, setIpv6Address] = useState('');
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const handleQuery = async () => {
    if (!ipv6Address) {
      setError('请输入IPv6地址');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // 构建 OPC UA 端点 URL
      const endpointUrl = `opc.tcp://[${ipv6Address}]:4840`;
      
      // 生成设备ID（使用时间戳）
      const newDeviceId = `device_${Date.now()}`;
      setDeviceId(newDeviceId);

      console.log('连接到 OPC UA 服务器:', endpointUrl);

      // 连接到 OPC UA 服务器
      const connection = await opcuaService.connect(endpointUrl, newDeviceId);
      
      console.log('连接成功，浏览节点树...');

      // 构建完整的 NodeId（使用 guid 格式，将 IPv6 转换为 UUID 格式）
      const ipv6NoColons = ipv6Address.replace(/:/g, '');
      // IPv6 是 128 位，UUID 也是 128 位，直接格式化为 UUID 格式
      const uuidStr = `${ipv6NoColons.slice(0, 8)}-${ipv6NoColons.slice(8, 12)}-${ipv6NoColons.slice(12, 16)}-${ipv6NoColons.slice(16, 20)}-${ipv6NoColons.slice(20)}`;
      const fullNodeId = `ns=1;g=${uuidStr}`;
      
      console.log('读取节点值:', fullNodeId);

      // 读取节点值
      const result = await opcuaService.readNodeValue(fullNodeId, newDeviceId);

      console.log('读取成功:', result);

      // 简化处理，直接读取值并尝试推断类型
      const dataType = typeof result === 'number' ? 'Double' :
                      typeof result === 'boolean' ? 'Boolean' : 'String';

      const info: NodeInfo = {
        nodeId: ipv6Address,
        dataType,
        value: result
      };

      setNodeInfo(info);
      setEditValue(result);

      setSuccess('查询成功');
    } catch (err) {
      console.error('查询失败:', err);
      setError('查询失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleModify = async () => {
    if (!nodeInfo || !deviceId) {
      setError('请先查询对象');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // 构建完整的 NodeId（使用 guid 格式，将 IPv6 转换为 UUID 格式）
      const ipv6NoColons = ipv6Address.replace(/:/g, '');
      // IPv6 是 128 位，UUID 也是 128 位，直接格式化为 UUID 格式
      const uuidStr = `${ipv6NoColons.slice(0, 8)}-${ipv6NoColons.slice(8, 12)}-${ipv6NoColons.slice(12, 16)}-${ipv6NoColons.slice(16, 20)}-${ipv6NoColons.slice(20)}`;
      const fullNodeId = `ns=1;g=${uuidStr}`;

      console.log('写入节点值:', fullNodeId, editValue);

      // 写入节点值
      const result = await opcuaService.writeNodeValue(fullNodeId, editValue, deviceId);

      console.log('写入操作响应:', result);

      // 更新为服务器返回的最新值
      if (result && result.value !== undefined) {
        setNodeInfo(prev => prev ? { ...prev, value: result.value } : null);
        setEditValue(result.value);
        setSuccess('操作完成，已刷新最新值');
      } else {
        setSuccess('操作完成');
      }
    } catch (err) {
      console.error('操作失败:', err);
      setError('操作失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  // 渲染输入控件
  const renderInputControl = () => {
    if (!nodeInfo) return null;

    const dataTypeLower = nodeInfo.dataType.toLowerCase();
    
    if (dataTypeLower.includes('double') || dataTypeLower.includes('float') || 
        dataTypeLower.includes('int') || dataTypeLower.includes('integer') || 
        dataTypeLower.includes('number')) {
      return (
        <InputNumber
          value={editValue}
          onChange={setEditValue}
          style={{ width: '100%', marginBottom: '10px' }}
          placeholder="请输入数字"
        />
      );
    } else if (dataTypeLower.includes('boolean') || dataTypeLower.includes('bool')) {
      return (
        <div style={{ marginBottom: '10px' }}>
          <Switch
            checked={editValue === true}
            onChange={(checked) => setEditValue(checked)}
          />
          <span style={{ marginLeft: '10px' }}>
            {editValue === true ? 'true' : 'false'}
          </span>
        </div>
      );
    } else {
      // 字符串或其他类型
      return (
        <Input
          value={editValue?.toString() || ''}
          onChange={(e) => setEditValue(e.target.value)}
          style={{ width: '100%', marginBottom: '10px' }}
          placeholder="请输入新值"
        />
      );
    }
  };

  // 渲染显示值
  const renderDisplayValue = (value: any, dataType: string) => {
    if (value === undefined || value === null) return '-';
    
    switch (dataType.toLowerCase()) {
      case 'double':
      case 'float':
        if (typeof value === 'number') {
          return value.toFixed(2);
        }
        return value;
      case 'boolean':
        return value ? 'true' : 'false';
      case 'datetime':
        return new Date(value).toLocaleString();
      default:
        return value;
    }
  };

  return (
    <div className="object-direct-operation">
      <h2>对象直接操作</h2>
      
      <div className="input-section">
        <label htmlFor="ipv6Address">设备IPv6地址：</label>
        <input
          type="text"
          id="ipv6Address"
          value={ipv6Address}
          onChange={(e) => setIpv6Address(e.target.value)}
          placeholder="例如：2001:eaca:101:0:001e:cd00:0201:0001"
        />
        <Button type="primary" onClick={handleQuery} loading={isLoading}>
          查询
        </Button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {nodeInfo && (
        <div className="object-info">
          <h3>对象信息</h3>
          <div className="info-item">
            <span className="label">IPv6地址：</span>
            <span>{nodeInfo.nodeId}</span>
          </div>
          <div className="info-item">
            <span className="label">数据类型：</span>
            <span>{nodeInfo.dataType}</span>
          </div>
          <div className="info-item">
            <span className="label">当前值：</span>
            <span>{renderDisplayValue(nodeInfo.value, nodeInfo.dataType)}</span>
          </div>

          <div className="modify-section">
            <h4>修改值</h4>
            {renderInputControl()}
            <Button type="primary" onClick={handleModify} loading={isLoading}>
              确认修改
            </Button>
          </div>
        </div>
      )}

      <style jsx>{`
        .object-direct-operation {
          padding: 20px;
          background-color: #f5f5f5;
          border-radius: 8px;
          max-width: 800px;
          margin: 0 auto;
        }

        h2 {
          margin-top: 0;
          color: #333;
        }

        .input-section {
          margin-bottom: 20px;
        }

        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
        }

        input[type="text"] {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-bottom: 10px;
          box-sizing: border-box;
        }

        button, .ant-btn {
          padding: 8px 16px;
        }

        .error-message {
          color: red;
          margin: 10px 0;
        }

        .success-message {
          color: green;
          margin: 10px 0;
        }

        .object-info {
          margin-top: 20px;
          padding: 15px;
          background-color: white;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .object-info h3 {
          margin-top: 0;
          color: #333;
        }

        .info-item {
          margin: 10px 0;
        }

        .info-item .label {
          font-weight: 500;
          margin-right: 10px;
        }

        .modify-section {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }

        .modify-section h4 {
          margin-top: 0;
          color: #333;
        }
      `}</style>
    </div>
  );
};

export default ObjectDirectOperation;
