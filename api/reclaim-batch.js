const { ethers } = require('ethers');

const FALLBACK_PRIORITY_FEE_GWEI = '0.05';
const GAS_LIMIT_FALLBACK = 60000n;

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
        let nonce = await provider.getTransactionCount(wallet.address, 'pending');
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

        try {
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
          if (isNonceError(error) || isInFlightLimitError(error)) {
            if (isInFlightLimitError(error)) {
              logs.push(`⏳ 节点限制未确认交易数量，等待确认后重试 ${label}`);
              await delay(Math.max(delayMs, 2000));
            }
            nonce = await provider.getTransactionCount(wallet.address, 'pending');
            const retryTx = await wallet.sendTransaction({
              to: reclaimAddress,
              value: finalSendable,
              gasLimit: finalGasLimit,
              ...feeOptions,
              nonce
            });
            logs.push(`✅ 已重试提交 ${label} → ${retryTx.hash}`);
            if (waitConfirm) {
              await retryTx.wait(1);
              logs.push(`✅ 已确认 ${label}`);
            }
          } else {
            logs.push(`❌ 回收失败 ${label}: ${error.message}`);
          }
        }
      } catch (error) {
        logs.push(`❌ 回收失败 ${label}: ${error.message}`);
      }

      if (i < entries.length - 1 && delayMs > 0) {
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
