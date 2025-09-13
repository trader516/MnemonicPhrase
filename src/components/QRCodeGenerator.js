import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Paper
} from '@mui/material';
import {
  Close,
  Download,
  ContentCopy,
  Share,
  Warning,
  QrCodeScanner
} from '@mui/icons-material';
import QRCode from 'qrcode';

const QRCodeGenerator = ({ open, onClose, data, title = '二维码' }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrSize, setQrSize] = useState(256);
  const [errorLevel, setErrorLevel] = useState('M');
  const [includeTitle, setIncludeTitle] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef(null);

  // 二维码配置选项
  const sizeOptions = [
    { value: 128, label: '小 (128px)' },
    { value: 256, label: '中 (256px)' },
    { value: 512, label: '大 (512px)' },
    { value: 1024, label: '超大 (1024px)' }
  ];

  const errorLevelOptions = [
    { value: 'L', label: 'L - 低 (~7%)' },
    { value: 'M', label: 'M - 中 (~15%)' },
    { value: 'Q', label: 'Q - 四分位 (~25%)' },
    { value: 'H', label: 'H - 高 (~30%)' }
  ];

  // 生成二维码
  useEffect(() => {
    if (open && data) {
      generateQRCode();
    }
  }, [open, data, qrSize, errorLevel, darkMode]);

  const generateQRCode = async () => {
    if (!data) return;

    setGenerating(true);
    try {
      // 二维码生成选项
      const options = {
        errorCorrectionLevel: errorLevel,
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: darkMode ? '#FFFFFF' : '#000000',
          light: darkMode ? '#000000' : '#FFFFFF'
        },
        width: qrSize
      };

      // 根据数据类型格式化
      let qrData = data;
      if (typeof data === 'object') {
        // 如果是加密数据对象，只使用加密字符串
        qrData = data.encryptedData || JSON.stringify(data);
      }

      // 生成二维码
      const dataUrl = await QRCode.toDataURL(qrData, options);
      setQrDataUrl(dataUrl);

      console.log('📱 二维码生成成功');
      console.log('📊 二维码信息:', {
        size: qrSize,
        errorLevel: errorLevel,
        dataLength: qrData.length,
        darkMode: darkMode
      });

    } catch (error) {
      console.error('❌ 二维码生成失败:', error);
      alert('二维码生成失败：' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;

    try {
      const link = document.createElement('a');
      link.href = qrDataUrl;
      
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      link.download = `qrcode_${timestamp}.png`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log('💾 二维码下载完成');
    } catch (error) {
      console.error('❌ 二维码下载失败:', error);
      alert('下载失败：' + error.message);
    }
  };

  const handleCopyImage = async () => {
    if (!qrDataUrl) return;

    try {
      // 将DataURL转换为Blob
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();

      // 复制到剪贴板
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);

      console.log('📋 二维码图片已复制到剪贴板');
      alert('二维码图片已复制到剪贴板！');
    } catch (error) {
      console.error('❌ 图片复制失败:', error);
      // fallback: 复制数据URL
      try {
        await navigator.clipboard.writeText(qrDataUrl);
        alert('二维码数据已复制到剪贴板！');
      } catch (fallbackError) {
        alert('复制失败：' + error.message);
      }
    }
  };

  const handleShare = async () => {
    if (!navigator.share || !qrDataUrl) {
      alert('分享功能不支持或二维码未生成');
      return;
    }

    try {
      // 将DataURL转换为File
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();
      const file = new File([blob], 'qrcode.png', { type: 'image/png' });

      await navigator.share({
        title: title,
        text: '助记词加密工具生成的二维码',
        files: [file]
      });

      console.log('📤 二维码分享完成');
    } catch (error) {
      console.error('❌ 分享失败:', error);
      alert('分享失败：' + error.message);
    }
  };

  const getDataInfo = () => {
    if (!data) return null;

    let dataStr = data;
    if (typeof data === 'object') {
      dataStr = data.encryptedData || JSON.stringify(data);
    }

    return {
      length: dataStr.length,
      type: typeof data === 'object' ? '加密数据' : '文本数据'
    };
  };

  const dataInfo = getDataInfo();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        style: { borderRadius: 12 }
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center">
            <QrCodeScanner sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6">{title}</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="subtitle2">⚠️ 安全提醒</Typography>
            <Typography variant="body2">
              二维码包含敏感的加密数据，请不要在不安全的环境中展示或分享。
              确保只在信任的设备上扫描此二维码。
            </Typography>
          </Alert>

          {/* 二维码设置 */}
          <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>二维码设置</Typography>
            
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 2 }}>
              <FormControl size="small">
                <InputLabel>尺寸</InputLabel>
                <Select
                  value={qrSize}
                  label="尺寸"
                  onChange={(e) => setQrSize(e.target.value)}
                >
                  {sizeOptions.map(option => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small">
                <InputLabel>纠错级别</InputLabel>
                <Select
                  value={errorLevel}
                  label="纠错级别"
                  onChange={(e) => setErrorLevel(e.target.value)}
                >
                  {errorLevelOptions.map(option => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={darkMode}
                    onChange={(e) => setDarkMode(e.target.checked)}
                  />
                }
                label="深色模式"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={includeTitle}
                    onChange={(e) => setIncludeTitle(e.target.checked)}
                  />
                }
                label="显示标题"
              />
            </Box>
          </Paper>
        </Box>

        {/* 二维码显示区域 */}
        <Box className="qr-container" sx={{ textAlign: 'center', mb: 3 }}>
          {generating ? (
            <Box sx={{ p: 4 }}>
              <Typography>生成二维码中...</Typography>
            </Box>
          ) : qrDataUrl ? (
            <Box>
              {includeTitle && (
                <Typography variant="h6" gutterBottom>{title}</Typography>
              )}
              <img
                src={qrDataUrl}
                alt="Generated QR Code"
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px'
                }}
              />
              
              {/* 数据信息 */}
              {dataInfo && (
                <Box sx={{ mt: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
                  <Typography variant="caption" color="textSecondary">
                    数据类型: {dataInfo.type} | 数据长度: {dataInfo.length} 字符
                    <br />
                    尺寸: {qrSize}×{qrSize}px | 纠错级别: {errorLevel}
                  </Typography>
                </Box>
              )}
            </Box>
          ) : (
            <Typography color="textSecondary">等待生成二维码...</Typography>
          )}
        </Box>

        {/* 钱包兼容性提示 */}
        <Alert severity="info">
          <Typography variant="subtitle2">钱包兼容性</Typography>
          <Typography variant="body2">
            此二维码兼容大多数支持文本扫描的应用，包括：
            <br />
            • 通用二维码扫描器
            • 支持自定义数据的数字钱包
            • 文本编辑应用
            <br />
            <em>注意：加密数据需要使用本工具解密后才能在钱包中使用。</em>
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={handleDownload}
            disabled={!qrDataUrl}
          >
            下载
          </Button>

          <Button
            variant="outlined"
            startIcon={<ContentCopy />}
            onClick={handleCopyImage}
            disabled={!qrDataUrl}
          >
            复制
          </Button>

          {navigator.share && (
            <Button
              variant="outlined"
              startIcon={<Share />}
              onClick={handleShare}
              disabled={!qrDataUrl}
            >
              分享
            </Button>
          )}

          <Box sx={{ flex: 1 }} />

          <Button
            onClick={onClose}
            variant="contained"
          >
            关闭
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default QRCodeGenerator;

