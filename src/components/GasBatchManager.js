import React, { useMemo, useState } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  IconButton,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Tooltip
} from '@mui/material';
import { QrCode } from '@mui/icons-material';
import { ethers } from 'ethers';
import { decryptMnemonic } from '../utils/cryptoUtilsGUI';
import OfflineQRGenerator from './OfflineQRGenerator';
import {
  DEFAULT_ETH_PATH,
  generateEthereumAddress,
  getSupportedNetworks,
  isValidEthereumAddress,
  formatAddress
} from '../utils/evmUtils';

const FALLBACK_PRIORITY_FEE_GWEI = '0.05';

const normalizeHeader = (value) => {
  if (!value) return '';
  return value.toString().replace(/^"|"$/g, '').trim().toLowerCase();
};

const parseCsv = (text) => {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(current);
      const hasContent = row.some((cell) => cell.trim() !== '');
      if (hasContent) {
        rows.push(row);
      }
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    const hasContent = row.some((cell) => cell.trim() !== '');
    if (hasContent) {
      rows.push(row);
    }
  }

  return rows;
};

const detectHeaderMap = (headerRow) => {
  const map = {};
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (!key) return;
    map[key] = index;
  });
  return map;
};

const getColumnIndex = (headerMap, candidates, fallbackIndex) => {
  for (const key of candidates) {
    if (headerMap[key] !== undefined) {
      return headerMap[key];
    }
  }
  return fallbackIndex;
};

const parseEncryptedCsv = (text) => {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { items: [], warnings: ['CSV 文件为空'] };
  }

  const headerMap = detectHeaderMap(rows[0]);
  const headerKeys = Object.keys(headerMap);
  const hasHeader = headerKeys.some((key) =>
    key.includes('加密') || key.includes('encrypted') || key.includes('evm') || key.includes('地址')
  );

  const startIndex = hasHeader ? 1 : 0;
  const encryptedIndex = hasHeader
    ? getColumnIndex(headerMap, ['加密数据', 'encrypteddata', 'encrypted', 'ciphertext'], 0)
    : 0;
  const addressIndex = hasHeader
    ? getColumnIndex(headerMap, ['evm地址', 'address', '钱包地址', 'addr'], 1)
    : 1;
  const privateKeyIndex = hasHeader
    ? getColumnIndex(headerMap, ['私钥', 'privatekey', 'private key'], -1)
    : -1;

  const items = [];
  const warnings = [];

  for (let i = startIndex; i < rows.length; i += 1) {
    const row = rows[i];
    const encryptedDataRaw = row[encryptedIndex] || '';
    const encryptedData = encryptedDataRaw.trim().replace(/^"|"$/g, '');
    const addressRaw = row[addressIndex] || '';
    const address = addressRaw.trim().replace(/^"|"$/g, '');
    const privateKeyRaw = privateKeyIndex >= 0 ? row[privateKeyIndex] : '';
    const privateKey = privateKeyRaw ? privateKeyRaw.trim().replace(/^"|"$/g, '') : '';

    if (!encryptedData && !privateKey) {
      continue;
    }

    items.push({
      id: i + 1 - startIndex,
      encryptedData,
      address,
      privateKey
    });
  }

  if (items.length === 0) {
    warnings.push('未能从CSV解析出加密数据');
  }

  return { items, warnings };
};

