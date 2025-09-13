const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;

async function createWindow() {
  console.log('🚀 开始创建Electron窗口');
  console.log('📊 开发模式检测:', isDev);
  console.log('🔧 环境变量 ELECTRON_IS_DEV:', process.env.ELECTRON_IS_DEV);
  console.log('📁 当前目录:', __dirname);

  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'icon.png'), // 应用图标
    show: false,
    titleBarStyle: 'default'
  });

  // 强制使用开发模式URL（因为我们知道我们在开发）
  const startUrl = 'http://localhost:3000';
  console.log('🔗 准备加载URL:', startUrl);
  
  // 等待React开发服务器启动
  console.log('⏳ 开始等待React服务器...');
    // 等待React开发服务器启动
    const waitForReactServer = async () => {
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const http = require('http');
          await new Promise((resolve, reject) => {
            const req = http.get('http://localhost:3000', (res) => {
              resolve(res);
            });
            req.on('error', reject);
            req.setTimeout(1000, () => {
              req.destroy();
              reject(new Error('Timeout'));
            });
          });
          console.log('✅ React开发服务器已就绪');
          return true;
        } catch (error) {
          console.log(`⏳ 等待React服务器启动... (${i + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      throw new Error('React开发服务器启动超时');
    };
    
  try {
    await waitForReactServer();
  } catch (error) {
    console.error('❌ 无法连接到React开发服务器:', error);
    console.log('🔄 尝试直接加载URL...');
  }
  
  console.log('🔗 正在加载:', startUrl);
  mainWindow.loadURL(startUrl);

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // 开发模式下打开开发工具
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // 窗口关闭时的处理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 设置菜单
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new');
          }
        },
        {
          label: '导入',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: '加密文件', extensions: ['txt', 'json', 'csv'] },
                { name: '所有文件', extensions: ['*'] }
              ]
            });
            
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('menu-import', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '工具',
      submenu: [
        {
          label: '批量生成',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow.webContents.send('menu-batch');
          }
        },
        {
          label: '清空所有',
          click: () => {
            mainWindow.webContents.send('menu-clear');
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: '助记词生成与加密工具',
              detail: '版本 1.0.0\\n\\n安全生成BIP39助记词并使用AES-256-CTR加密保护。\\n\\n⚠️ 请妥善保管您的密码和助记词！'
            });
          }
        }
      ]
    }
  ];

  // macOS 菜单调整
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about', label: '关于 ' + app.getName() },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 ' + app.getName() },
        { role: 'hideothers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出 ' + app.getName() }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 应用准备就绪
app.whenReady().then(() => createWindow());

// 当所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  // macOS上除非用户明确退出，否则保持应用运行
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOS上点击dock图标重新打开窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 安全设置：防止新窗口打开
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (navigationEvent) => {
    navigationEvent.preventDefault();
  });
});

// IPC 处理器
ipcMain.handle('save-file', async (event, data, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath,
    filters: [
      { name: 'JSON文件', extensions: ['json'] },
      { name: '文本文件', extensions: ['txt'] },
      { name: 'CSV文件', extensions: ['csv'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    const fs = require('fs');
    try {
      await fs.promises.writeFile(result.filePath, data);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, cancelled: true };
});

// 内存清理和安全退出
process.on('exit', () => {
  // 清理敏感数据
  if (global.gc) {
    global.gc();
  }
});
