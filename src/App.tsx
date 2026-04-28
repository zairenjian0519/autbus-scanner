import React, { useState } from 'react';
import { Layout, message, Button } from 'antd';
import type { MenuProps } from 'antd';
import { Header } from 'antd/es/layout/layout';
import ScanButton from './components/ScanButton';
import DeviceTree from './components/DeviceTree';
import DeviceDetails from './components/DeviceDetails';
import ObjectDirectOperation from './components/ObjectDirectOperation';
import { useDeviceStore } from './stores/deviceStore';
import './index.css';

const { Sider, Content } = Layout;

const App: React.FC = () => {
  const { devices, selectedDevice, isScanning, setSelectedDevice } = useDeviceStore();
  const [treeLoading, setTreeLoading] = useState(false);
  const [currentView, setCurrentView] = useState<'device' | 'object'>('device');

  const handleScanStart = () => {
    setTreeLoading(true);
    message.info('开始扫描AUTBUS设备...');
  };

  const handleScanComplete = () => {
    setTreeLoading(false);
    message.success('设备扫描完成');
  };

  const handleSelectDevice = (device: typeof selectedDevice) => {
    if (device) {
      setSelectedDevice(device);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <div style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>
          AUTBUS Device Scanner
        </div>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginLeft: 16 }}>
          设备发现与管理工具
        </div>
      </Header>

      <Layout>
        <Sider
          width={320}
          style={{
            background: '#fff',
            overflow: 'auto',
            height: 'calc(100vh - 64px)'
          }}
        >
          <ScanButton
            onScanStart={handleScanStart}
            onScanComplete={handleScanComplete}
          />
          <DeviceTree
            devices={devices}
            selectedDevice={selectedDevice}
            onSelectDevice={handleSelectDevice}
            loading={treeLoading}
          />
        </Sider>

        <Content
          style={{
            padding: 24,
            background: '#f0f2f5',
            minHeight: 'calc(100vh - 64px)',
            overflow: 'auto'
          }}
        >
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ margin: 0, fontSize: 20, color: '#333' }}>
              {currentView === 'device' ? '设备详情' : '对象直接操作'}
            </h1>
            <div>
              <Button
                type={currentView === 'device' ? 'primary' : 'default'}
                onClick={() => setCurrentView('device')}
                style={{ marginRight: 8 }}
              >
                设备管理
              </Button>
              <Button
                type={currentView === 'object' ? 'primary' : 'default'}
                onClick={() => setCurrentView('object')}
              >
                对象直接操作
              </Button>
            </div>
          </div>
          {currentView === 'device' ? (
            <DeviceDetails device={selectedDevice} loading={isScanning} />
          ) : (
            <ObjectDirectOperation />
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
