import React, { useState, useRef } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
  InputLabel,
  Alert,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Stop,
  Download,
  Preview,
  Delete,
  Archive,
  QrCode
} from '@mui/icons-material';
import { generateMnemonic, encryptMnemonic } from '../utils/cryptoUtilsGUI';
import { generateEthereumAddress, formatAddress } from '../utils/evmUtils';
import { fileExporter } from '../utils/fileExportUtils';
import OfflineQRGenerator from './OfflineQRGenerator';

const BatchProcessor = ({ onBatchComplete }) => {
  const [batchSize, setBatchSize] = useState(10);
  const [wordCount, setWordCount] = useState('12');
  const [encryptionMode, setEncryptionMode] = useState('unified'); // unified | individual
  const [saveMode, setSaveMode] = useState('single'); // single | multiple | archive
  const [saveFormat, setSaveFormat] = useState('json'); // json | csv | txt
  const [filePrefix, setFilePrefix] = useState('mnemonic_batch_');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [results, setResults] = useState([]);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState('');
  const [addressQrOpen, setAddressQrOpen] = useState(false);
  const [addressQrData, setAddressQrData] = useState('');
  
  const workerRef = useRef(null);
  const pausedRef = useRef(false);
  
  const handleShowQR = (mnemonicText) => {
    if (!mnemonicText) return;
    setQrData(typeof mnemonicText === 'string' ? mnemonicText : String(mnemonicText));
    setQrOpen(true);
  };

  const handleShowAddressQR = (address) => {
    if (!address) return;
    setAddressQrData(address);
    setAddressQrOpen(true);
  };

  const handleStart = async () => {
    // 验证输入
    try {
      if (batchSize < 1 || batchSize > 1000) throw new Error('批量数量必须在 1-1000 之间');
      if (!password) throw new Error('请输入加密密码');
      if (password !== confirmPassword) throw new Error('两次输入的密码不一致');
    } catch (e) {
      // 将错误以可见的方式展示，而不是静默失败
      console.error('输入校验失败:', e.message);
      alert(e.message);
      return;
    }

    setProcessing(true);
    processingRef.current = true;
    setPaused(false);
    setProgress(0);
    setResults([]);
    setStartTime(Date.now());
    pausedRef.current = false;

    console.log(`🚀 开始批量生成 ${batchSize} 个助记词`);

    try {
      console.log('🔄 开始调用 processBatch...');
      const batchResults = await processBatch();
      console.log('✅ processBatch 完成，返回结果:', batchResults);
      console.log('📊 结果数量:', batchResults ? batchResults.length : 0);
      
      // 自动导出：使用本轮批量结果，避免异步state未及时更新
      console.log('🔄 开始调用 handleExportBatch...');
      await handleExportBatch(batchResults);
    } catch (error) {
      console.error('❌ 批量处理失败:', error);
      alert('批量处理失败：' + error.message);
    } finally {
      setProcessing(false);
      processingRef.current = false;
      setPaused(false);
      setCurrentStep('');
    }
  };

  const processBatch = async () => {
    console.log('🔄 processBatch 函数开始执行');
    const batchResults = [];
    const totalSteps = batchSize * 2; // 生成 + 加密
    let completedSteps = 0;
    const startTime = Date.now(); // 记录开始时间
    
    console.log('📊 批量参数:', { batchSize, wordCount, totalSteps });
    console.log('🔍 循环前状态检查:', { 
      batchSize, 
      processing, 
      pausedRef: pausedRef.current,
      batchSizeType: typeof batchSize,
      batchSizeValue: batchSize
    });

    for (let i = 0; i < batchSize; i++) {
      console.log(`🔄 进入循环第 ${i + 1} 次，batchSize: ${batchSize}`);
      // 检查是否暂停
      while (pausedRef.current && processingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!processingRef.current) break; // 停止处理

      try {
        // 生成助记词
        setCurrentStep(`正在生成第 ${i + 1} 个助记词...`);
        console.log(`🔄 开始生成第 ${i + 1} 个助记词`);
        const mnemonic = await generateMnemonic(parseInt(wordCount));
        console.log(`✅ 第 ${i + 1} 个助记词生成成功:`, mnemonic.substring(0, 20) + '...');
        completedSteps++;
        setProgress((completedSteps / totalSteps) * 100);

        // 加密助记词
        setCurrentStep(`正在加密第 ${i + 1} 个助记词...`);
        console.log(`🔐 开始加密第 ${i + 1} 个助记词`);
        const currentPassword = encryptionMode === 'unified' 
          ? password 
          : `${password}_${i + 1}`; // 简单的独立密码变体
          
        const encrypted = await encryptMnemonic(mnemonic, currentPassword);
        console.log(`✅ 第 ${i + 1} 个助记词加密成功:`, encrypted.substring(0, 20) + '...');
        completedSteps++;

        // 生成EVM地址
        let addressInfo = null;
        try {
          setCurrentStep(`正在生成第 ${i + 1} 个地址...`);
          addressInfo = generateEthereumAddress(mnemonic);
          console.log(`✅ 第 ${i + 1} 个地址生成成功:`, addressInfo.address);
        } catch (addressError) {
          console.warn(`第 ${i + 1} 个地址生成失败:`, addressError);
        }

        const result = {
          id: i + 1,
          mnemonic: mnemonic,
          encryptedData: encrypted,
          wordCount: parseInt(wordCount),
          password: encryptionMode === 'individual' ? currentPassword : password,
          createdAt: new Date().toISOString(),
          algorithm: 'AES-256-CTR',
          keyDerivation: 'PBKDF2-SHA256',
          iterations: 10000,
          address: addressInfo?.address,
          privateKey: addressInfo?.privateKey
        };
        
        batchResults.push(result);
        console.log(`📝 第 ${i + 1} 个结果已添加到批量结果，当前总数:`, batchResults.length);
        setResults([...batchResults]);
        setProgress((completedSteps / totalSteps) * 100);
        
        // 更新预计剩余时间
        const elapsed = Date.now() - startTime;
        const avgTimePerItem = elapsed / (i + 1);
        const remaining = (batchSize - i - 1) * avgTimePerItem;
        setEstimatedTime(Math.ceil(remaining / 1000));
        
      } catch (error) {
        console.error(`生成第 ${i + 1} 个助记词失败:`, error);
        // 继续处理下一个
      }
    }

    if (batchResults.length > 0) {
      setCurrentStep('批量处理完成！');
      onBatchComplete(batchResults);
      console.log(`✅ 批量处理完成: ${batchResults.length}/${batchSize} 个助记词`);
    } else {
      console.warn('⚠️ 批量处理完成，但没有生成任何结果');
    }
    
    console.log('🔄 processBatch 函数即将返回:', batchResults);
    return batchResults;
  };

  const handlePause = () => {
    setPaused(!paused);
    pausedRef.current = !paused;
    console.log(paused ? '▶️ 恢复处理' : '⏸️ 暂停处理');
  };

  const handleStop = () => {
    setProcessing(false);
    processingRef.current = false;
    setPaused(false);
    pausedRef.current = false;
    setCurrentStep('已停止');
    console.log('⏹️ 停止处理');
  };

  // 本地直接下载（兜底方案）
  const directDownload = (text, filename) => {
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // 延迟清理，确保下载开始
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      console.log('📄 直接下载文件:', filename);
      return true;
    } catch (e) {
      console.error('直接下载失败:', e);
      return false;
    }
  };

  const handleExportBatch = async (dataOverride) => {
    console.log('🚀 开始批量导出，dataOverride:', dataOverride);
    console.log('🚀 当前results状态:', results);
    const data = Array.isArray(dataOverride) && dataOverride.length > 0 ? dataOverride : results;
    console.log('🚀 最终使用的数据:', data);
    console.log('🚀 数据长度:', data.length);
    
    if (data.length === 0) {
      console.error('❌ 没有可导出的数据');
      alert('没有可导出的数据');
      return;
    }

    try {
      let result;
      
      switch (saveMode) {
        case 'single':
          result = await fileExporter.exportBatchSingle(data, saveFormat);
          break;
        case 'multiple':
          result = await fileExporter.exportBatchMultiple(data, saveFormat, filePrefix);
          break;
        case 'archive':
          result = await fileExporter.exportBatchArchive(data, saveFormat, null, filePrefix);
          break;
        default:
          throw new Error(`不支持的保存模式: ${saveMode}`);
      }

      if (result && result.success) {
        const message = saveMode === 'multiple' 
          ? `批量导出成功！\n保存了 ${result.count} 个文件`
          : `批量导出成功！\n文件: ${result.filename}\n包含 ${result.count} 个加密助记词`;
        alert(message);
        return;
      }
      // 未返回成功时，走兜底 JSON 单文件下载
      const fallback = JSON.stringify({
        batchInfo: {
          createdTime: new Date().toISOString(),
          totalCount: data.length,
          encryptionParams: 'AES-256-GCM/PBKDF2-SHA256/10000'
        },
        mnemonics: data.map((r, i) => ({
          id: r.id ?? i + 1,
          encryptedData: r.encryptedData,
          createdTime: r.createdAt,
          wordCount: r.wordCount,
          algorithm: r.algorithm || 'AES-256-GCM'
        }))
      }, null, 2);
      const name = `${filePrefix || 'mnemonic_batch_'}${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
      const ok = directDownload(fallback, name);
      if (!ok) throw new Error('浏览器下载被拦截或不支持');
      alert(`批量导出成功！\n文件: ${name}\n包含 ${data.length} 个加密助记词`);
    } catch (error) {
      console.error('批量导出失败:', error);
      alert('导出失败：' + error.message);
    }
  };

  const clearResults = () => {
    if (window.confirm('确定要清空所有结果吗？')) {
      setResults([]);
      setProgress(0);
      setCurrentStep('');
    }
  };

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        ⚡ 批量助记词生成与加密
      </Typography>
      
      <Typography variant="body2" color="textSecondary" paragraph>
        批量生成并加密多个助记词，支持统一密码或独立密码模式
      </Typography>

      {/* 批量设置 */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2, mb: 3 }}>
          <TextField
            label="生成数量"
            type="number"
            value={batchSize}
            onChange={(e) => setBatchSize(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))}
            helperText="1-1000 个"
            InputProps={{ inputProps: { min: 1, max: 1000 } }}
          />
          
          <FormControl>
            <InputLabel>助记词长度</InputLabel>
            <Select value={wordCount} onChange={(e) => setWordCount(e.target.value)}>
              <MenuItem value="12">12 词</MenuItem>
              <MenuItem value="15">15 词</MenuItem>
              <MenuItem value="18">18 词</MenuItem>
              <MenuItem value="21">21 词</MenuItem>
              <MenuItem value="24">24 词</MenuItem>
            </Select>
          </FormControl>
          
          <TextField
            label="文件前缀"
            value={filePrefix}
            onChange={(e) => setFilePrefix(e.target.value)}
            helperText="自定义文件名前缀"
          />
        </Box>

        <Box sx={{ mb: 3 }}>
          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <FormLabel component="legend">加密模式</FormLabel>
            <RadioGroup
              row
              value={encryptionMode}
              onChange={(e) => setEncryptionMode(e.target.value)}
            >
              <FormControlLabel 
                value="unified" 
                control={<Radio />} 
                label="统一密码 (推荐)" 
              />
              <FormControlLabel 
                value="individual" 
                control={<Radio />} 
                label="独立密码" 
              />
            </RadioGroup>
          </FormControl>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
            <FormControl>
              <InputLabel>保存模式</InputLabel>
              <Select value={saveMode} onChange={(e) => setSaveMode(e.target.value)}>
                <MenuItem value="single">单文件模式</MenuItem>
                <MenuItem value="multiple">多文件模式</MenuItem>
                <MenuItem value="archive">压缩包模式</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl>
              <InputLabel>导出格式</InputLabel>
              <Select value={saveFormat} onChange={(e) => setSaveFormat(e.target.value)}>
                <MenuItem value="json">JSON 格式</MenuItem>
                <MenuItem value="csv">CSV 格式</MenuItem>
                <MenuItem value="txt">TXT 格式</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            label="加密密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            margin="normal"
            helperText={encryptionMode === 'individual' ? '将用作密码基础，每个助记词会有独立变体' : '所有助记词使用相同密码'}
          />
          
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
        </Box>
      </Box>

      {/* 控制按钮 */}
      <Box className="button-group" sx={{ mb: 3 }}>
        {!processing ? (
          <Button
            variant="contained"
            startIcon={<PlayArrow />}
            onClick={handleStart}
            disabled={processing}
            size="large"
          >
            开始批量生成
          </Button>
        ) : (
          <>
            <Button
              variant="outlined"
              startIcon={paused ? <PlayArrow /> : <Pause />}
              onClick={handlePause}
            >
              {paused ? '继续' : '暂停'}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<Stop />}
              onClick={handleStop}
            >
              停止
            </Button>
          </>
        )}
        
        <Button
          variant="outlined"
          startIcon={<Preview />}
          onClick={() => console.log('预览设置:', { batchSize, wordCount, encryptionMode, saveMode, saveFormat })}
        >
          预览设置
        </Button>
      </Box>

      {/* 进度显示 */}
      {(processing || results.length > 0) && (
        <Box className="progress-container" sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            处理进度
          </Typography>
          
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            sx={{ height: 8, borderRadius: 4, mb: 1 }}
          />
          
          <div className="progress-text">
            <Typography variant="body2">
              {Math.round(progress)}% ({results.length}/{batchSize})
            </Typography>
            <Typography variant="body2">
              {estimatedTime > 0 ? `预计剩余: ${estimatedTime}秒` : ''}
            </Typography>
          </div>
          
          {currentStep && (
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
              {paused ? '⏸️ 已暂停' : currentStep}
            </Typography>
          )}
        </Box>
      )}

      {/* 账号组展示 */}
      {results.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>账号组</Typography>
          {(() => {
            const groupSize = 10;
            const groups = [];
            for (let i = 0; i < results.length; i += groupSize) {
              groups.push(results.slice(i, i + groupSize));
            }
            return groups.map((group, idx) => (
              <Paper key={idx} variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle1">第 {idx + 1} 组（{idx * groupSize + 1} - {idx * groupSize + group.length}）</Typography>
                </Box>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 1.5
                  }}
                >
                  {group.map((acc) => (
                    <Paper key={acc.id} elevation={0} sx={{ p: 1.5, border: '1px solid #eee', borderRadius: 1 }}>
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>账号 {acc.id}</Typography>
                          <Typography variant="caption" color="textSecondary">{acc.wordCount} 词</Typography>
                          {acc.address && (
                            <Typography variant="caption" color="primary" display="block" sx={{ fontFamily: 'monospace' }}>
                              {formatAddress(acc.address, 6, 4)}
                            </Typography>
                          )}
                        </Box>
                        <Box>
                          <Tooltip title="导出助记词二维码">
                            <IconButton size="small" color="primary" onClick={() => handleShowQR(acc.mnemonic)}>
                              <QrCode fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {acc.address && (
                            <Tooltip title="导出地址二维码">
                              <IconButton size="small" color="secondary" onClick={() => handleShowAddressQR(acc.address)}>
                                <QrCode fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </Box>
                      <Typography variant="caption" sx={{ mt: 1, display: 'block', fontFamily: 'monospace' }}>
                        {typeof acc.mnemonic === 'string' ? acc.mnemonic.split(' ').slice(0, 4).join(' ') : ''} ...
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </Paper>
            ));
          })()}
        </Box>
      )}

      {/* 结果表格 */}
      {results.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              处理结果 ({results.length} 个)
            </Typography>
            <Box>
              <Button
                startIcon={<Download />}
                onClick={handleExportBatch}
                sx={{ mr: 1 }}
              >
                批量导出
              </Button>
              <Button
                startIcon={<Delete />}
                color="error"
                onClick={clearResults}
              >
                清空
              </Button>
            </Box>
          </Box>
          
          <TableContainer sx={{ maxHeight: 400, border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>序号</TableCell>
                  <TableCell>词数</TableCell>
                  <TableCell>EVM地址</TableCell>
                  <TableCell>加密数据</TableCell>
                  <TableCell>创建时间</TableCell>
                  <TableCell>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((result) => (
                  <TableRow key={result.id} hover>
                    <TableCell>{result.id}</TableCell>
                    <TableCell>
                      <Chip label={`${result.wordCount} 词`} size="small" />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace', fontSize: '12px' }}>
                      {result.address ? formatAddress(result.address, 6, 4) : '未生成'}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace', fontSize: '12px' }}>
                      {result.encryptedData.substring(0, 30)}...
                    </TableCell>
                    <TableCell sx={{ fontSize: '12px' }}>
                      {new Date(result.createdAt).toLocaleString('zh-CN')}
                    </TableCell>
                    <TableCell>
                      <Chip label="已完成" color="success" size="small" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="subtitle2">批量生成说明:</Typography>
        <Typography variant="body2">
          • 统一密码: 所有助记词使用相同密码加密，便于管理<br/>
          • 独立密码: 每个助记词使用不同密码，安全性更高<br/>
          • 生成过程中可以暂停和恢复，确保数据不丢失<br/>
          • 自动生成EVM地址，支持二维码导出<br/>
          • 建议单次处理不超过100个助记词以保证稳定性
        </Typography>
      </Alert>

      {/* 离线二维码生成器 */}
      <OfflineQRGenerator
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        data={qrData}
        title="助记词二维码"
      />

      {/* 地址二维码生成器 */}
      <OfflineQRGenerator
        open={addressQrOpen}
        onClose={() => setAddressQrOpen(false)}
        data={addressQrData}
        title="EVM地址二维码"
      />
    </Paper>
  );
};

export default BatchProcessor;
