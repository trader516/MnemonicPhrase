/**
 * 助记词地址验证组件
 * 验证助记词生成的ETH地址是否一致
 */

import React, { useState } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  VerifiedUser,
  Error,
  CheckCircle,
  Cancel,
  Refresh
} from '@mui/icons-material';
import { validateAddressConsistency, validateAddressUniqueness, generateEthereumAddress } from '../utils/evmUtils';

const AddressValidator = () => {
  const [mnemonic, setMnemonic] = useState('');
  const [mnemonicList, setMnemonicList] = useState('');
  const [testCount, setTestCount] = useState(5);
  const [validating, setValidating] = useState(false);
  const [singleResult, setSingleResult] = useState(null);
  const [batchResult, setBatchResult] = useState(null);
  const [mode, setMode] = useState('single'); // single | batch

  // 单个助记词验证
  const handleSingleValidation = async () => {
    if (!mnemonic.trim()) {
      alert('请输入助记词');
      return;
    }

    setValidating(true);
    try {
      const result = validateAddressConsistency(mnemonic.trim(), testCount);
      setSingleResult(result);
      setBatchResult(null);
    } catch (error) {
      console.error('验证失败:', error);
      alert('验证失败：' + error.message);
    } finally {
      setValidating(false);
    }
  };

  // 批量助记词验证
  const handleBatchValidation = async () => {
    const mnemonics = mnemonicList
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (mnemonics.length === 0) {
      alert('请输入助记词列表（每行一个）');
      return;
    }

    if (mnemonics.length > 50) {
      alert('批量验证最多支持50个助记词');
      return;
    }

    setValidating(true);
    try {
      // 验证地址唯一性
      const uniquenessResult = validateAddressUniqueness(mnemonics);

      // 为每个助记词生成详细信息
      const detailedResults = mnemonics.map((mnemonic, index) => {
        try {
          const addressInfo = generateEthereumAddress(mnemonic);
          const consistencyResult = validateAddressConsistency(mnemonic, 3); // 减少测试次数提高性能

          return {
            id: index + 1,
            mnemonic: mnemonic,
            address: addressInfo.address,
            isValid: consistencyResult.isConsistent,
            error: null
          };
        } catch (error) {
          return {
            id: index + 1,
            mnemonic: mnemonic,
            address: null,
            isValid: false,
            error: error.message
          };
        }
      });

      setBatchResult({
        uniqueness: uniquenessResult,
        details: detailedResults,
        summary: {
          total: mnemonics.length,
          valid: detailedResults.filter(r => r.isValid).length,
          invalid: detailedResults.filter(r => !r.isValid).length
        }
      });
      setSingleResult(null);
    } catch (error) {
      console.error('批量验证失败:', error);
      alert('批量验证失败：' + error.message);
    } finally {
      setValidating(false);
    }
  };

  const clearResults = () => {
    setSingleResult(null);
    setBatchResult(null);
  };

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        🔍 助记词地址验证
      </Typography>

      <Typography variant="body2" color="textSecondary" paragraph>
        验证助记词生成的ETH地址是否一致，确保助记词的正确性和地址的唯一性
      </Typography>

      {/* 模式选择 */}
      <Box sx={{ mb: 3 }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>验证模式</InputLabel>
          <Select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              clearResults();
            }}
            label="验证模式"
          >
            <MenuItem value="single">单个验证</MenuItem>
            <MenuItem value="batch">批量验证</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {mode === 'single' ? (
        // 单个验证模式
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="输入助记词"
            placeholder="输入要验证的助记词（用空格分隔）"
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            sx={{ mb: 2 }}
          />

          <Box display="flex" alignItems="center" gap={2} sx={{ mb: 2 }}>
            <FormControl sx={{ minWidth: 120 }}>
              <InputLabel>测试次数</InputLabel>
              <Select
                value={testCount}
                onChange={(e) => setTestCount(e.target.value)}
                label="测试次数"
              >
                <MenuItem value={3}>3次</MenuItem>
                <MenuItem value={5}>5次</MenuItem>
                <MenuItem value={10}>10次</MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={validating ? <CircularProgress size={20} /> : <VerifiedUser />}
              onClick={handleSingleValidation}
              disabled={validating}
            >
              {validating ? '验证中...' : '开始验证'}
            </Button>

            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={clearResults}
            >
              清空结果
            </Button>
          </Box>
        </Box>
      ) : (
        // 批量验证模式
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={8}
            label="输入助记词列表"
            placeholder="每行输入一个助记词，最多50个"
            value={mnemonicList}
            onChange={(e) => setMnemonicList(e.target.value)}
            sx={{ mb: 2 }}
            helperText="每行一个助记词，系统将验证地址生成一致性和唯一性"
          />

          <Box display="flex" alignItems="center" gap={2} sx={{ mb: 2 }}>
            <Button
              variant="contained"
              startIcon={validating ? <CircularProgress size={20} /> : <VerifiedUser />}
              onClick={handleBatchValidation}
              disabled={validating}
            >
              {validating ? '验证中...' : '批量验证'}
            </Button>

            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={clearResults}
            >
              清空结果
            </Button>
          </Box>
        </Box>
      )}

      {/* 单个验证结果 */}
      {singleResult && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>验证结果</Typography>

          <Alert
            severity={singleResult.isConsistent ? 'success' : 'error'}
            icon={singleResult.isConsistent ? <CheckCircle /> : <Error />}
            sx={{ mb: 2 }}
          >
            <Typography variant="subtitle2">
              {singleResult.message}
            </Typography>
            {singleResult.firstAddress && (
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 1 }}>
                生成的地址: {singleResult.firstAddress}
              </Typography>
            )}
          </Alert>

          {singleResult.testResults && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>测试轮次</TableCell>
                    <TableCell>生成的地址</TableCell>
                    <TableCell>一致性</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {singleResult.testResults.map((test) => (
                    <TableRow key={test.attempt}>
                      <TableCell>第 {test.attempt} 次</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                        {test.address}
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={test.matches ? <CheckCircle /> : <Cancel />}
                          label={test.matches ? '一致' : '不一致'}
                          color={test.matches ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* 批量验证结果 */}
      {batchResult && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>批量验证结果</Typography>

          {/* 汇总信息 */}
          <Box display="flex" gap={2} sx={{ mb: 2 }}>
            <Chip label={`总计: ${batchResult.summary.total}`} color="default" />
            <Chip label={`有效: ${batchResult.summary.valid}`} color="success" />
            <Chip label={`无效: ${batchResult.summary.invalid}`} color="error" />
          </Box>

          {/* 唯一性检查结果 */}
          <Alert
            severity={batchResult.uniqueness.isUnique ? 'success' : 'warning'}
            sx={{ mb: 2 }}
          >
            <Typography variant="subtitle2">
              地址唯一性: {batchResult.uniqueness.message}
            </Typography>
            {batchResult.uniqueness.duplicates.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2">重复地址详情:</Typography>
                {batchResult.uniqueness.duplicates.map((dup, index) => (
                  <Typography key={index} variant="caption" display="block" sx={{ fontFamily: 'monospace' }}>
                    {dup.address}
                  </Typography>
                ))}
              </Box>
            )}
          </Alert>

          {/* 详细结果表格 */}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>序号</TableCell>
                  <TableCell>助记词</TableCell>
                  <TableCell>生成的地址</TableCell>
                  <TableCell>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {batchResult.details.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.mnemonic.split(' ').slice(0, 4).join(' ')}...
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {item.address || '生成失败'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={item.isValid ? <CheckCircle /> : <Error />}
                        label={item.isValid ? '有效' : (item.error || '无效')}
                        color={item.isValid ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="subtitle2">验证说明:</Typography>
        <Typography variant="body2">
          • 一致性验证: 确保同一助记词多次生成相同地址<br/>
          • 唯一性验证: 确保不同助记词生成不同地址<br/>
          • 使用标准HD钱包路径: m/44'/60'/0'/0/0<br/>
          • 所有验证都在本地完成，不会上传任何数据
        </Typography>
      </Alert>
    </Paper>
  );
};

export default AddressValidator;