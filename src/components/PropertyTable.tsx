import React from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DeviceProperty } from '../types/device';

interface PropertyTableProps {
  properties: DeviceProperty[];
  loading?: boolean;
}

const PropertyTable: React.FC<PropertyTableProps> = ({ properties, loading }) => {
  const columns: ColumnsType<DeviceProperty> = [
    {
      title: '属性名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '类型',
      dataIndex: 'dataType',
      key: 'dataType',
      width: 80,
      render: (type: string) => {
        const colorMap: Record<string, string> = {
          int: 'blue',
          float: 'green',
          string: 'orange',
          bool: 'purple',
        };
        return <span style={{ color: colorMap[type] || 'default' }}>{type.toUpperCase()}</span>;
      },
    },
    {
      title: '访问权限',
      dataIndex: 'access',
      key: 'access',
      width: 100,
      render: (access: string) => {
        const accessMap: Record<string, { text: string; color: string }> = {
          read: { text: '只读', color: '#52c41a' },
          write: { text: '只写', color: '#faad14' },
          readWrite: { text: '读写', color: '#1890ff' },
        };
        const config = accessMap[access] || { text: access, color: 'default' };
        return <span style={{ color: config.color }}>{config.text}</span>;
      },
    },
    {
      title: '当前值',
      dataIndex: 'value',
      key: 'value',
      width: 120,
      render: (value: string | number | boolean | undefined) => {
        if (value === undefined || value === null) return '-';
        return String(value);
      },
    },
    {
      title: 'NodeID',
      dataIndex: 'nodeId',
      key: 'nodeId',
      width: 180,
      render: (nodeId: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{nodeId}</span>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={properties}
      rowKey="id"
      size="small"
      loading={loading}
      pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true }}
      scroll={{ x: 800 }}
    />
  );
};

export default PropertyTable;
