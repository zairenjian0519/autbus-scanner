export type DeviceType = 'controller' | 'gateway' | 'slave' | 'bus' | 'mn' | 'tn';

export type DeviceStatus = 'online' | 'offline' | 'connecting';

export type DataType = 'int' | 'float' | 'string' | 'bool';

export type AccessType = 'read' | 'write' | 'readWrite';

export interface NetworkInterface {
  id: string;
  name: string;
  ipv4Addresses?: string[];
  ipv6Addresses: string[];
  macAddress: string;
  isUp: boolean;
  isLoopback: boolean;
  scopeId?: number | string;
  multicastInterface?: string;
}

export interface OPCUAConnection {
  deviceId: string;
  endpoint: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  nodes?: OPCUANode[];
  errorMessage?: string;
}

export interface OPCUANode {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: string;
  children?: OPCUANode[];
  value?: any;
  dataType?: string;
  accessLevel?: string;
}

export interface DeviceProperty {
  id: string;
  name: string;
  dataType: DataType;
  access: AccessType;
  value?: string | number | boolean;
  nodeId: string;
  description?: string;
}

export interface AUTBUSDevice {
  id: string;
  name: string;
  type: DeviceType;
  ipv6Address: string;
  status: DeviceStatus;
  parentId?: string;
  children?: AUTBUSDevice[];
  properties?: DeviceProperty[];
  description?: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  devId?: string; // 设备ID
  busId?: string; // 总线ID
  nodeType?: 'MN' | 'TN'; // 节点类型：主节点或从节点
  opcuaEndpoint?: string; // OPC UA服务器端点
}

export interface DiscoveryConfig {
  multicastAddress: string;
  etherType: number;
  port: number;
  udpPort: number; // UDP端口
}

export interface ScanResult {
  devices: AUTBUSDevice[];
  timestamp: Date;
  scannedCount: number;
}
