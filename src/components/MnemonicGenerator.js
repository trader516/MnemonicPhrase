import React, { useState } from 'react';
import {
  Paper,
  Typography,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Alert
} from '@mui/material';
import {
  Casino,
  ContentCopy,
  QrCode,
  Refresh,
  CheckCircle
} from '@mui/icons-material';
import { generateMnemonic, validateMnemonic } from '../utils/cryptoUtilsGUI';
import OfflineQRGenerator from './OfflineQRGenerator';

const MnemonicGenerator = ({ mnemonics, setMnemonics }) => {
  const [wordCount, setWordCount] = useState('12');
  const [generating, setGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const count = parseInt(wordCount);
      const mnemonic = await generateMnemonic(count);
      
      // 验证生成的助记词
      const isValid = validateMnemonic(mnemonic);
      if (!isValid) {
        throw new Error('生成的助记词验证失败');
      }
      
      const newMnemonic = {
        id: Date.now(),
        words: mnemonic.split(' '),
        wordCount: count,
        createdAt: new Date().toISOString(),
        isValid: true
      };
      
      setMnemonics([newMnemonic]);
      console.log('✅ 助记词生成成功:', count, '个单词');
      
    } catch (error) {
      console.error('❌ 助记词生成失败:', error);
      alert('生成失败：' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (mnemonic) => {
    try {
      const text = mnemonic.words.join(' ');
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      
      setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
      
      console.log('📋 助记词已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  const handleGenerateQR = (mnemonic) => {
    const text = mnemonic.words.join(' ');
    console.log('🔍 生成二维码:', text);
    setQrData(text);
    setQrOpen(true);
  };

  return (
    <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        🎲 助记词生成器
      </Typography>
      
      <Typography variant="body2" color="textSecondary" paragraph>
        遵循 BIP39 标准生成安全的助记词，支持 12-24 个单词长度
      </Typography>

      <Box sx={{ mb: 3 }}>
        <FormControl component="fieldset">
          <FormLabel component="legend">选择助记词长度</FormLabel>
          <RadioGroup
            row
            value={wordCount}
            onChange={(e) => setWordCount(e.target.value)}
          >
            <FormControlLabel value="12" control={<Radio />} label="12 词" />
            <FormControlLabel value="15" control={<Radio />} label="15 词" />
            <FormControlLabel value="18" control={<Radio />} label="18 词" />
            <FormControlLabel value="21" control={<Radio />} label="21 词" />
            <FormControlLabel value="24" control={<Radio />} label="24 词" />
          </RadioGroup>
        </FormControl>
      </Box>

      <Box className="button-group" sx={{ mb: 3 }}>
        <Button
          variant="contained"
          startIcon={generating ? <Refresh sx={{ animation: 'spin 1s linear infinite' }} /> : <Casino />}
          onClick={handleGenerate}
          disabled={generating}
          size="large"
        >
          {generating ? '生成中...' : '生成助记词'}
        </Button>
      </Box>

      {mnemonics.length > 0 && (
        <Box>
          {mnemonics.map((mnemonic) => (
            <Box key={mnemonic.id} className="slide-in" sx={{ mb: 2 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="h6">
                  生成的助记词 ({mnemonic.wordCount} 词)
                </Typography>
                <Box>
                  {mnemonic.isValid && (
                    <Chip 
                      icon={<CheckCircle />} 
                      label="已验证" 
                      color="success" 
                      size="small" 
                      sx={{ mr: 1 }}
                    />
                  )}
                  <Tooltip title="复制助记词">
                    <IconButton
                      color={copySuccess ? 'success' : 'primary'}
                      onClick={() => handleCopy(mnemonic)}
                      size="small"
                    >
                      <ContentCopy />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="生成二维码">
                    <IconButton
                      color="primary"
                      onClick={() => handleGenerateQR(mnemonic)}
                      size="small"
                    >
                      <QrCode />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              
              <div className="mnemonic-display">
                <div className="mnemonic-words">
                  {mnemonic.words.map((word, index) => (
                    <div key={index} className="mnemonic-word">
                      <span className="word-number">{index + 1}.</span>
                      <span className="word-text" data-sensitive>{word}</span>
                    </div>
                  ))}
                </div>
                
                <Typography variant="caption" color="textSecondary">
                  生成时间: {new Date(mnemonic.createdAt).toLocaleString('zh-CN')}
                </Typography>
              </div>
              
              {copySuccess && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  助记词已复制到剪贴板！请妥善保管。
                </Alert>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Alert severity="warning" sx={{ mt: 2 }}>
        <strong>安全提醒：</strong>
        <br />
        • 助记词是您数字资产的唯一凭证，请妥善保管
        <br />
        • 不要在网络上传输或存储明文助记词
        <br />
        • 建议将助记词写在纸上并保存在安全的地方
        <br />
        • 使用本工具加密功能可以安全保存助记词
      </Alert>

      {/* 离线二维码生成器 */}
      <OfflineQRGenerator
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        data={qrData}
        title="助记词二维码"
      />
    </Paper>
  );
};

export default MnemonicGenerator;
