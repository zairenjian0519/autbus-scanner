import type { NetworkInterface, AUTBUSDevice } from './types/device';

// ADDP协议常量
export const ADDP_CONSTANTS = {
  PROTOCOL_ID: 0xABDE,
  VERSION: 0x01,
  MESSAGE_TYPE: {
    SCAN_REQUEST: 0x01,
    DEVICE_RESPONSE: 0x02
  },
  MULTICAST_ADDRESS: 'ff03::c',
  UDP_PORT: 6060,
  TIMEOUT: 1000
};

// 模拟网络接口数据
export const mockNetworkInterfaces: NetworkInterface[] = [
  {
    id: 'eth0',
    name: '以太网',
    macAddress: '00:11:22:33:44:55',
    ipv4Addresses: ['192.168.1.100'],
    ipv6Addresses: ['fe80::1:0c8f:0201:0000'],
    isUp: true,
    isLoopback: false
  },
  {
    id: 'wlan0',
    name: 'WiFi',
    macAddress: '66:77:88:99:AA:BB',
    ipv4Addresses: ['192.168.1.101'],
    ipv6Addresses: ['fe80::2:0c8f:0202:0000'],
    isUp: true,
    isLoopback: false
  },
  {
    id: 'lo',
    name: '本地连接',
    macAddress: '00:00:00:00:00:00',
    ipv4Addresses: ['127.0.0.1'],
    ipv6Addresses: ['::1'],
    isUp: true,
    isLoopback: true
  }
];

// 模拟设备数据
export const mockAUTBUSDevices: AUTBUSDevice[] = [
  {
    id: 'controller-1',
    name: 'AUTBUS控制器-1',
    type: 'controller',
    ipv6Address: 'fe80::1:0c8f:0201:0000',
    status: 'online',
    description: '主控制器，负责网络管理',
    manufacturer: '东土科技',
    model: 'ATB-3000',
    firmwareVersion: 'v2.1.5',
    children: [
      {
        id: 'gateway-1',
        name: 'AUTBUS网关-A',
        type: 'gateway',
        ipv6Address: 'fe80::1:0c8f:0201:0101',
        status: 'online',
        parentId: 'controller-1',
        description: '现场级网关',
        manufacturer: '东土科技',
        model: 'ATB-GW100',
        firmwareVersion: 'v1.8.2',
        children: [
          {
            id: 'slave-1',
            name: '从站-1 (温度传感器)',
            type: 'slave',
            ipv6Address: 'fe80::1:0c8f:0201:0201',
            status: 'online',
            parentId: 'gateway-1',
            description: '车间A温度采集',
            manufacturer: '东土科技',
            model: 'ATB-SEN-T1',
            firmwareVersion: 'v1.2.0',
            properties: [
              { id: 'p1', name: '温度值', dataType: 'float', access: 'read', value: 25.6, nodeId: '001E:CD00:0201:0001', description: '当前温度' },
              { id: 'p2', name: '湿度值', dataType: 'float', access: 'read', value: 65.2, nodeId: '001E:CD00:0201:0002', description: '当前湿度' },
              { id: 'p3', name: '报警阈值', dataType: 'float', access: 'readWrite', value: 80.0, nodeId: '001E:CD00:0201:0003', description: '温度报警阈值' },
              { id: 'p4', name: '采样周期', dataType: 'int', access: 'readWrite', value: 1000, nodeId: '001E:CD00:0201:0004', description: '采样间隔(ms)' },
            ]
          },
          {
            id: 'slave-2',
            name: '从站-2 (压力传感器)',
            type: 'slave',
            ipv6Address: 'fe80::1:0c8f:0201:0202',
            status: 'online',
            parentId: 'gateway-1',
            description: '车间A压力监测',
            manufacturer: '东土科技',
            model: 'ATB-SEN-P1',
            firmwareVersion: 'v1.2.0',
            properties: [
              { id: 'p1', name: '压力值', dataType: 'float', access: 'read', value: 1.05, nodeId: '001E:CD00:0202:0001', description: '当前压力(MPa)' },
              { id: 'p2', name: '状态', dataType: 'bool', access: 'read', value: true, nodeId: '001E:CD00:0202:0002', description: '传感器状态' },
            ]
          }
        ]
      },
      {
        id: 'gateway-2',
        name: 'AUTBUS网关-B',
        type: 'gateway',
        ipv6Address: 'fe80::1:0c8f:0201:0102',
        status: 'online',
        parentId: 'controller-1',
        description: '仓库级网关',
        manufacturer: '东土科技',
        model: 'ATB-GW100',
        firmwareVersion: 'v1.8.2',
        children: [
          {
            id: 'slave-3',
            name: '从站-3 (液位传感器)',
            type: 'slave',
            ipv6Address: 'fe80::1:0c8f:0201:0203',
            status: 'offline',
            parentId: 'gateway-2',
            description: '储罐液位监测',
            manufacturer: '东土科技',
            model: 'ATB-SEN-L1',
            firmwareVersion: 'v1.1.5',
            properties: [
              { id: 'p1', name: '液位高度', dataType: 'float', access: 'read', value: 3.5, nodeId: '001E:CD00:0203:0001', description: '当前液位(m)' },
              { id: 'p2', name: '容量', dataType: 'float', access: 'readWrite', value: 10.0, nodeId: '001E:CD00:0203:0002', description: '总容量(m³)' },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'controller-2',
    name: 'AUTBUS控制器-2',
    type: 'controller',
    ipv6Address: 'fe80::1:0c8f:0202:0000',
    status: 'connecting',
    description: '备用控制器',
    manufacturer: '东土科技',
    model: 'ATB-3000',
    firmwareVersion: 'v2.1.5',
    children: []
  }
];
