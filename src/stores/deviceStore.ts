import { create } from 'zustand';
import type { AUTBUSDevice, DiscoveryConfig, NetworkInterface, OPCUAConnection, OPCUANode } from '../types/device';
import { networkService } from '../services/networkService';
import { opcuaService } from '../services/opcuaService';

const DISCOVERY_CONFIG: DiscoveryConfig = {
  multicastAddress: 'ff03::c',
  etherType: 0xB62C,
  port: 4840,
  udpPort: 6060
};

const mergeNodeUpdates = (
  nodes: OPCUANode[] | undefined,
  targetNodeId: string,
  updates: Partial<OPCUANode>
): OPCUANode[] | undefined => {
  if (!nodes) {
    return nodes;
  }

  let changed = false;

  const nextNodes = nodes.map((node) => {
    const nextChildren = mergeNodeUpdates(node.children, targetNodeId, updates);
    const childrenChanged = nextChildren !== node.children;

    if (node.nodeId === targetNodeId) {
      changed = true;
      return {
        ...node,
        ...updates,
        children: childrenChanged ? nextChildren : node.children
      };
    }

    if (childrenChanged) {
      changed = true;
      return {
        ...node,
        children: nextChildren
      };
    }

    return node;
  });

  return changed ? nextNodes : nodes;
};

interface DeviceState {
  devices: AUTBUSDevice[];
  selectedDevice: AUTBUSDevice | null;
  isScanning: boolean;
  discoveryConfig: DiscoveryConfig;
  lastScanTime: Date | null;
  networkInterfaces: NetworkInterface[];
  selectedInterface: NetworkInterface | null;
  opcuaConnections: OPCUAConnection[];
  // 添加定时器管理
  variablePollingTimers: Map<string, NodeJS.Timeout>; // deviceId -> timer

  setDevices: (devices: AUTBUSDevice[]) => void;
  addDevice: (device: AUTBUSDevice) => void;
  removeDevice: (deviceId: string) => void;
  updateDevice: (deviceId: string, updates: Partial<AUTBUSDevice>) => void;
  setSelectedDevice: (device: AUTBUSDevice | null) => void;
  setIsScanning: (scanning: boolean) => void;
  clearDevices: () => void;
  getDeviceById: (id: string) => AUTBUSDevice | undefined;
  setNetworkInterfaces: (interfaces: NetworkInterface[]) => void;
  setSelectedInterface: (networkInterface: NetworkInterface | null) => void;
  loadNetworkInterfaces: () => Promise<void>;
  setOPCUAConnection: (connection: OPCUAConnection) => void;
  updateOPCUAConnection: (deviceId: string, updates: Partial<OPCUAConnection>) => void;
  updateOPCUANode: (deviceId: string, nodeId: string, updates: Partial<OPCUANode>) => void;
  removeOPCUAConnection: (deviceId: string) => void;
  getOPCUAConnection: (deviceId: string) => OPCUAConnection | undefined;
  // 添加定时器相关方法
  addVariablePollingTimer: (deviceId: string, timer: NodeJS.Timeout) => void;
  removeVariablePollingTimer: (deviceId: string) => void;
  clearAllVariablePollingTimers: () => void;
}

