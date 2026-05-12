import React, { useState, useEffect } from 'react';
import { Tree, Card, Descriptions, Input, InputNumber, Switch, Button } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { FolderOutlined, FileOutlined, AppstoreOutlined, KeyOutlined } from '@ant-design/icons';
import type { OPCUANode } from '../types/device';
import { opcuaService } from '../services/opcuaService';
import { useDeviceStore } from '../stores/deviceStore';

interface OPCUANodeTreeProps {
  nodes: OPCUANode[];
  loading?: boolean;
  onNodeSelect?: (node: OPCUANode) => void;
}

const OPCUANodeTree: React.FC<OPCUANodeTreeProps> = ({
  nodes,
  loading = false,
  onNodeSelect
}) => {
  const [selectedNode, setSelectedNode] = useState<OPCUANode | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [editValue, setEditValue] = useState<any>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  
  // 从设备存储中获取当前选中的设备ID
  const { selectedDevice } = useDeviceStore();
  
  // 监听选中设备的变化
  useEffect(() => {
    if (selectedDevice) {
      setCurrentDeviceId(selectedDevice.id);
    }
  }, [selectedDevice]);

  // 监听nodes变化，自动更新选中节点的信息
  useEffect(() => {
    if (selectedNode) {
      // 递归查找节点的最新数据
      const findNode = (nodeList: OPCUANode[], targetNodeId: string): OPCUANode | null => {
        for (const node of nodeList) {
          if (node.nodeId === targetNodeId) {
            return node;
          }
          if (node.children && node.children.length > 0) {
            const found = findNode(node.children, targetNodeId);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };

      // 查找最新的节点数据
      const updatedNode = findNode(nodes, selectedNode.nodeId);
      if (updatedNode) {
        setSelectedNode(updatedNode);
        setEditValue(updatedNode.value);
        console.log(`节点 ${updatedNode.browseName} 的数据已更新: ${updatedNode.value}`);
      }
    }
  }, [nodes, selectedNode]);

  const getNodeIcon = (nodeClass: string) => {
    switch (nodeClass) {
      case 'Object':
        return <FolderOutlined />;
      case 'Variable':
        return <FileOutlined />;
      case 'Method':
        return <KeyOutlined />;
      default:
        return <AppstoreOutlined />;
    }
  };

  const getNodeColor = (nodeClass: string) => {
    switch (nodeClass) {
      case 'Object':
        return '#1890ff';
      case 'Variable':
        return '#52c41a';
      case 'Method':
        return '#faad14';
      default:
        return '#999';
    }
  };

  // 格式化 NodeId 为 IPv6 地址格式
  const formatNodeId = (nodeId: string): string => {
    // 提取节点 ID 部分
    const match = nodeId.match(/ns=\d+;i=(.*)/);
    if (match) {
      const id = match[1];
      // 按照 IPv6 地址格式格式化
      if (id.length === 32) {
        const parts = [];
        for (let i = 0; i < 8; i++) {
          parts.push(id.substr(i * 4, 4));
        }
        return parts.join(':');
      }
    }
    return nodeId;
  };

  const convertToTreeData = (nodeList: OPCUANode[]): DataNode[] => {
    return nodeList.map((node) => {
      const treeNode: DataNode = {
        key: node.nodeId,
        title: (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {getNodeIcon(node.nodeClass)}
            <span style={{ color: getNodeColor(node.nodeClass), fontSize: '9px' }}>
              {node.browseName}
            </span>
          </div>
        ),
        children: node.children && node.children.length > 0
          ? convertToTreeData(node.children)
          : undefined,
        isLeaf: !node.children || node.children.length === 0,
        node
      };
      return treeNode;
    });
  };

  const treeData = convertToTreeData(nodes);

  const handleSelect = (selectedKeys: React.Key[], info: { node: DataNode }) => {
    const node = info.node as DataNode & { node?: OPCUANode };
    if (node.node) {
      setSelectedNode(node.node);
      setEditValue(node.node.value);
      onNodeSelect?.(node.node);
    }
  };

  const handleExpand = (expandedKeys: React.Key[]) => {
    setExpandedKeys(expandedKeys as string[]);
  };

  // 处理值修改
  const handleValueChange = (value: any) => {
    setEditValue(value);
    
    // 如果是布尔类型，立即提交
    if (selectedNode) {
      const dataTypeLower = selectedNode.dataType?.toLowerCase() || '';
      if (dataTypeLower.includes('boolean') || dataTypeLower.includes('bool')) {
        handleSubmitValue(selectedNode);
      }
    }
  };

  // 提交值修改
  const handleSubmitValue = async (node: OPCUANode) => {
    if (!currentDeviceId) {
      console.error('未连接到设备，无法写入值');
      return;
    }
    
    try {
      const result = await opcuaService.writeNodeValue(node.nodeId, editValue, currentDeviceId);
      
      console.log('写入操作返回结果:', result);
      
      // 使用后端返回的最新值
      if (result.value !== undefined) {
        console.log('使用后端返回的最新值:', result.value);
        
        // 更新节点值
        if (selectedNode) {
          const updatedNode = { ...selectedNode, value: result.value };
          setSelectedNode(updatedNode);
          setEditValue(result.value);
        }
      }
    } catch (error) {
      console.error('写入节点值失败:', error);
    }
  };

  // 处理回车键提交
  const handleKeyPress = async (e: React.KeyboardEvent, node: OPCUANode) => {
    if (e.key === 'Enter') {
      await handleSubmitValue(node);
    }
  };

  // 根据数据类型渲染输入控件
  const renderInputControl = (node: OPCUANode) => {
    // 调试信息
    console.log('节点信息:', {
      nodeId: node.nodeId,
      dataType: node.dataType,
      accessLevel: node.accessLevel,
      value: node.value
    });

    // 所有变量都可编辑，不判断权限

    // 根据数据类型渲染对应的输入控件
    let inputComponent;
    let showSubmitButton = true;

    // 将 dataType 转换为字符串进行判断
    const dataTypeStr = String(node.dataType || '').toLowerCase();
    
    // 判断是否为数字类型（包括数字类型的枚举值）
    const isNumberType = dataTypeStr.includes('double') || dataTypeStr.includes('float') || 
                        dataTypeStr.includes('int') || dataTypeStr.includes('integer') || 
                        dataTypeStr.includes('number') || dataTypeStr === '6' || dataTypeStr === '5' || 
                        dataTypeStr === '2' || dataTypeStr === '3' || dataTypeStr === '4' ||
                        // 根据当前值的类型判断
                        typeof node.value === 'number';
    
    // 判断是否为布尔类型
    const isBooleanType = dataTypeStr.includes('boolean') || dataTypeStr.includes('bool') || 
                         dataTypeStr === '1' ||
                         // 根据当前值的类型判断
                         typeof node.value === 'boolean';

    if (isNumberType) {
      inputComponent = (
        <InputNumber
          value={editValue}
          onChange={handleValueChange}
          onKeyPress={(e) => handleKeyPress(e, node)}
          style={{ width: '100%', fontSize: '8px' }}
        />
      );
    } else if (isBooleanType) {
      inputComponent = (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Switch
            checked={editValue === true}
            onChange={handleValueChange}
            size="small"
          />
          <span style={{ marginLeft: '8px', fontSize: '8px' }}>
            {editValue === true ? '开' : '关'}
          </span>
        </div>
      );
      // 对于布尔类型，切换时立即提交
      showSubmitButton = false;
    } else {
      // 字符串或其他类型
      inputComponent = (
        <Input
          value={editValue}
          onChange={(e) => handleValueChange(e.target.value)}
          onKeyPress={(e) => handleKeyPress(e, node)}
          style={{ width: '100%', fontSize: '8px' }}
          placeholder="请输入新值"
        />
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>{inputComponent}</div>
        {showSubmitButton && (
          <Button 
            type="primary" 
            size="small"
            onClick={() => handleSubmitValue(node)}
            style={{ fontSize: '8px', padding: '4px 8px', alignSelf: 'flex-end' }}
          >
            确认修改
          </Button>
        )}
      </div>
    );
  };

  return (
    <Card title="OPC UA 节点树" style={{ height: '600px', display: 'flex', flexDirection: 'column', fontSize: '9px' }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, borderRight: '1px solid #e8e8e8', paddingRight: 8, overflowY: 'auto', maxHeight: '550px', fontSize: '9px' }}>
          <Tree
            treeData={treeData}
            onSelect={handleSelect}
            onExpand={handleExpand}
            expandedKeys={expandedKeys}
            loading={loading}
            showIcon={false}
            defaultExpandAll
            style={{ width: '100%', fontSize: '9px' }}
          />
        </div>
        <div style={{ flex: 1, paddingLeft: 8, overflowY: 'auto', maxHeight: '550px', fontSize: '9px' }}>
          {selectedNode ? (
            <>
              <Descriptions title="节点信息" bordered size="small" style={{ fontSize: '9px' }}>
                <Descriptions.Item label="NodeId" style={{ fontSize: '9px' }}>
                  <code style={{ fontSize: '8px', wordBreak: 'break-all' }}>
                    {formatNodeId(selectedNode.nodeId)}
                  </code>
                </Descriptions.Item>
                <Descriptions.Item label="DisplayName" style={{ fontSize: '9px' }}>
                  {selectedNode.displayName}
                </Descriptions.Item>
                {selectedNode.dataType && (
                  <Descriptions.Item label="DataType" style={{ fontSize: '9px' }}>
                    {selectedNode.dataType}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Value" style={{ fontSize: '9px' }}>
                  {renderInputControl(selectedNode)}
                </Descriptions.Item>
                {selectedNode.accessLevel && (
                  <Descriptions.Item label="AccessLevel" style={{ fontSize: '9px' }}>
                    {selectedNode.accessLevel}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#999', padding: '40px 0', fontSize: '9px' }}>
              请选择一个节点查看详情
            </div>
          )}
        </div>
      </div>
      {/* 任务栏形状的底部元素 */}
      <div style={{
        borderTop: '1px solid #e8e8e8',
        padding: '6px',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '8px'
      }}>
        <div style={{ fontSize: '8px', color: '#666' }}>
          节点数: {treeData.length}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button 
            style={{
              padding: '2px 6px',
              fontSize: '8px',
              border: '1px solid #d9d9d9',
              borderRadius: '3px',
              backgroundColor: '#fff',
              cursor: 'pointer'
            }}
            onClick={() => setExpandedKeys([])}
          >
            折叠所有
          </button>
          <button 
            style={{
              padding: '2px 6px',
              fontSize: '8px',
              border: '1px solid #d9d9d9',
              borderRadius: '3px',
              backgroundColor: '#fff',
              cursor: 'pointer'
            }}
            onClick={() => setExpandedKeys(treeData.map(node => node.key).filter(key => typeof key === 'string'))}
          >
            展开所有
          </button>
        </div>
      </div>
    </Card>
  );
};

export default OPCUANodeTree;