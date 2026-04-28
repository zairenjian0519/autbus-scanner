import React, { useEffect } from 'react';
import { Button, Space, Tooltip, Select, Spin, Typography } from 'antd';
import { ScanOutlined, SettingOutlined, LoadingOutlined } from '@ant-design/icons';
import { useDeviceStore, useDiscoveryService } from '../stores/deviceStore';
import type { NetworkInterface } from '../types/device';

interface ScanButtonProps {
  onScanStart?: () => void;
  onScanComplete?: () => void;
}

const { Option } = Select;
const { Text } = Typography;

const ScanButton: React.FC<ScanButtonProps> = ({ onScanStart, onScanComplete }) => {
  const { isScanning, lastScanTime, discoveryConfig, networkInterfaces, selectedInterface, setSelectedInterface, loadNetworkInterfaces } = useDeviceStore();
  const { startDiscovery } = useDiscoveryService();

  useEffect(() => {
    loadNetworkInterfaces();
  }, [loadNetworkInterfaces]);

  const handleScan = async () => {
    onScanStart?.();
    await startDiscovery();
    onScanComplete?.();
  };

  const handleInterfaceChange = (interfaceId: string) => {
    const selected = networkInterfaces.find(intf => intf.id === interfaceId);
    setSelectedInterface(selected || null);
  };

  const formatTime = (date: Date | null) => {
    if (!date) return '从未扫描';
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="scan-button-container">
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Text strong>网络接口</Text>
        <Select
          style={{ width: '100%' }}
          placeholder="选择网络接口"
          value={selectedInterface?.id}
          onChange={handleInterfaceChange}
          loading={networkInterfaces.length === 0}
        >
          {networkInterfaces.map((intf) => (
            <Option key={intf.id} value={intf.id}>
              <Space size="small">
                <span>{intf.name}</span>
                {intf.isLoopback && <Text type="secondary">(回环)</Text>}
                {!intf.isUp && <Text type="danger">(未启用)</Text>}
              </Space>
            </Option>
          ))}
        </Select>

        {selectedInterface && (
          <Space size="small" style={{ fontSize: 12, color: '#666' }}>
            <Text>IPv6地址: {selectedInterface.ipv6Addresses[0] || '无'}</Text>
            <Text>MAC: {selectedInterface.macAddress}</Text>
          </Space>
        )}

        <Button
          type="primary"
          icon={isScanning ? <LoadingOutlined /> : <ScanOutlined />}
          loading={isScanning}
          onClick={handleScan}
          block
          size="large"
          disabled={!selectedInterface}
        >
          {isScanning ? '扫描中...' : '扫描设备'}
        </Button>

        <Space size="small">
          <Tooltip title="发现配置">
            <Button icon={<SettingOutlined />} size="small" disabled />
          </Tooltip>
          <span style={{ fontSize: 12, color: '#999' }}>
            上次扫描: {formatTime(lastScanTime)}
          </span>
        </Space>

        <div style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>
          <div>组播: {discoveryConfig.multicastAddress}</div>
          <div>EtherType: 0x{discoveryConfig.etherType.toString(16).toUpperCase()}</div>
          <div>UDP端口: {discoveryConfig.udpPort}</div>
        </div>
      </Space>
    </div>
  );
};

export default ScanButton;
