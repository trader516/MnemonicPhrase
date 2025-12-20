const http = require('http');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const loadEnvFile = (filepath) => {
  if (!fs.existsSync(filepath)) {
    return;
  }
  const content = fs.readFileSync(filepath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const index = trimmed.indexOf('=');
    if (index === -1) {
      return;
    }
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnvFile(path.resolve(process.cwd(), '.env.server'));

const PORT = Number(process.env.TX_SERVER_PORT || 8788);
const FUNDING_PATH = process.env.TX_SERVER_MNEMONIC_PATH || "m/44'/60'/0'/0/0";
const FALLBACK_PRIORITY_FEE_GWEI = '0.05';
const GAS_LIMIT_FALLBACK = 60000n;

const parseJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });

const sendCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const resolveFundingWallet = (secret, path) => {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error('fundingSecret is required');
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 12) {
    return ethers.Wallet.fromPhrase(trimmed, undefined, path || FUNDING_PATH);
  }
  const key = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return new ethers.Wallet(key);
};

const getProvider = (rpcUrl) => {
  return new ethers.JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 });
};

const getFeeOptions = async (provider) => {
  const feeData = await provider.getFeeData();
  const fallbackPriority = ethers.parseUnits(FALLBACK_PRIORITY_FEE_GWEI, 'gwei');
  return {
    maxFeePerGas: feeData.maxFeePerGas || feeData.gasPrice || fallbackPriority,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || fallbackPriority
  };
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isNonceError = (error) => {
  const message = error?.message || '';
  return error?.code === 'NONCE_EXPIRED' || /nonce too low|already been used/i.test(message);
};

const isInFlightLimitError = (error) => {
  const message = error?.message || '';
  return /in-flight transaction limit/i.test(message);
};

const addGasBuffer = (gasLimit) => {
  if (gasLimit <= 0n) return gasLimit;
  return gasLimit + gasLimit / 5n;
};

const estimateGasLimit = async (provider, tx, fallback = GAS_LIMIT_FALLBACK) => {
  try {
    const estimate = await provider.estimateGas(tx);
    return addGasBuffer(estimate);
  } catch (error) {
    return fallback;
  }
};

const handleSendBatch = async (payload) => {
  const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
  const amountEth = payload.amountEth;
  const delayMs = Number(payload.delayMs || 0);
  const waitConfirm = Boolean(payload.waitConfirm);
  const rpcUrl = payload.rpcUrl;
  const fundingSecret = payload.fundingSecret;
  const fundingPath = payload.fundingPath || FUNDING_PATH;

  if (!recipients.length) {
    throw new Error('recipients is required');
  }
  if (!rpcUrl) {
    throw new Error('rpcUrl is required');
  }
  if (!fundingSecret) {
    throw new Error('fundingSecret is required');
  }
  if (!amountEth) {
    throw new Error('amountEth is required');
  }

  const provider = getProvider(rpcUrl);
  const wallet = resolveFundingWallet(fundingSecret, fundingPath).connect(provider);
  const feeOptions = await getFeeOptions(provider);
  const value = ethers.parseEther(amountEth);
  const logs = [];
  let nextNonce = await provider.getTransactionCount(wallet.address, 'pending');
  let lastSubmittedHash = null;

  for (let i = 0; i < recipients.length; i += 1) {
    const to = recipients[i];
    const label = `${i + 1}/${recipients.length} ${to.slice(0, 6)}...${to.slice(-4)}`;
    const gasLimit = await estimateGasLimit(provider, {
      to,
      from: wallet.address,
      value
    });
    try {
      const tx = await wallet.sendTransaction({
        to,
        value,
        gasLimit,
        ...feeOptions,
        nonce: nextNonce
      });
      nextNonce += 1;
      lastSubmittedHash = tx.hash;
      logs.push(`✅ 已提交 ${label} → ${tx.hash}`);
      if (waitConfirm) {
        await tx.wait(1);
        logs.push(`✅ 已确认 ${label}`);
      }
    } catch (error) {
      if (isNonceError(error) || isInFlightLimitError(error)) {
        try {
          if (isInFlightLimitError(error)) {
            logs.push(`⏳ 节点限制未确认交易数量，等待确认后重试 ${label}`);
            if (lastSubmittedHash) {
              await provider.waitForTransaction(lastSubmittedHash, 1);
            } else {
              await delay(Math.max(delayMs, 2000));
            }
          }
          nextNonce = await provider.getTransactionCount(wallet.address, 'pending');
        const retryTx = await wallet.sendTransaction({
          to,
          value,
          gasLimit,
          ...feeOptions,
          nonce: nextNonce
        });
          nextNonce += 1;
          lastSubmittedHash = retryTx.hash;
          logs.push(`✅ 已重试提交 ${label} → ${retryTx.hash}`);
          if (waitConfirm) {
            await retryTx.wait(1);
            logs.push(`✅ 已确认 ${label}`);
          }
        } catch (retryError) {
          logs.push(`❌ 发送失败 ${label}: ${retryError.message}`);
        }
      } else {
        logs.push(`❌ 发送失败 ${label}: ${error.message}`);
      }
    }

    if (i < recipients.length - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  return { logs };
};

const handleReclaimBatch = async (payload) => {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const rpcUrl = payload.rpcUrl;
  const reserveEth = payload.reserveEth || '0';
  const delayMs = Number(payload.delayMs || 0);
  const waitConfirm = Boolean(payload.waitConfirm);
  const reclaimAddress = payload.reclaimAddress;

  if (!entries.length) {
    throw new Error('entries is required');
  }
  if (!rpcUrl) {
    throw new Error('rpcUrl is required');
  }
  if (!reclaimAddress) {
    throw new Error('reclaimAddress is required');
  }

  const provider = getProvider(rpcUrl);
  const feeOptions = await getFeeOptions(provider);
  const reserveWei = ethers.parseEther(reserveEth);
  const logs = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const privateKey = entry.privateKey || '';
    const address = entry.address || '';
    const label = `${i + 1}/${entries.length} ${address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '未知'}`;

    if (!privateKey) {
      logs.push(`⚠️ 无私钥，跳过 ${label}`);
      continue;
    }

    try {
      const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      const wallet = new ethers.Wallet(key).connect(provider);
      const nonce = await provider.getTransactionCount(wallet.address, 'pending');
      const balance = await provider.getBalance(wallet.address);
      const estimatedGasLimit = await estimateGasLimit(provider, {
        to: reclaimAddress,
        from: wallet.address,
        value: 1n
      });
      const gasCost = estimatedGasLimit * feeOptions.maxFeePerGas;
      const sendable = balance - reserveWei - gasCost;

      if (sendable <= 0n) {
        logs.push(`⚠️ 余额不足，跳过 ${label}`);
        continue;
      }

      const finalGasLimit = await estimateGasLimit(
        provider,
        {
          to: reclaimAddress,
          from: wallet.address,
          value: sendable
        },
        estimatedGasLimit
      );
      const finalGasCost = finalGasLimit * feeOptions.maxFeePerGas;
      const finalSendable = balance - reserveWei - finalGasCost;

      if (finalSendable <= 0n) {
        logs.push(`⚠️ 余额不足，跳过 ${label}`);
        continue;
      }

      const tx = await wallet.sendTransaction({
        to: reclaimAddress,
        value: finalSendable,
        gasLimit: finalGasLimit,
        ...feeOptions,
        nonce
      });
      logs.push(`✅ 已提交 ${label} → ${tx.hash}`);
      if (waitConfirm) {
        await tx.wait(1);
        logs.push(`✅ 已确认 ${label}`);
      }
    } catch (error) {
      logs.push(`❌ 回收失败 ${label}: ${error.message}`);
    }

    if (i < entries.length - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  return { logs };
};

const server = http.createServer(async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(error.message);
    return;
  }

  try {
    if (req.url === '/api/send-batch') {
      const result = await handleSendBatch(payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.url === '/api/reclaim-batch') {
      const result = await handleReclaimBatch(payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(error.message);
  }
});

server.listen(PORT, () => {
  console.log(`TX server listening on http://localhost:${PORT}`);
  console.log('RPC: provided per request');
});
