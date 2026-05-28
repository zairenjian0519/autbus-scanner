import React, { useState, useEffect, useMemo } from 'react';
import { Tree, Card, Descriptions, Input, InputNumber, Switch, Button, Spin } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { FolderOutlined, FileOutlined, AppstoreOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import type { OPCUANode } from '../types/device';
import { opcuaService } from '../services/opcuaService';
import { useDeviceStore } from '../stores/deviceStore';

interface OPCUANodeTreeProps {
  nodes: OPCUANode[];
  loading?: boolean;
  onNodeSelect?: (node: OPCUANode) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

type OPCUATreeDataNode = DataNode & {
  key: string;
  node: OPCUANode;
  children?: OPCUATreeDataNode[];
};

const TREE_FONT_SIZE = 12;
const DETAIL_FONT_SIZE = 13;
const CODE_FONT_SIZE = 12;

const nodeTreeCardStyle: React.CSSProperties = {
  height: 'calc(100vh - 300px)',
  minHeight: 760,
  display: 'flex',
  flexDirection: 'column',
  fontSize: TREE_FONT_SIZE
};

const nodeTreeCardBodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column'
};

const nodeTreeContentStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0,
  overflow: 'hidden',
  gap: 16
};

const treePaneStyle: React.CSSProperties = {
  flex: '0 0 45%',
  minWidth: 320,
  borderRight: '1px solid #e8e8e8',
  paddingRight: 16,
  paddingBottom: 8,
  overflow: 'auto',
  fontSize: TREE_FONT_SIZE
};

const detailPaneStyle: React.CSSProperties = {
  flex: '1 1 55%',
  minWidth: 360,
  overflowY: 'auto',
  fontSize: DETAIL_FONT_SIZE
};

const treeNodeTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  lineHeight: '22px',
  fontSize: TREE_FONT_SIZE,
  whiteSpace: 'nowrap'
};

const detailLabelStyle: React.CSSProperties = {
  width: 104,
  fontSize: DETAIL_FONT_SIZE,
  fontWeight: 500,
  color: '#4b5563'
};

const detailContentStyle: React.CSSProperties = {
  fontSize: DETAIL_FONT_SIZE,
  lineHeight: '21px',
  color: '#1f2937'
};

const footerStyle: React.CSSProperties = {
  borderTop: '1px solid #e8e8e8',
  paddingTop: 8,
  marginTop: 12,
  backgroundColor: '#fff',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: TREE_FONT_SIZE
};

const footerButtonStyle: React.CSSProperties = {
  padding: '3px 10px',
  fontSize: TREE_FONT_SIZE,
  lineHeight: '20px',
  border: '1px solid #d9d9d9',
  borderRadius: 4,
  backgroundColor: '#fff',
  cursor: 'pointer'
};

