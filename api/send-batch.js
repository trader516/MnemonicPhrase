const { ethers } = require('ethers');

const FALLBACK_PRIORITY_FEE_GWEI = '0.05';
const FUNDING_PATH = process.env.TX_SERVER_MNEMONIC_PATH || "m/44'/60'/0'/0/0";

const sendCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const parseJsonBody = (req) =>
  new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
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

const resolveFundingWallet = (secret, path) => {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error('Funding secret is required');
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 12) {
    return ethers.Wallet.fromPhrase(trimmed, undefined, path || FUNDING_PATH);
  }
  const key = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return new ethers.Wallet(key);
};

const isNonceError = (error) => {
  const message = error?.message || '';
  return error?.code === 'NONCE_EXPIRED' || /nonce too low|already been used/i.test(message);
};

const isInFlightLimitError = (error) => {
  const message = error?.message || '';
  return /in-flight transaction limit/i.test(message);
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    res.statusCode = 400;
    res.end(error.message);
    return;
  }

  try {
    const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
    const amountEth = payload.amountEth;
    const waitConfirm = Boolean(payload.waitConfirm);
    const delayMs = Number(payload.delayMs || 0);
    const rpcUrl = payload.rpcUrl;
    const fundingSecret = payload.fundingSecret;
    const fundingPath = payload.fundingPath || FUNDING_PATH;

    if (!rpcUrl) {
      throw new Error('rpcUrl is required');
    }
    if (!fundingSecret) {
      throw new Error('fundingSecret is required');
    }

    if (!recipients.length) {
      throw new Error('recipients is required');
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
      try {
        const tx = await wallet.sendTransaction({
          to,
          value,
          gasLimit: 21000,
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
              gasLimit: 21000,
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

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ logs }));
  } catch (error) {
    res.statusCode = 500;
    res.end(error.message);
  }
};
