import React, { useState } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  IconButton,
  Tooltip,
  Chip,
  Divider
} from '@mui/material';
import {
  Lock,
  LockOpen,
  ContentCopy,
  Download,
  Visibility,
  VisibilityOff,
  Security,
  QrCode
} from '@mui/icons-material';
import { encryptMnemonic, decryptMnemonic } from '../utils/cryptoUtilsGUI';
import { fileExporter } from '../utils/fileExportUtils';
import OfflineQRGenerator from './OfflineQRGenerator';

const EncryptionPanel = ({ mnemonics, encryptedResults, setEncryptedResults, mode = "encrypt" }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [decryptPassword, setDecryptPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [encrypting, setEncrypting] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, text: '无' });
  const [decryptResult, setDecryptResult] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [inputMnemonic, setInputMnemonic] = useState('');
  const [inputEncryptedData, setInputEncryptedData] = useState('');

  // 密码强度检测
  const checkPasswordStrength = (pwd) => {
    let score = 0;
    let feedback = [];
    
    if (pwd.length >= 8) score += 1;
    else feedback.push('至少8个字符');
    
    if (/[a-z]/.test(pwd)) score += 1;
    else feedback.push('包含小写字母');
    
    if (/[A-Z]/.test(pwd)) score += 1;
    else feedback.push('包含大写字母');
    
    if (/[0-9]/.test(pwd)) score += 1;
    else feedback.push('包含数字');
    
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    else feedback.push('包含特殊符号');
    
    const strengthLabels = ['很弱', '弱', '一般', '良好', '强'];
    const strengthColors = ['weak', 'weak', 'fair', 'good', 'strong'];
    
    return {
      score,
      text: strengthLabels[score] || '无',
      color: strengthColors[score] || 'weak',
      feedback
    };
  };

  React.useEffect(() => {
    if (password) {
      setPasswordStrength(checkPasswordStrength(password));
    } else {
      setPasswordStrength({ score: 0, text: '无', color: 'weak' });
    }
  }, [password]);

  const handleEncrypt = async () => {
    if (!password) {
      alert('请输入加密密码');
      return;
    }
    
    if (mode === "encrypt" && password !== confirmPassword) {
      alert('两次输入的密码不一致');
      return;
    }
    
    if (passwordStrength.score < 3) {
      const confirmed = window.confirm('密码强度较弱，建议使用更强的密码。确定继续吗？');
      if (!confirmed) return;
    }
    
    // 获取要加密的助记词
    const targetMnemonics = [];
    
    if (inputMnemonic.trim()) {
      const words = inputMnemonic.trim().split(/\s+/);
      targetMnemonics.push({
        id: Date.now(),
        words: words,
        wordCount: words.length,
        createdAt: new Date().toISOString()
      });
    } else if (mnemonics.length > 0) {
      targetMnemonics.push(...mnemonics);
    } else {
      alert('请先生成助记词或输入要加密的助记词');
      return;
    }

    setEncrypting(true);
    try {
      const results = [];
      
      for (const mnemonic of targetMnemonics) {
        const mnemonicText = Array.isArray(mnemonic.words) 
          ? mnemonic.words.join(' ') 
          : mnemonic.words;
        const encrypted = await encryptMnemonic(mnemonicText, password);
        
        results.push({
          id: Date.now() + Math.random(),
          originalId: mnemonic.id,
          encryptedData: encrypted,
          wordCount: mnemonic.wordCount,
          createdAt: new Date().toISOString(),
          algorithm: 'AES-256-GCM',
          keyDerivation: 'PBKDF2-SHA256',
          iterations: 10000
        });
      }
      
      setEncryptedResults(results);
      console.log('🔒 助记词加密完成:', results.length, '个');
      
      // 清理输入
      setTimeout(() => {
        setPassword('');
        setConfirmPassword('');
        setInputMnemonic('');
      }, 100);
      
    } catch (error) {
      console.error('❌ 加密失败:', error);
      alert('加密失败：' + error.message);
    } finally {
      setEncrypting(false);
    }
  };

  const handleDecrypt = async (encryptedData) => {
    const targetData = encryptedData || inputEncryptedData;
    const targetPassword = mode === "decrypt" ? decryptPassword : password;
    
    if (!targetPassword) {
      alert('请输入解密密码');
      return;
    }

    if (!targetData) {
      alert('请输入要解密的数据');
      return;
    }

    setDecrypting(true);
    try {
      const decrypted = await decryptMnemonic(targetData, targetPassword);
      setDecryptResult(decrypted);
      console.log('🔓 解密成功');
    } catch (error) {
      console.error('❌ 解密失败:', error);
      alert('解密失败：密码错误或数据损坏');
      setDecryptResult('');
    } finally {
      setDecrypting(false);
    }
  };

  const handleCopyEncrypted = async (data) => {
    try {
      await navigator.clipboard.writeText(data);
      console.log('📋 加密数据已复制');
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  const handleExport = async (result) => {
    try {
      await fileExporter.exportSingle(result, 'json');
      alert('文件导出成功！');
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败：' + error.message);
    }
  };

  const handleGenerateQR = (result) => {
    setQrData(result);
    setQrOpen(true);
    console.log('📱 准备生成离线二维码');
  };

  const isEncryptMode = mode === "encrypt";
  const isDecryptMode = mode === "decrypt";

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        {isEncryptMode ? "🔒 加密助记词" : "🔓 解密助记词"}
      </Typography>
      
      <Typography variant="body2" color="textSecondary" paragraph>
        {isEncryptMode 
          ? "使用 AES-256-GCM 算法和 PBKDF2 密钥派生对助记词进行加密保护" 
          : "输入加密数据和密码来解密助记词"
        }
      </Typography>

      {/* 解密模式的输入区域 */}
      {isDecryptMode && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            输入要解密的数据
          </Typography>
          
          <TextField
            fullWidth
            label="加密数据（Base64格式）"
            multiline
            rows={4}
            value={inputEncryptedData}
            onChange={(e) => setInputEncryptedData(e.target.value)}
            margin="normal"
            placeholder="粘贴要解密的加密数据"
            required
          />
        </Box>
      )}

      {/* 加密模式的输入区域 */}
      {isEncryptMode && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            选择要加密的助记词
          </Typography>
          
          {mnemonics.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              请先在"🎲 生成助记词"页面生成助记词，或者在下方输入要加密的助记词。
            </Alert>
          )}
          
          <TextField
            fullWidth
            label="要加密的助记词（可选）"
            multiline
            rows={3}
            value={inputMnemonic}
            onChange={(e) => setInputMnemonic(e.target.value)}
            margin="normal"
            placeholder="输入要加密的助记词，或使用上面生成的助记词"
          />
        </Box>
      )}
        
      {/* 密码输入区域 */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          label={isEncryptMode ? "加密密码" : "解密密码"}
          type={showPassword ? 'text' : 'password'}
          value={isEncryptMode ? password : decryptPassword}
          onChange={(e) => isEncryptMode ? setPassword(e.target.value) : setDecryptPassword(e.target.value)}
          margin="normal"
          InputProps={{
            endAdornment: (
              <IconButton
                onClick={() => setShowPassword(!showPassword)}
                edge="end"
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            ),
          }}
        />
        
        {isEncryptMode && (
          <TextField
            fullWidth
            label="确认密码"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            margin="normal"
            error={confirmPassword && password !== confirmPassword}
            helperText={confirmPassword && password !== confirmPassword ? '密码不一致' : ''}
          />
        )}
      </Box>

      {/* 密码强度显示 */}
      {isEncryptMode && password && (
        <Box className="password-strength" sx={{ mb: 2 }}>
          <Typography variant="body2">密码强度:</Typography>
          <div className="strength-bar">
            <div className={`strength-fill strength-${passwordStrength.color}`}></div>
          </div>
          <Typography variant="body2" className="strength-label">
            {passwordStrength.text}
          </Typography>
        </Box>
      )}

      {/* 操作按钮 */}
      <Box sx={{ mb: 3 }}>
        {isEncryptMode && (
          <Button
            variant="contained"
            startIcon={encrypting ? <Security /> : <Lock />}
            onClick={handleEncrypt}
            disabled={encrypting || (mnemonics.length === 0 && !inputMnemonic) || !password || !confirmPassword}
            size="large"
          >
            {encrypting ? '加密中...' : '加密助记词'}
          </Button>
        )}

        {isDecryptMode && (
          <Button
            variant="contained"
            startIcon={decrypting ? <Security /> : <LockOpen />}
            onClick={() => handleDecrypt(inputEncryptedData)}
            disabled={decrypting || !inputEncryptedData || !decryptPassword}
            size="large"
          >
            {decrypting ? '解密中...' : '解密助记词'}
          </Button>
        )}
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* 加密结果显示 */}
      {encryptedResults.length > 0 && isEncryptMode && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            加密结果
          </Typography>
          
          {encryptedResults.map((result) => (
            <Box key={result.id} sx={{ mb: 3, p: 2, border: '1px solid #e0e0e0', borderRadius: 2 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Box>
                  <Chip 
                    label={`${result.wordCount} 词`} 
                    size="small" 
                    sx={{ mr: 1 }}
                  />
                  <Chip 
                    label={result.algorithm} 
                    color="primary" 
                    size="small" 
                  />
                </Box>
                <Box>
                  <Tooltip title="复制加密数据">
                    <IconButton
                      onClick={() => handleCopyEncrypted(result.encryptedData)}
                      size="small"
                    >
                      <ContentCopy />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="导出文件">
                    <IconButton
                      onClick={() => handleExport(result)}
                      size="small"
                    >
                      <Download />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="生成离线二维码">
                    <IconButton
                      onClick={() => handleGenerateQR(result)}
                      size="small"
                    >
                      <QrCode />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              
              <div className="encrypted-result" data-sensitive>
                {result.encryptedData}
              </div>
              
              <Typography variant="caption" color="textSecondary">
                加密时间: {new Date(result.createdAt).toLocaleString('zh-CN')}
                | 迭代次数: {result.iterations.toLocaleString()}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* 解密结果显示 */}
      {decryptResult && isDecryptMode && (
        <Box sx={{ mb: 4 }}>
          <Alert severity="success">
            <Typography variant="subtitle2">✅ 解密成功！</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              解密的助记词:
            </Typography>
            <div className="encrypted-result" style={{ marginTop: 10, backgroundColor: '#e8f5e8' }}>
              {decryptResult}
            </div>
            <Box sx={{ mt: 2 }}>
              <Button
                size="small"
                startIcon={<ContentCopy />}
                onClick={() => navigator.clipboard.writeText(decryptResult)}
              >
                复制助记词
              </Button>
              <Button
                size="small"
                startIcon={<QrCode />}
                onClick={() => handleGenerateQR({ encryptedData: decryptResult })}
                sx={{ ml: 1 }}
              >
                生成二维码
              </Button>
            </Box>
          </Alert>
        </Box>
      )}

      {/* 二维码生成器 */}
      <OfflineQRGenerator
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        data={qrData}
        title={isEncryptMode ? "加密数据二维码" : "助记词二维码"}
      />
    </Paper>
  );
};

export default EncryptionPanel;
