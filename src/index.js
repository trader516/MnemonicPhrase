import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 安全初始化
const initializeApp = () => {
  // 检查是否在Electron环境中
  const isElectron = window && window.process && window.process.type;
  
  if (isElectron) {
    // Electron环境安全配置
    window.addEventListener('beforeunload', () => {
      // 清理敏感数据
      const sensitiveElements = document.querySelectorAll('[data-sensitive]');
      sensitiveElements.forEach(element => {
        element.textContent = '';
        element.value = '';
      });
    });
    
    // 禁用右键菜单在生产环境
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
      document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });
    }
    
    // 禁用拖拽文件到窗口
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    
    document.addEventListener('drop', (e) => {
      e.preventDefault();
    });
  }
  
  console.log('🔐 助记词加密工具初始化完成');
  console.log('⚠️  请注意保护您的隐私和数据安全');
};

// 创建React根节点
const root = ReactDOM.createRoot(document.getElementById('root'));

// 渲染应用
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 初始化安全配置
initializeApp();
