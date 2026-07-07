import React, { useState } from 'react';
import { Tree, Menu, Popover, Space, Tag, message, Spin } from 'antd';
import type { DataNode, EventDataNode } from 'antd/es/tree';
import { SettingOutlined, GatewayOutlined, MonitorOutlined, LinkOutlined, CloseCircleOutlined, LoadingOutlined, AppstoreOutlined } from '@ant-design/icons';
import type { AUTBUSDevice, DeviceType } from '../types/device';
import { useDeviceStore, useDiscoveryService } from '../stores/deviceStore';

interface DeviceTreeProps {
  devices: AUTBUSDevice[];
  selectedDevice: AUTBUSDevice | null;
  onSelectDevice: (device: AUTBUSDevice) => void;
  loading?: boolean;
}

const DeviceTree: React.FC<DeviceTreeProps> = ({
  devices,
  selectedDevice,
  onSelectDevice,
  loading
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; device: AUTBUSDevice } | null>(null);
  const { getOPCUAConnection } = useDeviceStore();
  const { connectToDevice, disconnectDevice } = useDiscoveryService();

  const getDeviceIcon = (type: DeviceType) => {
    const iconStyle = { fontSize: 14 };
    switch (type) {
      case 'controller':
        return <SettingOutlined style={iconStyle} />;
      case 'gateway':
        return <GatewayOutlined style={iconStyle} />;
      case 'slave':
      case 'tn':
        return <MonitorOutlined style={iconStyle} />;
      case 'bus':
        return <AppstoreOutlined style={iconStyle} />;
      case 'mn':
        return <AppstoreOutlined style={iconStyle} />;
      default:
        return null;
    }
  };

  const getDeviceTitle = (device: AUTBUSDevice) => {
    const statusColor = {
      online: '#52c41a',
      offline: '#d9d9d9',
      connecting: '#1890ff',
    };

    const opcuaConnection = getOPCUAConnection(device.id);
    const opcuaStatus = opcuaConnection?.status || 'disconnected';

    const opcuaStatusColor = {
      connected: '#52c41a',
      connecting: '#1890ff',
      disconnected: '#d9d9d9',
      error: '#ff4d4f',
    };

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {getDeviceIcon(device.type)}
        <span>{device.name}</span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: statusColor[device.status],
            flexShrink: 0,
          }}
        />
        {device.type === 'controller' && opcuaStatus && (
          <Tag 
            color={opcuaStatusColor[opcuaStatus]} 
            style={{ fontSize: 10, height: 16, lineHeight: '16px' }}
          >
            {opcuaStatus === 'connected' ? '已连接' : 
             opcuaStatus === 'connecting' ? '连接中' : 
             opcuaStatus === 'error' ? '错误' : '未连接'}
          </Tag>
        )}
      </div>
    );
  };

  const convertToTreeData = (deviceList: AUTBUSDevice[]): DataNode[] => {
    return deviceList.map((device) => ({
      key: device.id,
      title: getDeviceTitle(device),
      children: device.children && device.children.length > 0
        ? convertToTreeData(device.children)
        : undefined,
      isLeaf: !device.children || device.children.length === 0,
      device
    }));
  };

  const treeData = convertToTreeData(devices);

  const selectedKeys = selectedDevice ? [selectedDevice.id] : [];

  const handleSelect = (selectedKeys: React.Key[], info: { node: DataNode }) => {
    const node = info.node as DataNode & { device?: AUTBUSDevice };
    if (node.device) {
      onSelectDevice(node.device);
    }
  };

  const handleContextMenu = (info: { event: React.MouseEvent; node: EventDataNode<DataNode> }) => {
    info.event.preventDefault();
    const node = info.node;
    const deviceNode = node as DataNode & { device?: AUTBUSDevice };
    if (deviceNode.device) {
      setContextMenu({
        x: info.event.clientX,
        y: info.event.clientY,
        device: deviceNode.device
      });
    }
  };

  const handleConnectOPCUA = async (device: AUTBUSDevice) => {
    if (device.type !== 'controller') {
      message.warning('只有控制器设备支持OPC UA连接');
      return;
    }

    try {
      await connectToDevice(device.id);
      message.success('OPC UA连接成功');
    } catch (error) {
      message.error('OPC UA连接失败');
    } finally {
      setContextMenu(null);
    }
  };

  const handleDisconnectOPCUA = async (device: AUTBUSDevice) => {
    try {
      await disconnectDevice(device.id);
      message.success('OPC UA断开连接成功');
    } catch (error) {
      message.error('断开连接失败');
    } finally {
      setContextMenu(null);
    }
  };

  const treeMenu = contextMenu ? (
    <Menu
      style={{
        position: 'fixed',
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 9999
      }}
      onClick={() => setContextMenu(null)}
    >
      {contextMenu.device.type === 'controller' && (
        <>
          <Menu.Item 
            key="connect" 
            icon={<LinkOutlined />}
            onClick={() => handleConnectOPCUA(contextMenu.device)}
          >
            连接OPC UA
          </Menu.Item>
          <Menu.Item 
            key="disconnect" 
            icon={<CloseCircleOutlined />}
            onClick={() => handleDisconnectOPCUA(contextMenu.device)}
          >
            断开OPC UA
          </Menu.Item>
        </>
      )}
    </Menu>
  ) : null;

  return (
    <div className="device-tree-container">
      <Spin spinning={Boolean(loading)}>
        <Tree
          treeData={treeData}
          selectedKeys={selectedKeys}
          onSelect={handleSelect}
          onRightClick={handleContextMenu}
          defaultExpandAll
          showIcon={false}
          titleRender={(nodeData: DataNode) => {
            const dataNode = nodeData as DataNode & { device?: AUTBUSDevice };
            if (dataNode.device) {
              return getDeviceTitle(dataNode.device);
            }
            return String(nodeData.title || '');
          }}
        />
      </Spin>
      {treeMenu}
    </div>
  );
};

export default DeviceTree;