const generateMockDevices = (): AUTBUSDevice[] => {
  const controllers: AUTBUSDevice[] = [
    {
      id: 'controller-1',
      name: 'AUTBUS控制器-1',
      type: 'controller',
      ipv6Address: 'fe80::1:0c8f:0201:0000',
      status: 'offline',
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
          status: 'offline',
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
              status: 'offline',
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
              status: 'offline',
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
          status: 'offline',
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
      status: 'offline',
      description: '备用控制器',
      manufacturer: '东土科技',
      model: 'ATB-3000',
      firmwareVersion: 'v2.1.5',
      children: []
    }
  ];

  return controllers;
};

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  selectedDevice: null,
  isScanning: false,
  discoveryConfig: DISCOVERY_CONFIG,
  lastScanTime: null,
  networkInterfaces: [],
  selectedInterface: null,
  opcuaConnections: [],
  variablePollingTimers: new Map<string, NodeJS.Timeout>(),

  setDevices: (devices) => set({ devices }),

  addDevice: (device) => set((state) => ({
    devices: [...state.devices, device]
  })),

  removeDevice: (deviceId) => set((state) => ({
    devices: state.devices.filter(d => d.id !== deviceId),
    selectedDevice: state.selectedDevice?.id === deviceId ? null : state.selectedDevice,
    opcuaConnections: state.opcuaConnections.filter(c => c.deviceId !== deviceId)
  })),

  updateDevice: (deviceId, updates) => set((state) => ({
    devices: state.devices.map(d =>
      d.id === deviceId ? { ...d, ...updates } : d
    ),
    selectedDevice: state.selectedDevice?.id === deviceId
      ? { ...state.selectedDevice, ...updates }
      : state.selectedDevice
  })),

  setSelectedDevice: (device) => set({ selectedDevice: device }),

  setIsScanning: (scanning) => set({ isScanning: scanning }),

  clearDevices: () => {
    // 清除所有定时器
    const state = get();
    state.variablePollingTimers.forEach((timer) => clearInterval(timer));
    set({ devices: [], selectedDevice: null, opcuaConnections: [], variablePollingTimers: new Map() });
  },

  getDeviceById: (id) => {
    const searchDevice = (devices: AUTBUSDevice[]): AUTBUSDevice | undefined => {
      for (const device of devices) {
        if (device.id === id) return device;
        if (device.children) {
          const found = searchDevice(device.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return searchDevice(get().devices);
  },

  setNetworkInterfaces: (interfaces) => set({ networkInterfaces: interfaces }),

  setSelectedInterface: (selectedInterface) => set({ selectedInterface }),

  loadNetworkInterfaces: async () => {
    try {
      console.log('loadNetworkInterfaces called');
      const interfaces = await networkService.getNetworkInterfaces();
      console.log('Loaded interfaces:', interfaces);
      set({ networkInterfaces: interfaces });
      if (interfaces.length > 0 && !interfaces.some(intf => intf.id === get().selectedInterface?.id)) {
        const firstNonLoopback = interfaces.find(intf => !intf.isLoopback && intf.isUp);
        console.log('First non-loopback interface:', firstNonLoopback);
        if (firstNonLoopback) {
          console.log('Setting selected interface:', firstNonLoopback);
          set({ selectedInterface: firstNonLoopback });
        }
      }
    } catch (error) {
      console.error('加载网络接口失败:', error);
    }
  },

  setOPCUAConnection: (connection) => set((state) => ({
    opcuaConnections: [
      ...state.opcuaConnections.filter(c => c.deviceId !== connection.deviceId),
      connection
    ]
  })),

  updateOPCUAConnection: (deviceId, updates) => set((state) => ({
    opcuaConnections: state.opcuaConnections.map(c =>
      c.deviceId === deviceId ? { ...c, ...updates } : c
    )
  })),

  updateOPCUANode: (deviceId, nodeId, updates) => set((state) => ({
    opcuaConnections: state.opcuaConnections.map((connection) => {
      if (connection.deviceId !== deviceId) {
        return connection;
      }

      const nodes = mergeNodeUpdates(connection.nodes, nodeId, updates);
      return nodes === connection.nodes ? connection : { ...connection, nodes };
    })
  })),

  removeOPCUAConnection: (deviceId) => set((state) => ({
    opcuaConnections: state.opcuaConnections.filter(c => c.deviceId !== deviceId)
  })),

  getOPCUAConnection: (deviceId) => {
    return get().opcuaConnections.find(c => c.deviceId === deviceId);
  },

  // 定时器相关方法
  addVariablePollingTimer: (deviceId, timer) => set((state) => {
    const timers = new Map(state.variablePollingTimers);
    timers.set(deviceId, timer);
    return { variablePollingTimers: timers };
  }),

  removeVariablePollingTimer: (deviceId) => set((state) => {
    const timers = new Map(state.variablePollingTimers);
    const timer = timers.get(deviceId);
    if (timer) {
      clearInterval(timer);
      timers.delete(deviceId);
    }
    return { variablePollingTimers: timers };
  }),

  clearAllVariablePollingTimers: () => set((state) => {
    state.variablePollingTimers.forEach((timer) => clearInterval(timer));
    return { variablePollingTimers: new Map() };
  })
}));

export const useDiscoveryService = () => {
  const { setDevices, setIsScanning, selectedInterface, discoveryConfig, loadNetworkInterfaces } = useDeviceStore.getState();

  const startDiscovery = async () => {
    if (!selectedInterface) {
      await loadNetworkInterfaces();
    }

    const currentInterface = useDeviceStore.getState().selectedInterface;
    if (!currentInterface) {
      console.error('未选择网络接口');
      return;
    }

    setIsScanning(true);

    try {
      const devices = await networkService.scanDevices(
        currentInterface.id,
        discoveryConfig.multicastAddress,
        discoveryConfig.udpPort
      );
      // 确保发现的设备默认状态为offline
      const devicesWithOfflineStatus = devices.map(device => ({
        ...device,
        status: 'offline' as const
      }));
      setDevices(devicesWithOfflineStatus);
      useDeviceStore.getState().lastScanTime = new Date();
    } catch (error) {
      console.error('扫描设备失败:', error);
    } finally {
      setIsScanning(false);
    }
  };

  const connectToDevice = async (deviceId: string) => {
    const state = useDeviceStore.getState();
    const device = state.getDeviceById(deviceId);

    if (device && device.status !== 'connecting') {
      useDeviceStore.getState().updateDevice(deviceId, { status: 'connecting' });

      try {
        // 构建OPC UA端点
        const opcuaEndpoint = `opc.tcp://[${device.ipv6Address}]:4840`;
        
        // 连接到OPC UA服务器
        const connection = await opcuaService.connect(opcuaEndpoint, deviceId);
        
        // 更新设备状态
        useDeviceStore.getState().updateDevice(deviceId, { status: 'online' });
        
        // 保存OPC UA连接信息（直接使用连接时获取的节点数据）
        useDeviceStore.getState().setOPCUAConnection({
          deviceId,
          endpoint: opcuaEndpoint,
          status: 'connected',
          nodes: connection.nodes
        });

        // 设置定时查询变量节点数据的定时器（5秒周期）
        const pollInterval = 5000; // 5秒
        const timer = setInterval(async () => {
          try {
            const opcuaConn = useDeviceStore.getState().getOPCUAConnection(deviceId);
            if (opcuaConn && opcuaConn.status === 'connected') {
              const nodesToUpdate = opcuaConn.nodes || [];

              // 遍历所有节点，找出变量节点并更新其值
              const updateVariableNode = async (node: any) => {
                if (node.nodeClass === 'Variable') {
                  try {
                    // 读取变量节点的最新值
                    const result = await opcuaService.readNodeValue(node.nodeId, deviceId);
                    if (result && result.value !== undefined) {
                      // 更新节点值
                      node.value = result.value;
                      if (result.displayName) node.displayName = result.displayName;
                      if (result.dataType) node.dataType = result.dataType;
                      if (result.accessLevel) node.accessLevel = result.accessLevel;
                      console.log(`更新节点值: ${node.browseName} = ${result.value}`);
                    }
                  } catch (readError) {
                    console.error(`读取节点 ${node.nodeId} 值失败:`, readError);
                  }
                }
                // 递归处理子节点
                if (node.children && node.children.length > 0) {
                  for (const childNode of node.children) {
                    await updateVariableNode(childNode);
                  }
                }
              };

              // 遍历所有根节点
              for (const rootNode of nodesToUpdate) {
                await updateVariableNode(rootNode);
              }

              // 更新连接信息中的节点数据
              if (useDeviceStore.getState().getOPCUAConnection(deviceId)?.nodes === nodesToUpdate) {
                useDeviceStore.getState().updateOPCUAConnection(deviceId, { nodes: [...nodesToUpdate] });
              }
            }
          } catch (error) {
            console.error(`定时查询设备 ${deviceId} 变量节点失败:`, error);
          }
        }, pollInterval);

        // 保存定时器引用，以便后续清理
        useDeviceStore.getState().addVariablePollingTimer(deviceId, timer);
        console.log(`设备 ${deviceId} 定时查询已启动，周期 ${pollInterval}ms`);
      } catch (error) {
        console.error('连接设备失败:', error);
        useDeviceStore.getState().updateDevice(deviceId, { status: 'offline' });
        useDeviceStore.getState().setOPCUAConnection({
          deviceId,
          endpoint: '',
          status: 'error',
          errorMessage: error instanceof Error ? error.message : '连接失败'
        });
      }
    }
  };

  const refreshDeviceNode = async (deviceId: string, nodeId: string) => {
    const connection = useDeviceStore.getState().getOPCUAConnection(deviceId);

    if (!connection || connection.status !== 'connected') {
      throw new Error('OPC UA未连接，无法刷新节点');
    }

    const result = await opcuaService.readNodeValue(nodeId, deviceId);
    const updates: Partial<OPCUANode> = {
      ...(result.value !== undefined ? { value: result.value } : {}),
      ...(result.displayName ? { displayName: result.displayName } : {}),
      ...(result.dataType ? { dataType: result.dataType } : {}),
      ...(result.accessLevel ? { accessLevel: result.accessLevel } : {})
    };

    useDeviceStore.getState().updateOPCUANode(deviceId, nodeId, updates);
    useDeviceStore.getState().updateOPCUAConnection(deviceId, {
      status: 'connected',
      errorMessage: undefined
    });

    console.log(`设备 ${deviceId} 节点 ${nodeId} 刷新完成`);
    return updates;
  };

  const refreshDeviceNodes = async (deviceId: string) => {
    const connection = useDeviceStore.getState().getOPCUAConnection(deviceId);

    if (!connection || connection.status !== 'connected') {
      throw new Error('OPC UA未连接，无法刷新模型');
    }

    const nodes = await opcuaService.browseNodes(deviceId);
    useDeviceStore.getState().updateOPCUAConnection(deviceId, {
      status: 'connected',
      nodes,
      errorMessage: undefined
    });

    console.log(`设备 ${deviceId} 全量模型刷新完成，发现 ${nodes.length} 个根节点`);
    return nodes;
  };

  const disconnectDevice = async (deviceId: string) => {
    try {
      // 清除定时器
      useDeviceStore.getState().removeVariablePollingTimer(deviceId);
      
      await opcuaService.disconnect(deviceId);
      useDeviceStore.getState().updateDevice(deviceId, { status: 'offline' });
      useDeviceStore.getState().removeOPCUAConnection(deviceId);
      
      console.log(`设备 ${deviceId} 已断开连接，定时器已清理`);
    } catch (error) {
      console.error('断开设备连接失败:', error);
    }
  };

  return {
    startDiscovery,
    connectToDevice,
    refreshDeviceNode,
    refreshDeviceNodes,
    disconnectDevice,
    config: discoveryConfig
  };
};
