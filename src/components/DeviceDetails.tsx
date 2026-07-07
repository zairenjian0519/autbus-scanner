import React, { useState } from 'react';
import { Card, Descriptions, Tag, Space, Button, Empty, message } from 'antd';
import { WifiOutlined, DisconnectOutlined, SyncOutlined } from '@ant-design/icons';
import type { AUTBUSDevice, OPCUANode } from '../types/device';
import PropertyTable from './PropertyTable';
import OPCUANodeTree from './OPCUANodeTree';
import { useDeviceStore, useDiscoveryService } from '../stores/deviceStore';

interface DeviceDetailsProps {
  device: AUTBUSDevice | null;
  loading?: boolean;
}

const DeviceDetails: React.FC<DeviceDetailsProps> = ({ device, loading }) => {
  const { getOPCUAConnection } = useDeviceStore();
  const { connectToDevice, disconnectDevice, refreshDeviceNode, refreshDeviceNodes } = useDiscoveryService();
  const [refreshingNode, setRefreshingNode] = useState(false);
  const [refreshingModel, setRefreshingModel] = useState(false);
  const opcuaConnection = device ? getOPCUAConnection(device.id) : undefined;

  if (!device) {
    return (
      <div className="no-device-selected">
        <Empty description="请从左侧选择设备" />
      </div>
    );
  }

  const handleConnect = async () => {
    if (device.status === 'offline') {
      await connectToDevice(device.id);
    }
  };

  const handleDisconnect = async () => {
    if (device.status === 'online') {
      await disconnectDevice(device.id);
    }
  };

  const handleRefreshNode = async (node: OPCUANode) => {
    if (refreshingNode) {
      return;
    }

    setRefreshingNode(true);
    try {
      await refreshDeviceNode(device.id, node.nodeId);
      message.success('当前节点刷新完成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刷新节点失败');
    } finally {
      setRefreshingNode(false);
    }
  };

  const handleRefreshModel = async () => {
    if (refreshingModel) {
      return;
    }

    setRefreshingModel(true);
    try {
      const nodes = await refreshDeviceNodes(device.id);
      message.success(`全量模型刷新完成，共 ${nodes.length} 个根节点`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刷新模型失败');
    } finally {
      setRefreshingModel(false);
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      online: { color: 'success', text: '在线' },
      offline: { color: 'default', text: '离线' },
      connecting: { color: 'processing', text: '连接中' },
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const getTypeTag = (type: string) => {
    const typeMap: Record<string, { color: string; text: string }> = {
      controller: { color: 'blue', text: '控制器' },
      gateway: { color: 'green', text: '网关' },
      slave: { color: 'orange', text: '从站' },
    };
    const config = typeMap[type] || { color: 'default', text: type };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title={
          <Space>
            <span>{device.name}</span>
            {getTypeTag(device.type)}
            {getStatusTag(device.status)}
          </Space>
        }
        extra={
          <Space>
            {device.status === 'offline' && (
              <Button
                type="primary"
                icon={<WifiOutlined />}
                onClick={handleConnect}
                loading={loading}
              >
                连接
              </Button>
            )}
            {device.status === 'online' && (
              <Button
                danger
                icon={<DisconnectOutlined />}
                onClick={handleDisconnect}
              >
                断开
              </Button>
            )}
            {device.status === 'connecting' && (
              <Button icon={<SyncOutlined />} loading disabled>
                连接中
              </Button>
            )}
          </Space>
        }
      >
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="设备ID">{device.id}</Descriptions.Item>
          <Descriptions.Item label="型号">{device.model || '-'}</Descriptions.Item>
          <Descriptions.Item label="IPv6地址" span={2}>
            <code style={{ fontSize: 12 }}>{device.ipv6Address}</code>
          </Descriptions.Item>
          <Descriptions.Item label="厂商">{device.manufacturer || '-'}</Descriptions.Item>
          <Descriptions.Item label="固件版本">{device.firmwareVersion || '-'}</Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>
            {device.description || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {device.children && device.children.length > 0 && (
        <Card title={`子设备 (${device.children.length})`} size="small">
          <Descriptions column={2} size="small">
            {device.children.map((child) => (
              <React.Fragment key={child.id}>
                <Descriptions.Item label={child.name}>
                  <Space>
                    {getTypeTag(child.type)}
                    {getStatusTag(child.status)}
                    <span style={{ fontSize: 11, color: '#999' }}>
                      {child.ipv6Address}
                    </span>
                  </Space>
                </Descriptions.Item>
              </React.Fragment>
            ))}
          </Descriptions>
        </Card>
      )}

      {device.properties && device.properties.length > 0 && (
        <Card title="属性点表">
          <PropertyTable properties={device.properties} loading={loading} />
        </Card>
      )}

      {device.type === 'controller' && (
        <>
          {opcuaConnection?.status === 'connected' && (
            <Card title="AUTBUS 总线">
              <OPCUANodeTree 
                nodes={opcuaConnection.nodes || []} 
                loading={loading || refreshingNode || refreshingModel}
                onRefresh={handleRefreshNode}
                refreshing={refreshingNode}
                onRefreshModel={handleRefreshModel}
                refreshingModel={refreshingModel}
              />
            </Card>
          )}
          {opcuaConnection?.status === 'error' && (
            <Card title="OPC UA 连接错误">
              <p>{opcuaConnection.errorMessage || '连接失败'}</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default DeviceDetails;
