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
  Paper
} from '@mui/material';
import {
  Close,
  Download,
  ContentCopy,
  QrCodeScanner
} from '@mui/icons-material';
import QRCode from 'qrcode';

/**
 * 离线二维码生成器
 * 使用真正的二维码库生成可识别的二维码
 */

const OfflineQRGenerator = ({ open, onClose, data, title = '助记词二维码' }) => {
  const [qrSize, setQrSize] = useState(4);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef(null);

  const sizeOptions = [
    { value: 2, label: '小 (2x)', pixelSize: 4 },
    { value: 4, label: '中 (4x)', pixelSize: 8 },
    { value: 6, label: '大 (6x)', pixelSize: 12 },
    { value: 8, label: '超大 (8x)', pixelSize: 16 }
  ];

  useEffect(() => {
    if (open && data) {
      generateQRCode();
    }
  }, [open, data, qrSize]);

  const generateQRCode = async () => {
    if (!data) return;

    setGenerating(true);
    try {
      let qrText = data;
      if (typeof data === 'object') {
        qrText = data.encryptedData || JSON.stringify(data);
      }

      console.log('🔍 二维码数据内容:', qrText);
      console.log('🔍 数据类型:', typeof qrText);

      const selectedSize = sizeOptions.find(opt => opt.value === qrSize);
      
      // 生成二维码为DataURL
      const qrDataUrl = await QRCode.toDataURL(qrText, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });

      setQrDataUrl(qrDataUrl);
      console.log('📱 离线二维码生成成功');

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
      link.download = `qrcode_${Date.now()}.png`;
      link.href = qrDataUrl;
      link.click();

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
      
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      
      console.log('📋 二维码已复制到剪贴板');
      alert('二维码图片已复制到剪贴板！');
    } catch (error) {
      console.error('❌ 图片复制失败:', error);
      alert('复制失败：' + error.message);
    }
  };

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
            <Typography variant="h6">{title} (离线生成)</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity="success" sx={{ mb: 2 }}>
          <Typography variant="subtitle2">✅ 完全离线生成</Typography>
          <Typography variant="body2">
            此二维码使用真正的二维码算法在本地生成，无需网络连接，保障您的数据隐私安全。
          </Typography>
        </Alert>

        {/* 二维码设置 */}
        <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>二维码设置</Typography>
          
          <FormControl size="small" sx={{ minWidth: 120 }}>
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
        </Paper>

        {/* 二维码显示区域 */}
        <Box className="qr-container" sx={{ textAlign: 'center', mb: 3 }}>
          {generating ? (
            <Box sx={{ p: 4 }}>
              <Typography>生成二维码中...</Typography>
            </Box>
          ) : qrDataUrl ? (
            <Box>
              <Typography variant="h6" gutterBottom>{title}</Typography>
              <img
                src={qrDataUrl}
                alt="二维码"
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px'
                }}
              />
              
              <Box sx={{ mt: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
                <Typography variant="caption" color="textSecondary">
                  二维码尺寸: 300×300 像素 | 放大倍数: {qrSize}x
                  <br />
                  生成模式: 离线本地生成 | 数据长度: {typeof data === 'string' ? data.length : JSON.stringify(data).length} 字符
                  <br />
                  纠错级别: M (中等) | 使用标准二维码算法
                </Typography>
              </Box>
            </Box>
          ) : null}
        </Box>

        {/* 使用说明 */}
        <Alert severity="info">
          <Typography variant="subtitle2">使用说明</Typography>
          <Typography variant="body2">
            • 此二维码包含您的助记词文本，可直接被钱包应用识别
            <br />
            • 可使用任何二维码扫描器读取
            <br />
            • 建议在安全环境中展示此二维码
            <br />
            • 支持导入到支持BIP39助记词的钱包中
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

export default OfflineQRGenerator;