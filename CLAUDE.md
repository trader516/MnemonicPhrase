# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述
这是一个助记词生成与加密工具的Web应用，基于React + Material UI构建。应用支持BIP39标准助记词生成、AES-256-CTR加密、批量处理和多格式导出功能。

## 常用命令

### 开发命令
```bash
# 安装依赖
npm install

# 启动开发服务器
npm start

# 运行测试
npm test

# 构建生产版本
npm run build

# 本地静态服务器（禁用缓存）
npx http-server build -p 5173 -c-1
```

### Electron相关命令
```bash
# 启动Electron开发模式
npm run electron-dev

# 启动Electron（生产模式）
npm run electron

# 构建并打包Electron应用
npm run electron-pack
```

## 代码架构

### 核心组件结构
- `src/App.js` - 主应用组件，集成所有功能模块
- `src/SimpleApp.js` - 简化版应用入口
- `src/components/` - 功能组件目录
  - `MnemonicGenerator.js` - 助记词生成器
  - `EncryptionPanel.js` - 加密/解密面板
  - `BatchProcessor.js` - 批量处理组件
  - `QRCodeGenerator.js` - 二维码生成器
  - `OfflineQRGenerator.js` - 离线二维码生成器
- `src/utils/` - 工具函数目录
  - `cryptoUtils.js` - 加密相关工具函数
  - `cryptoUtilsGUI.js` - GUI相关加密工具
  - `fileExportUtils.js` - 文件导出工具

### 技术栈和依赖
- **前端框架**: React 18 + Material UI 5
- **加密库**: bip39 (助记词), crypto-browserify (AES加密)
- **文件处理**: file-saver, jszip
- **二维码**: qrcode, qrcode-reader
- **构建工具**: react-app-rewired (支持Webpack配置覆盖)

### Webpack配置
项目使用`config-overrides.js`配置Node.js核心模块的浏览器polyfills，包括:
- crypto-browserify
- stream-browserify
- buffer
- process
- path-browserify

### 加密规范
- 算法: AES-256-CTR
- 密钥派生: PBKDF2-SHA256 (10,000次迭代)
- 密文格式: Base64编码的 [16B盐][16B IV][AES密文]

## 开发注意事项
- 应用设计为离线可用，所有加密操作在浏览器端完成
- 批量操作使用Web Workers提升性能
- 文件导出支持JSON/CSV/TXT三种格式和多种保存方式
- 二维码生成完全离线，使用qrcode库
- 项目支持Electron桌面应用打包

## 构建输出
- Web版本输出到 `build/` 目录
- Electron应用输出到 `dist/` 目录
- 支持macOS (dmg), Windows (nsis), Linux (AppImage) 平台