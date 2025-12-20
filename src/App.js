import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Container, Paper, Typography, Box } from '@mui/material';
import MnemonicGenerator from './components/MnemonicGenerator';
import EncryptionPanel from './components/EncryptionPanel';
import BatchProcessor from './components/BatchProcessor';
import AddressValidator from './components/AddressValidator';
import GasBatchManager from './components/GasBatchManager';
import './App.css';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
});

function App() {
  const [currentTab, setCurrentTab] = useState(0);
  const [mnemonics, setMnemonics] = useState([]);
  const [encryptedResults, setEncryptedResults] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 监听Electron菜单事件（在Web环境下安全跳过）
  useEffect(() => {
    let ipcRenderer;
    try {
      if (typeof window !== 'undefined' && window.require) {
        const electron = window.require('electron');
        ipcRenderer = electron && electron.ipcRenderer;
      }
    } catch (e) {
      ipcRenderer = undefined;
    }

    if (!ipcRenderer) {
      // 非 Electron 环境（纯网页），不做任何处理
      return () => {};
    }

    ipcRenderer.on('menu-new', () => {
      setMnemonics([]);
      setEncryptedResults([]);
    });

    ipcRenderer.on('menu-batch', () => {
      setCurrentTab(3);
    });

    ipcRenderer.on('menu-clear', () => {
      if (window.confirm('确定要清空所有数据吗？此操作不可撤销。')) {
        setMnemonics([]);
        setEncryptedResults([]);
      }
    });

    // 清理事件监听器
    return () => {
      ipcRenderer.removeAllListeners('menu-new');
      ipcRenderer.removeAllListeners('menu-batch');
      ipcRenderer.removeAllListeners('menu-clear');
    };
  }, []);

  const currentTheme = createTheme({
    ...theme,
    palette: {
      ...theme.palette,
      mode: isDarkMode ? 'dark' : 'light',
    },
  });

  return (
    <ThemeProvider theme={currentTheme}>
      <CssBaseline />
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h4" component="h1" gutterBottom>
              🔐 助记词生成与加密工具
            </Typography>
            <Typography variant="subtitle1" color="textSecondary">
              安全 • 简单 • 高效
            </Typography>
          </Box>

          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <div className="tab-container">
              <button 
                className={`tab-button ${currentTab === 0 ? 'active' : ''}`}
                onClick={() => setCurrentTab(0)}
              >
                🎲 生成助记词
              </button>
              <button 
                className={`tab-button ${currentTab === 1 ? 'active' : ''}`}
                onClick={() => setCurrentTab(1)}
              >
                🔐 加密助记词
              </button>
              <button 
                className={`tab-button ${currentTab === 2 ? 'active' : ''}`}
                onClick={() => setCurrentTab(2)}
              >
                🔓 解密助记词
              </button>
              <button
                className={`tab-button ${currentTab === 3 ? 'active' : ''}`}
                onClick={() => setCurrentTab(3)}
              >
                ⚡ 批量生成
              </button>
              <button
                className={`tab-button ${currentTab === 4 ? 'active' : ''}`}
                onClick={() => setCurrentTab(4)}
              >
                🔍 地址验证
              </button>
              <button
                className={`tab-button ${currentTab === 5 ? 'active' : ''}`}
                onClick={() => setCurrentTab(5)}
              >
                ⛽ Gas 批量
              </button>
            </div>
          </Box>

          {currentTab === 0 && (
            <MnemonicGenerator 
              mnemonics={mnemonics}
              setMnemonics={setMnemonics}
            />
          )}

          {currentTab === 1 && (
            <EncryptionPanel 
              mnemonics={mnemonics}
              encryptedResults={encryptedResults}
              setEncryptedResults={setEncryptedResults}
              mode="encrypt"
            />
          )}

          {currentTab === 2 && (
            <EncryptionPanel 
              mnemonics={mnemonics}
              encryptedResults={encryptedResults}
              setEncryptedResults={setEncryptedResults}
              mode="decrypt"
            />
          )}

          {currentTab === 3 && (
            <BatchProcessor
              onBatchComplete={(results) => setEncryptedResults(results)}
            />
          )}

          {currentTab === 4 && (
            <AddressValidator />
          )}

          {currentTab === 5 && (
            <GasBatchManager />
          )}
        </Paper>

        {/* 安全提醒 */}
        <Paper elevation={2} sx={{ p: 2, bgcolor: 'warning.light', color: 'warning.contrastText' }}>
          <Typography variant="body2">
            ⚠️ <strong>安全提醒</strong>：请务必安全保存您的密码和助记词。建议将加密后的文件备份到多个安全位置。
            本软件采用AES-256-CTR加密，请使用强密码保护您的数据。
          </Typography>
        </Paper>
      </Container>
    </ThemeProvider>
  );
}

export default App;
