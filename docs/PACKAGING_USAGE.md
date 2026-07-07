# AUTBUS Scanner 打包与使用说明

## 1. 文档目的

本文档用于指导开发、测试和交付人员完成 AUTBUS Scanner 的本地构建、Windows 离线安装包生成、目标机器安装启动和基础使用验证。

AUTBUS Scanner 是面向 AUTBUS 控制器、网关、从站的设备发现与 OPC UA 对象操作工具。安装包采用 Windows zip 形式，内置前端构建产物、后端 Node.js 服务、后端依赖和 `node.exe` 运行时，目标机器无需单独安装 Node.js。

## 2. 环境要求

开发打包机器需要具备：

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows 10/11 |
| 运行环境 | Node.js、npm、PowerShell |
| 网络 | 可访问 AUTBUS 设备所在网络，启用 IPv6 |
| 源码目录 | `D:\Interest_Group\project1ai\autbus-scanner` |

建议在 PowerShell 中使用 `npm.cmd`，避免部分机器因执行策略拦截 `npm.ps1`。

```powershell
node -v
npm.cmd -v
```

## 3. 源码依赖安装

首次获取源码后，分别安装前端和后端依赖。

前端依赖：

```powershell
cd D:\Interest_Group\project1ai\autbus-scanner
npm.cmd install
```

后端依赖：

```powershell
cd D:\Interest_Group\project1ai\autbus-scanner\backend
npm.cmd install
```

## 4. 本地开发启动

开发调试通常需要分别启动后端服务和前端开发服务。

启动后端：

```powershell
cd D:\Interest_Group\project1ai\autbus-scanner\backend
npm.cmd run start
```

启动前端：

```powershell
cd D:\Interest_Group\project1ai\autbus-scanner
npm.cmd run dev
```

默认端口：

| 功能 | 地址或端口 |
| --- | --- |
| Web 页面 | `http://localhost:3001` |
| WebSocket 服务 | `ws://localhost:8082` |
| UDP 发现端口 | `6060` |
| IPv6 组播地址 | `ff03::c` |

## 5. 生产构建

在项目根目录执行：

```powershell
cd D:\Interest_Group\project1ai\autbus-scanner
npm.cmd run build
```

该命令执行 `tsc && vite build`，前端产物输出到 `dist` 目录。

后端无需编译，建议打包前执行语法检查：

```powershell
node --check backend\server.js
```

## 6. 生成 Windows 离线安装包

项目提供一键打包命令：

```powershell
cd D:\Interest_Group\project1ai\autbus-scanner
npm.cmd run package:win
```

该命令调用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-win.ps1
```

脚本自动完成：

1. 执行前端构建。
2. 检查后端 `backend\server.js` 语法。
3. 清理并创建 `release\AUTBUS-Scanner-<Version>`。
4. 复制 `dist` 前端产物。
5. 复制后端入口、后端依赖和后端 `package*.json`。
6. 复制本机 `node.exe` 到安装包运行时目录。
7. 生成 `install.cmd`、`install.ps1`、`start.cmd` 和 `README.txt`。
8. 生成 zip 安装包。

默认输出：

```text
release\AUTBUS-Scanner-1.0.0-win-x64.zip
```

如需指定版本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-win.ps1 -Version 1.0.1
```

## 7. 安装包结构

```text
AUTBUS-Scanner-1.0.0
├─ install.cmd
├─ install.ps1
├─ start.cmd
├─ README.txt
├─ runtime
│  └─ node.exe
└─ app
   ├─ dist
   │  ├─ index.html
   │  └─ assets
   └─ backend
      ├─ server.js
      ├─ package.json
      ├─ package-lock.json
      └─ node_modules
```

| 文件或目录 | 说明 |
| --- | --- |
| `install.cmd` | 用户双击入口，调用 PowerShell 安装脚本 |
| `install.ps1` | 复制文件到用户目录并创建桌面快捷方式 |
| `start.cmd` | 启动本地后端服务并打开浏览器 |
| `runtime\node.exe` | 随包 Node.js 运行时 |
| `app\dist` | 前端生产构建产物 |
| `app\backend` | 后端服务、依赖和协议处理逻辑 |

## 8. 目标机器安装与启动

安装步骤：

1. 将 `AUTBUS-Scanner-1.0.0-win-x64.zip` 拷贝到目标 Windows 机器。
2. 解压 zip。
3. 双击 `install.cmd`。
4. 安装程序复制文件到 `%LOCALAPPDATA%\AUTBUS Scanner`。
5. 桌面生成 `AUTBUS Scanner.lnk` 快捷方式。
6. 双击桌面快捷方式启动。

启动后访问：

```text
http://localhost:3001
```

注意事项：

- 使用过程中保持启动命令窗口打开，关闭窗口会停止本地服务。
- 首次启动如出现 Windows 防火墙提示，应允许访问网络。
- 如果无法发现设备，优先检查网卡、IPv6、防火墙和端口占用。

## 9. 基础使用流程

1. 启动 AUTBUS Scanner。
2. 在左侧扫描区域选择可用网络接口。
3. 点击扫描按钮发现 AUTBUS 设备。
4. 在设备树中选择控制器、网关或从站。
5. 对控制器执行 OPC UA 连接后查看 `AUTBUS 总线设备树`。
6. 选择节点后查看设备地址、显示名称、数据类型、当前值和访问级别。
7. 可读写变量节点会显示 `修改值` 输入框和 `确认修改` 按钮。
8. 只读、只写、无权限或未知权限节点只展示数据，不允许修改。
9. 可在对象直接操作页输入设备 IPv6 地址，直接查询或修改指定对象。

## 10. 交付检查清单

交付前建议确认：

- `npm.cmd run package:win` 执行成功。
- `release\AUTBUS-Scanner-1.0.0-win-x64.zip` 已生成。
- zip 解压后包含 `install.cmd`、`start.cmd`、`runtime\node.exe` 和 `app` 目录。
- 目标机器安装后桌面快捷方式可启动。
- 浏览器可访问 `http://localhost:3001`。
- WebSocket `8082`、HTTP `3001`、UDP `6060` 未被占用。
- Windows 防火墙允许程序访问网络。
- 设备扫描、OPC UA 连接、节点浏览、读写权限控制均通过验证。

## 11. 常见问题

### PowerShell 提示 npm.ps1 无法运行

使用 `npm.cmd` 替代 `npm`：

```powershell
npm.cmd run build
npm.cmd run package:win
```

### 打包时找不到 node.exe

确认开发机已安装 Node.js，并且 `node.exe` 已加入 `PATH`：

```powershell
node -v
```

### 目标机器打不开页面

检查启动窗口日志，并确认以下文件存在：

```text
%LOCALAPPDATA%\AUTBUS Scanner\runtime\node.exe
%LOCALAPPDATA%\AUTBUS Scanner\app\backend\server.js
%LOCALAPPDATA%\AUTBUS Scanner\app\dist\index.html
```

### 无法扫描设备

排查顺序：

1. 是否选择正确网卡。
2. 网卡是否启用 IPv6。
3. Windows 防火墙是否允许访问。
4. 设备与电脑网络是否可达。
5. UDP `6060` 是否被占用。
6. 设备是否支持当前组播地址 `ff03::c`。