const guessSecretType = (value) => {
  const trimmed = value.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 12) {
    return 'mnemonic';
  }
  if (trimmed.startsWith('0x') && trimmed.length >= 64) {
    return 'privateKey';
  }
  if (!trimmed.startsWith('0x') && trimmed.length >= 64) {
    return 'privateKey';
  }
  return 'unknown';
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const GasBatchManager = () => {
  const networks = useMemo(
    () => getSupportedNetworks().filter((network) => network.name.includes('Base')),
    []
  );
  const defaultRpcUrl = process.env.REACT_APP_DEFAULT_RPC_URL || '';
  const defaultProxyUrl = process.env.REACT_APP_DEFAULT_PROXY_URL || 'http://localhost:8787';
  const defaultUseProxy =
    (process.env.REACT_APP_DEFAULT_USE_PROXY || '').toLowerCase() === 'true';
  const backendEnvValue = process.env.REACT_APP_BACKEND_URL;
  const defaultBackendUrl =
    backendEnvValue ||
    (process.env.NODE_ENV === 'production'
      ? typeof window !== 'undefined'
        ? window.location.origin
        : ''
      : 'http://localhost:8788');
  const backendSenderEnv = process.env.REACT_APP_USE_BACKEND_SENDER;
  const defaultUseBackend =
    backendSenderEnv && backendSenderEnv.length > 0
      ? backendSenderEnv.toLowerCase() === 'true'
      : process.env.NODE_ENV === 'production';

  const [selectedNetwork, setSelectedNetwork] = useState(networks[0]);
  const [rpcUrl, setRpcUrl] = useState(defaultRpcUrl);
  const [useProxy, setUseProxy] = useState(defaultUseProxy);
  const [proxyUrl, setProxyUrl] = useState(defaultProxyUrl);
  const [useBackendSender, setUseBackendSender] = useState(defaultUseBackend);
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);

  const [csvName, setCsvName] = useState('');
  const [csvWarnings, setCsvWarnings] = useState([]);
  const [encryptedItems, setEncryptedItems] = useState([]);
  const [decryptPassword, setDecryptPassword] = useState('');
  const [decrypting, setDecrypting] = useState(false);
  const [decryptProgress, setDecryptProgress] = useState(0);
  const [decryptedItems, setDecryptedItems] = useState([]);
  const [decryptErrors, setDecryptErrors] = useState([]);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState('');
  const [qrTitle, setQrTitle] = useState('');

  const [selectedIds, setSelectedIds] = useState([]);
  const [manualRecipients, setManualRecipients] = useState('');

  const [fundingSecret, setFundingSecret] = useState('');
  const [fundingPath, setFundingPath] = useState(DEFAULT_ETH_PATH);
  const [sendAmount, setSendAmount] = useState('0.00003');
  const [sendDelayMs, setSendDelayMs] = useState(400);
  const [sending, setSending] = useState(false);
  const [sendLogs, setSendLogs] = useState([]);
  const [waitConfirm, setWaitConfirm] = useState(false);

  const [reclaimAddress, setReclaimAddress] = useState('');
  const [reclaimReserve, setReclaimReserve] = useState('0.0000001');
  const [reclaimDelayMs, setReclaimDelayMs] = useState(400);
  const [reclaiming, setReclaiming] = useState(false);
  const [reclaimLogs, setReclaimLogs] = useState([]);
  const [reclaimWaitConfirm, setReclaimWaitConfirm] = useState(false);

  const effectiveRpcUrl = useProxy ? proxyUrl : rpcUrl;

  const parsedRecipients = useMemo(() => {
    return manualRecipients
      .split(/\n|,|;/)
      .map((addr) => addr.trim())
      .filter(Boolean);
  }, [manualRecipients]);

  const validManualRecipients = parsedRecipients.filter(isValidEthereumAddress);
  const invalidManualRecipients = parsedRecipients.filter(
    (addr) => addr && !isValidEthereumAddress(addr)
  );

  const selectedAccounts = decryptedItems.filter((item) => selectedIds.includes(item.id));

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { items, warnings } = parseEncryptedCsv(text);

    setCsvName(file.name);
    setEncryptedItems(items);
    setCsvWarnings(warnings);
    setDecryptErrors([]);
    setDecryptedItems([]);
    setSelectedIds([]);
    setDecryptProgress(0);
  };

  const handleShowMnemonicQR = (mnemonic) => {
    if (!mnemonic) return;
    setQrTitle('助记词二维码');
    setQrData(mnemonic);
    setQrOpen(true);
  };

  const handleShowAddressQR = (address) => {
    if (!address) return;
    setQrTitle('EVM地址二维码');
    setQrData(address);
    setQrOpen(true);
  };

  const handleDecrypt = async () => {
    if (!decryptPassword) {
      setDecryptErrors(['请输入解密密码']);
      return;
    }
    if (encryptedItems.length === 0) {
      setDecryptErrors(['请先上传CSV文件']);
      return;
    }

    setDecrypting(true);
    setDecryptErrors([]);
    setDecryptProgress(0);

    const results = [];
    const errors = [];

    for (let i = 0; i < encryptedItems.length; i += 1) {
      const item = encryptedItems[i];
      try {
        let mnemonic = '';
        if (item.encryptedData) {
          mnemonic = await decryptMnemonic(item.encryptedData, decryptPassword);
        } else if (item.privateKey) {
          mnemonic = '';
        }

        let addressInfo = null;
        if (mnemonic) {
          addressInfo = generateEthereumAddress(mnemonic, DEFAULT_ETH_PATH);
        } else if (item.privateKey) {
          const wallet = new ethers.Wallet(item.privateKey);
          addressInfo = {
            address: wallet.address,
            privateKey: wallet.privateKey
          };
        }

        results.push({
          id: item.id,
          encryptedData: item.encryptedData,
          address: addressInfo?.address || item.address,
          sourceAddress: item.address,
          mnemonic,
          privateKey: addressInfo?.privateKey || item.privateKey,
          mismatch: item.address && addressInfo?.address && item.address !== addressInfo.address
        });
      } catch (error) {
        errors.push(`第 ${item.id} 行解密失败: ${error.message}`);
      }

      setDecryptProgress(Math.round(((i + 1) / encryptedItems.length) * 100));
    }

    setDecryptedItems(results);
    setSelectedIds(results.map((item) => item.id));
    setDecryptErrors(errors);
    setDecrypting(false);
  };

  const toggleAllSelection = (checked) => {
    if (checked) {
      setSelectedIds(decryptedItems.map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const getProvider = () => {
    const request = new ethers.FetchRequest(effectiveRpcUrl);
    request.setHeader('Content-Type', 'application/json');
    request.setHeader('Accept', 'application/json');
    if (useProxy) {
      request.setHeader('X-RPC-Target', rpcUrl);
    }
    return new ethers.JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
  };

  const fetchJson = async (url, payload) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
    return response.json();
  };

  const isNonceError = (error) => {
    const message = error?.message || '';
    return error?.code === 'NONCE_EXPIRED' || /nonce too low|already been used/i.test(message);
  };

  const isInFlightLimitError = (error) => {
    const message = error?.message || '';
    return /in-flight transaction limit/i.test(message);
  };

  const describeRpcError = (error) => {
    const message = error?.message || String(error);
    if (message.includes('Failed to fetch')) {
      if (useBackendSender) {
        return '后端服务无法访问，请确认 tx-server 已启动且地址正确。';
      }
      return 'RPC 请求被浏览器拦截（可能是 CORS），请启用本地代理或更换支持跨域的 RPC。';
    }
    if (message.includes('Not a correct jsonrpc format request')) {
      return 'RPC 返回格式错误，可能请求体未按 JSON-RPC 发送。建议启用本地代理或更换 RPC。';
    }
    return message;
  };

  const resolveFundingWallet = () => {
    const trimmed = fundingSecret.trim();
    const type = guessSecretType(trimmed);
    if (type === 'mnemonic') {
      return ethers.Wallet.fromPhrase(trimmed, undefined, fundingPath);
    }
    if (type === 'privateKey') {
      const key = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
      return new ethers.Wallet(key);
    }
    throw new Error('资金账户输入无效，请输入私钥或助记词');
  };

  const getFeeOptions = async (provider) => {
    const feeData = await provider.getFeeData();
    const fallbackPriority = ethers.parseUnits(FALLBACK_PRIORITY_FEE_GWEI, 'gwei');
    return {
      maxFeePerGas: feeData.maxFeePerGas || feeData.gasPrice || fallbackPriority,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || fallbackPriority
    };
  };

  const handleBatchSend = async () => {
    if (sending) return;
    if (!fundingSecret.trim()) {
      setSendLogs((prev) => [...prev, '❌ 请输入资金账户私钥或助记词']);
      return;
    }
    if (!rpcUrl.trim()) {
      setSendLogs((prev) => [...prev, '❌ 请输入 RPC 地址']);
      return;
    }
    if (selectedAccounts.length === 0 && validManualRecipients.length === 0) {
      setSendLogs((prev) => [...prev, '❌ 请至少选择一个收款地址']);
      return;
    }

    let amountWei;
    try {
      amountWei = ethers.parseEther(sendAmount);
    } catch (error) {
      setSendLogs((prev) => [...prev, '❌ 转账数量无效']);
      return;
    }

    setSending(true);
    setSendLogs([]);

    try {
      const recipients = [
        ...selectedAccounts.map((item) => item.address).filter(isValidEthereumAddress),
        ...validManualRecipients
      ];
      if (useBackendSender) {
        const payload = {
          rpcUrl,
          recipients,
          amountEth: sendAmount,
          fundingSecret,
          fundingPath,
          waitConfirm,
          delayMs: sendDelayMs
        };
        const result = await fetchJson(`${backendUrl}/api/send-batch`, payload);
        result.logs.forEach((log) => setSendLogs((prev) => [...prev, log]));
      } else {
        const provider = getProvider();
        const wallet = resolveFundingWallet().connect(provider);
        const feeOptions = await getFeeOptions(provider);
        let nextNonce = await provider.getTransactionCount(wallet.address, 'pending');
        let lastSubmittedHash = null;

        for (let i = 0; i < recipients.length; i += 1) {
          const to = recipients[i];
          const label = `${i + 1}/${recipients.length} ${formatAddress(to, 6, 4)}`;
          try {
            const tx = await wallet.sendTransaction({
              to,
              value: amountWei,
              gasLimit: 21000,
              ...feeOptions,
              nonce: nextNonce
            });
            nextNonce += 1;
            lastSubmittedHash = tx.hash;
            setSendLogs((prev) => [...prev, `✅ 已提交 ${label} → ${tx.hash}`]);
            if (waitConfirm) {
              await tx.wait(1);
              setSendLogs((prev) => [...prev, `✅ 已确认 ${label}`]);
            }
          } catch (error) {
            if (isNonceError(error)) {
              try {
                nextNonce = await provider.getTransactionCount(wallet.address, 'pending');
                const retryTx = await wallet.sendTransaction({
                  to,
                  value: amountWei,
                  gasLimit: 21000,
                  ...feeOptions,
                  nonce: nextNonce
                });
                nextNonce += 1;
                lastSubmittedHash = retryTx.hash;
                setSendLogs((prev) => [...prev, `✅ 已重试提交 ${label} → ${retryTx.hash}`]);
                if (waitConfirm) {
                  await retryTx.wait(1);
                  setSendLogs((prev) => [...prev, `✅ 已确认 ${label}`]);
                }
              } catch (retryError) {
                setSendLogs((prev) => [
                  ...prev,
                  `❌ 发送失败 ${label}: ${retryError.message}`
                ]);
              }
            } else if (isInFlightLimitError(error)) {
              try {
                setSendLogs((prev) => [
                  ...prev,
                  `⏳ 节点限制未确认交易数量，等待确认后重试 ${label}`
                ]);
                if (lastSubmittedHash) {
                  await provider.waitForTransaction(lastSubmittedHash, 1);
                } else {
                  await delay(Math.max(sendDelayMs, 2000));
                }
                nextNonce = await provider.getTransactionCount(wallet.address, 'pending');
                const retryTx = await wallet.sendTransaction({
                  to,
                  value: amountWei,
                  gasLimit: 21000,
                  ...feeOptions,
                  nonce: nextNonce
                });
                nextNonce += 1;
                lastSubmittedHash = retryTx.hash;
                setSendLogs((prev) => [...prev, `✅ 已重试提交 ${label} → ${retryTx.hash}`]);
                if (waitConfirm) {
                  await retryTx.wait(1);
                  setSendLogs((prev) => [...prev, `✅ 已确认 ${label}`]);
                }
              } catch (retryError) {
                setSendLogs((prev) => [
                  ...prev,
                  `❌ 发送失败 ${label}: ${retryError.message}`
                ]);
              }
            } else {
              setSendLogs((prev) => [...prev, `❌ 发送失败 ${label}: ${error.message}`]);
            }
          }

          if (i < recipients.length - 1) {
            await delay(sendDelayMs);
          }
        }
      }
    } catch (error) {
      setSendLogs((prev) => [...prev, `❌ 发送流程失败: ${describeRpcError(error)}`]);
    } finally {
      setSending(false);
    }
  };

  const handleBatchReclaim = async () => {
    if (reclaiming) return;
    if (!isValidEthereumAddress(reclaimAddress)) {
      setReclaimLogs((prev) => [...prev, '❌ 请输入有效的主账号地址']);
      return;
    }
    if (!rpcUrl.trim()) {
      setReclaimLogs((prev) => [...prev, '❌ 请输入 RPC 地址']);
      return;
    }
    if (selectedAccounts.length === 0) {
      setReclaimLogs((prev) => [...prev, '❌ 请至少选择一个回收账号']);
      return;
    }

    let reserveWei;
    try {
      reserveWei = ethers.parseEther(reclaimReserve);
    } catch (error) {
      setReclaimLogs((prev) => [...prev, '❌ 预留手续费无效']);
      return;
    }

    setReclaiming(true);
    setReclaimLogs([]);

    try {
      if (useBackendSender) {
        const payload = {
          rpcUrl,
          reclaimAddress,
          reserveEth: reclaimReserve,
          waitConfirm: reclaimWaitConfirm,
          delayMs: reclaimDelayMs,
          entries: selectedAccounts.map((account) => ({
            address: account.address,
            privateKey: account.privateKey || ''
          }))
        };
        const result = await fetchJson(`${backendUrl}/api/reclaim-batch`, payload);
        result.logs.forEach((log) => setReclaimLogs((prev) => [...prev, log]));
      } else {
        const provider = getProvider();
        const feeOptions = await getFeeOptions(provider);
        const gasCost = feeOptions.maxFeePerGas * 21000n;

        for (let i = 0; i < selectedAccounts.length; i += 1) {
          const account = selectedAccounts[i];
          const label = `${i + 1}/${selectedAccounts.length} ${formatAddress(account.address, 6, 4)}`;

          if (!account.privateKey) {
            setReclaimLogs((prev) => [...prev, `⚠️ 无私钥，跳过 ${label}`]);
            continue;
          }

          try {
            const wallet = new ethers.Wallet(account.privateKey).connect(provider);
            const nonce = await provider.getTransactionCount(wallet.address, 'pending');
            const balance = await provider.getBalance(wallet.address);
            const sendable = balance - reserveWei - gasCost;

            if (sendable <= 0n) {
              setReclaimLogs((prev) => [...prev, `⚠️ 余额不足，跳过 ${label}`]);
              continue;
            }

            const tx = await wallet.sendTransaction({
              to: reclaimAddress,
              value: sendable,
              gasLimit: 21000,
              ...feeOptions,
              nonce
            });
            setReclaimLogs((prev) => [...prev, `✅ 已提交 ${label} → ${tx.hash}`]);
            if (reclaimWaitConfirm) {
              await tx.wait(1);
              setReclaimLogs((prev) => [...prev, `✅ 已确认 ${label}`]);
            }
          } catch (error) {
            setReclaimLogs((prev) => [...prev, `❌ 回收失败 ${label}: ${error.message}`]);
          }

          if (i < selectedAccounts.length - 1) {
            await delay(reclaimDelayMs);
          }
        }
      }
    } catch (error) {
      setReclaimLogs((prev) => [...prev, `❌ 回收流程失败: ${describeRpcError(error)}`]);
    } finally {
      setReclaiming(false);
    }
  };

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        ⛽ Base 批量 Gas 工具
      </Typography>
      <Typography variant="body2" color="textSecondary" paragraph>
        上传加密CSV并输入密码进行批量解密，随后在 Base 链上批量发送或回收 ETH。解密结果仅保存在内存中。
      </Typography>

      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          1. 上传加密 CSV
        </Typography>
        <Box className="file-drop-zone" sx={{ mb: 2 }}>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <label htmlFor="csv-upload">
            <Button variant="outlined" component="span">
              选择 CSV 文件
            </Button>
          </label>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {csvName ? `已载入: ${csvName}` : '支持加密数据导出的 CSV 格式'}
          </Typography>
        </Box>
        {csvWarnings.map((warning) => (
          <Alert key={warning} severity="warning" sx={{ mb: 1 }}>
            {warning}
          </Alert>
        ))}
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          2. 批量解密
        </Typography>
        <TextField
          fullWidth
          label="解密密码"
          type="password"
          value={decryptPassword}
          onChange={(event) => setDecryptPassword(event.target.value)}
          sx={{ mb: 2 }}
        />
        <Button variant="contained" onClick={handleDecrypt} disabled={decrypting}>
          {decrypting ? '解密中...' : '开始解密'}
        </Button>
        {decrypting && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="determinate" value={decryptProgress} />
            <Typography variant="body2" sx={{ mt: 1 }}>
              {decryptProgress}%
            </Typography>
          </Box>
        )}
        {decryptErrors.length > 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {decryptErrors.join(' | ')}
          </Alert>
        )}
      </Box>

      {decryptedItems.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1">解密结果 ({decryptedItems.length} 条)</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={showMnemonic}
                  onChange={(event) => setShowMnemonic(event.target.checked)}
                />
              }
              label="显示助记词"
            />
          </Box>
          <TableContainer sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedIds.length > 0 && selectedIds.length === decryptedItems.length}
                      onChange={(event) => toggleAllSelection(event.target.checked)}
                    />
                  </TableCell>
                  <TableCell>地址</TableCell>
                  <TableCell>助记词</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>二维码</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {decryptedItems.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelection(item.id)}
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {item.address ? formatAddress(item.address, 6, 4) : '未知'}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {showMnemonic
                        ? item.mnemonic || '—'
                        : item.mnemonic
                        ? `${item.mnemonic.split(' ').slice(0, 3).join(' ')} ...`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {item.mismatch ? (
                        <Chip size="small" label="地址不一致" color="warning" />
                      ) : (
                        <Chip size="small" label="已解密" color="success" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <Tooltip title={item.mnemonic ? '助记词二维码' : '无助记词'}>
                          <span>
                            <IconButton
                              size="small"
                              color="primary"
                              disabled={!item.mnemonic}
                              onClick={() => handleShowMnemonicQR(item.mnemonic)}
                            >
                              <QrCode fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={item.address ? '地址二维码' : '无地址'}>
                          <span>
                            <IconButton
                              size="small"
                              color="secondary"
                              disabled={!item.address}
                              onClick={() => handleShowAddressQR(item.address)}
                            >
                              <QrCode fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          3. Base 链配置
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 2 }}>
          <FormControl fullWidth>
            <InputLabel>网络</InputLabel>
            <Select
              value={selectedNetwork?.name || ''}
              label="网络"
              onChange={(event) => {
                const next = networks.find((net) => net.name === event.target.value);
                if (next) {
                  setSelectedNetwork(next);
                  setRpcUrl(next.rpcUrl);
                }
              }}
            >
              {networks.map((network) => (
                <MenuItem key={network.name} value={network.name}>
                  {network.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="RPC 地址"
            value={rpcUrl}
            onChange={(event) => setRpcUrl(event.target.value)}
            helperText="请输入你的 RPC 地址"
          />
          <TextField
            fullWidth
            label="本地代理地址"
            value={proxyUrl}
            onChange={(event) => setProxyUrl(event.target.value)}
            helperText={useBackendSender ? '后端模式下无需代理' : '开启代理时生效，例如 http://localhost:8787'}
            disabled={useBackendSender}
          />
          <TextField
            fullWidth
            label="后端服务地址"
            value={backendUrl}
            onChange={(event) => setBackendUrl(event.target.value)}
            helperText="后端发送时使用，例如 http://localhost:8788"
          />
        </Box>
        <FormControlLabel
          sx={{ mt: 1 }}
          control={
            <Switch
              checked={useProxy}
              onChange={(event) => setUseProxy(event.target.checked)}
              disabled={useBackendSender}
            />
          }
          label="启用本地 RPC 代理（解决浏览器 CORS）"
        />
        <FormControlLabel
          sx={{ mt: 1 }}
          control={
            <Switch
              checked={useBackendSender}
              onChange={(event) => setUseBackendSender(event.target.checked)}
            />
          }
          label="使用后端发送交易（推荐）"
        />
        {useProxy && (
          <Alert severity="info" sx={{ mt: 1 }}>
            本地代理需要单独运行：`npm run rpc-proxy`。代理会把请求转发到当前 RPC 地址。
          </Alert>
        )}
        {useBackendSender && (
          <Alert severity="info" sx={{ mt: 1 }}>
            后端服务需要单独运行：`npm run tx-server`。交易将使用你在页面输入的私钥/助记词签名。
          </Alert>
        )}
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          4. 批量发送 Gas
        </Typography>
        <TextField
          fullWidth
          label="资金账户私钥或助记词"
          placeholder="用于统一转账的主钱包"
          value={fundingSecret}
          onChange={(event) => setFundingSecret(event.target.value)}
          helperText={useBackendSender ? '将发送到后端用于签名' : ''}
          sx={{ mb: 2 }}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2, mb: 2 }}>
          <TextField
            label="助记词派生路径"
            value={fundingPath}
            onChange={(event) => setFundingPath(event.target.value)}
          />
          <TextField
            label="每个地址发送数量 (ETH)"
            value={sendAmount}
            onChange={(event) => setSendAmount(event.target.value)}
          />
          <TextField
            label="发送间隔 (ms)"
            value={sendDelayMs}
            onChange={(event) => setSendDelayMs(Number(event.target.value) || 0)}
          />
        </Box>
        <TextField
          fullWidth
          label="附加收款地址（可选，多行/逗号分隔）"
          value={manualRecipients}
          onChange={(event) => setManualRecipients(event.target.value)}
          sx={{ mb: 2 }}
        />
        {invalidManualRecipients.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            无效地址: {invalidManualRecipients.join(', ')}
          </Alert>
        )}
        <FormControlLabel
          control={
            <Switch checked={waitConfirm} onChange={(event) => setWaitConfirm(event.target.checked)} />
          }
          label="等待确认"
        />
        <Box sx={{ mt: 1 }}>
          <Button variant="contained" onClick={handleBatchSend} disabled={sending}>
            {sending ? '发送中...' : '开始批量发送'}
          </Button>
        </Box>
        {sendLogs.length > 0 && (
          <Box sx={{ mt: 2 }}>
            {sendLogs.map((log, index) => (
              <Typography key={`${log}-${index}`} variant="body2">
                {log}
              </Typography>
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          5. 批量回收 Gas
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2, mb: 2 }}>
          <TextField
            label="主账号回收地址"
            value={reclaimAddress}
            onChange={(event) => setReclaimAddress(event.target.value)}
            helperText={useBackendSender ? '后端模式下仍需填写' : ''}
          />
          <TextField
            label="预留手续费 (ETH)"
            value={reclaimReserve}
            onChange={(event) => setReclaimReserve(event.target.value)}
          />
          <TextField
            label="回收间隔 (ms)"
            value={reclaimDelayMs}
            onChange={(event) => setReclaimDelayMs(Number(event.target.value) || 0)}
          />
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={reclaimWaitConfirm}
              onChange={(event) => setReclaimWaitConfirm(event.target.checked)}
            />
          }
          label="等待确认"
        />
        <Box sx={{ mt: 1 }}>
          <Button variant="contained" onClick={handleBatchReclaim} disabled={reclaiming}>
            {reclaiming ? '回收中...' : '开始批量回收'}
          </Button>
        </Box>
        {reclaimLogs.length > 0 && (
          <Box sx={{ mt: 2 }}>
            {reclaimLogs.map((log, index) => (
              <Typography key={`${log}-${index}`} variant="body2">
                {log}
              </Typography>
            ))}
          </Box>
        )}
      </Box>

      <Alert severity="info">
        发送与回收操作会直接调用 Base RPC；请确保 RPC 可用并在发送前核对地址与金额。
      </Alert>

      <OfflineQRGenerator
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        data={qrData}
        title={qrTitle}
      />
    </Paper>
  );
};

export default GasBatchManager;