const OPCUANodeTree: React.FC<OPCUANodeTreeProps> = ({
  nodes,
  loading = false,
  onNodeSelect,
  onRefresh,
  refreshing = false
}) => {
  const [selectedNode, setSelectedNode] = useState<OPCUANode | null>(null);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
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
    const formatHexToIPv6 = (value: string): string | null => {
      const hex = value.replace(/-/g, '').toLowerCase();
      if (!/^[0-9a-f]{32}$/.test(hex)) {
        return null;
      }

      const parts = [];
      for (let i = 0; i < 8; i++) {
        parts.push(hex.substring(i * 4, i * 4 + 4));
      }
      return parts.join(':');
    };

    // 支持 ns=1;g=2001EACA-0101-0000-001E-CD000201000B
    const guidMatch = nodeId.match(/ns=\d+;g=([0-9a-fA-F-]{32,36})/);
    if (guidMatch) {
      return formatHexToIPv6(guidMatch[1]) || nodeId;
    }

    // 兼容 ns=1;i=2001EACA01010000001ECD000201000B
    const numericMatch = nodeId.match(/ns=\d+;i=([0-9a-fA-F]{32})/);
    if (numericMatch) {
      return formatHexToIPv6(numericMatch[1]) || nodeId;
    }

    return nodeId;
  };

  const buildTreeKey = (node: OPCUANode, index: number, parentKey = ''): string => {
    const pathPart = `${index}:${node.nodeId}`;
    return parentKey ? `${parentKey}/${pathPart}` : pathPart;
  };

  const findNodeByTreeKey = (
    nodeList: OPCUANode[],
    targetKey: string,
    parentKey = ''
  ): OPCUANode | null => {
    for (let index = 0; index < nodeList.length; index += 1) {
      const node = nodeList[index];
      const nodeKey = buildTreeKey(node, index, parentKey);
      if (nodeKey === targetKey) {
        return node;
      }

      if (node.children && node.children.length > 0) {
        const found = findNodeByTreeKey(node.children, targetKey, nodeKey);
        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  const convertToTreeData = (nodeList: OPCUANode[], parentKey = ''): OPCUATreeDataNode[] => {
    return nodeList.map((node, index) => {
      const nodeKey = buildTreeKey(node, index, parentKey);
      const treeNode: OPCUATreeDataNode = {
        key: nodeKey,
        title: (
          <div style={treeNodeTitleStyle}>
            <span style={{ color: getNodeColor(node.nodeClass), display: 'inline-flex' }}>
              {getNodeIcon(node.nodeClass)}
            </span>
            <span style={{ color: getNodeColor(node.nodeClass), fontSize: TREE_FONT_SIZE }}>
              {node.browseName}
            </span>
          </div>
        ),
        children: node.children && node.children.length > 0
          ? convertToTreeData(node.children, nodeKey)
          : undefined,
        isLeaf: !node.children || node.children.length === 0,
        node
      };
      return treeNode;
    });
  };

  const treeData = useMemo(() => convertToTreeData(nodes), [nodes]);
  const expandableKeys = useMemo(() => {
    const keys: string[] = [];
    const collectKeys = (treeNodes: OPCUATreeDataNode[]) => {
      treeNodes.forEach((node) => {
        if (node.children && node.children.length > 0 && typeof node.key === 'string') {
          keys.push(node.key);
          collectKeys(node.children);
        }
      });
    };

    collectKeys(treeData);
    return keys;
  }, [treeData]);

  // 监听nodes变化，自动更新选中节点的信息
  useEffect(() => {
    if (!selectedNodeKey) {
      return;
    }

    const updatedNode = findNodeByTreeKey(nodes, selectedNodeKey);
    if (updatedNode) {
      setSelectedNode(updatedNode);
      setEditValue(updatedNode.value);
      console.log(`节点 ${updatedNode.browseName} 的数据已更新: ${updatedNode.value}`);
    } else {
      setSelectedNode(null);
      setSelectedNodeKey(null);
      setEditValue(null);
    }
  }, [nodes, selectedNodeKey]);

  const handleSelect = (_selectedKeys: React.Key[], info: { node: DataNode }) => {
    const node = info.node as OPCUATreeDataNode;
    if (node.node) {
      setSelectedNode(node.node);
      setSelectedNodeKey(String(node.key));
      setEditValue(node.node.value);
      onNodeSelect?.(node.node);
    }
  };

  const handleExpand = (expandedKeys: React.Key[]) => {
    setExpandedKeys(expandedKeys.map(String));
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
          style={{ width: '100%', fontSize: DETAIL_FONT_SIZE }}
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
          <span style={{ marginLeft: 8, fontSize: DETAIL_FONT_SIZE }}>
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
          style={{ width: '100%', fontSize: DETAIL_FONT_SIZE }}
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
            style={{ fontSize: TREE_FONT_SIZE, padding: '4px 10px', alignSelf: 'flex-end' }}
          >
            确认修改
          </Button>
        )}
      </div>
    );
  };

  return (
    <Card
      title="AUTBUS 总线设备树"
      extra={
        onRefresh ? (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            loading={refreshing}
          >
            刷新点表
          </Button>
        ) : null
      }
      style={nodeTreeCardStyle}
      bodyStyle={nodeTreeCardBodyStyle}
    >
      <div style={nodeTreeContentStyle}>
        <div style={treePaneStyle}>
          <Spin spinning={loading}>
            <Tree
              treeData={treeData}
              onSelect={handleSelect}
              onExpand={handleExpand}
              expandedKeys={expandedKeys}
              selectedKeys={selectedNodeKey ? [selectedNodeKey] : []}
              showIcon={false}
              defaultExpandAll
              style={{ minWidth: 'max-content', fontSize: TREE_FONT_SIZE }}
            />
          </Spin>
        </div>
        <div style={detailPaneStyle}>
          {selectedNode ? (
            <>
              <Descriptions title="设备信息" bordered size="small" column={1} style={{ fontSize: DETAIL_FONT_SIZE }}>
                <Descriptions.Item label="设备地址" labelStyle={detailLabelStyle} contentStyle={detailContentStyle}>
                  <code style={{ fontSize: CODE_FONT_SIZE, wordBreak: 'break-all' }}>
                    {formatNodeId(selectedNode.nodeId)}
                  </code>
                </Descriptions.Item>
                <Descriptions.Item label="显示名称" labelStyle={detailLabelStyle} contentStyle={detailContentStyle}>
                  {selectedNode.displayName}
                </Descriptions.Item>
                {selectedNode.dataType && (
                  <Descriptions.Item label="数据类型" labelStyle={detailLabelStyle} contentStyle={detailContentStyle}>
                    {selectedNode.dataType}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="当前值" labelStyle={detailLabelStyle} contentStyle={detailContentStyle}>
                  {renderInputControl(selectedNode)}
                </Descriptions.Item>
                {selectedNode.accessLevel && (
                  <Descriptions.Item label="访问级别" labelStyle={detailLabelStyle} contentStyle={detailContentStyle}>
                    {selectedNode.accessLevel}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#999', padding: '48px 0', fontSize: DETAIL_FONT_SIZE }}>
              请选择一个设备查看详情
            </div>
          )}
        </div>
      </div>
      {/* 任务栏形状的底部元素 */}
      <div style={footerStyle}>
        <div style={{ color: '#666' }}>
          设备数: {treeData.length}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button 
            style={footerButtonStyle}
            onClick={() => setExpandedKeys([])}
          >
            折叠所有
          </button>
          <button 
            style={footerButtonStyle}
            onClick={() => setExpandedKeys(expandableKeys)}
          >
            展开所有
          </button>
        </div>
      </div>
    </Card>
  );
};

export default OPCUANodeTree;
