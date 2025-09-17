/**
 * EVM地址生成相关工具函数
 * 支持从助记词生成以太坊地址，验证地址一致性等功能
 */

import { ethers } from 'ethers';
import * as bip39 from 'bip39';

/**
 * 标准的HD钱包路径
 * m/44'/60'/0'/0/0 是以太坊的标准派生路径
 */
export const DEFAULT_ETH_PATH = "m/44'/60'/0'/0/0";

/**
 * 从助记词生成以太坊地址
 * @param {string} mnemonic - BIP39助记词
 * @param {string} derivationPath - HD钱包派生路径，默认为以太坊标准路径
 * @returns {object} 包含地址、私钥和公钥的对象
 */
export const generateEthereumAddress = (mnemonic, derivationPath = DEFAULT_ETH_PATH) => {
  try {
    // 验证助记词有效性
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('无效的助记词');
    }

    // 从助记词创建HD钱包
    const hdWallet = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      derivationPath
    );

    return {
      address: hdWallet.address,
      privateKey: hdWallet.privateKey,
      publicKey: hdWallet.publicKey,
      path: derivationPath,
      mnemonic: mnemonic
    };
  } catch (error) {
    console.error('生成以太坊地址失败:', error);
    throw new Error(`地址生成失败: ${error.message}`);
  }
};

/**
 * 验证助记词生成的地址一致性
 * @param {string} mnemonic - BIP39助记词
 * @param {number} testCount - 测试次数，默认5次
 * @returns {object} 验证结果
 */
export const validateAddressConsistency = (mnemonic, testCount = 5) => {
  try {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('无效的助记词');
    }

    const results = [];
    const firstAddress = generateEthereumAddress(mnemonic).address;

    // 多次生成同一助记词的地址进行比较
    for (let i = 0; i < testCount; i++) {
      const result = generateEthereumAddress(mnemonic);
      results.push({
        attempt: i + 1,
        address: result.address,
        matches: result.address === firstAddress
      });
    }

    const allMatch = results.every(r => r.matches);

    return {
      isConsistent: allMatch,
      firstAddress,
      testResults: results,
      message: allMatch ? '地址生成一致' : '地址生成不一致，请检查助记词'
    };
  } catch (error) {
    console.error('地址一致性验证失败:', error);
    return {
      isConsistent: false,
      error: error.message,
      message: `验证失败: ${error.message}`
    };
  }
};

/**
 * 批量生成地址信息
 * @param {Array} mnemonics - 助记词数组
 * @returns {Array} 地址信息数组
 */
export const batchGenerateAddresses = (mnemonics) => {
  try {
    return mnemonics.map((mnemonic, index) => {
      try {
        const addressInfo = generateEthereumAddress(mnemonic);
        return {
          id: index + 1,
          mnemonic,
          ...addressInfo,
          success: true
        };
      } catch (error) {
        return {
          id: index + 1,
          mnemonic,
          success: false,
          error: error.message
        };
      }
    });
  } catch (error) {
    console.error('批量生成地址失败:', error);
    throw error;
  }
};

/**
 * 验证以太坊地址格式
 * @param {string} address - 以太坊地址
 * @returns {boolean} 是否为有效地址
 */
export const isValidEthereumAddress = (address) => {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
};

/**
 * 格式化显示地址（省略中间部分）
 * @param {string} address - 完整地址
 * @param {number} prefixLength - 前缀长度，默认6
 * @param {number} suffixLength - 后缀长度，默认4
 * @returns {string} 格式化后的地址
 */
export const formatAddress = (address, prefixLength = 6, suffixLength = 4) => {
  if (!address || address.length < prefixLength + suffixLength) {
    return address;
  }

  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
};

/**
 * 验证多个助记词生成地址的唯一性
 * @param {Array} mnemonics - 助记词数组
 * @returns {object} 验证结果
 */
export const validateAddressUniqueness = (mnemonics) => {
  try {
    const addressMap = new Map();
    const duplicates = [];

    mnemonics.forEach((mnemonic, index) => {
      try {
        const addressInfo = generateEthereumAddress(mnemonic);
        const address = addressInfo.address;

        if (addressMap.has(address)) {
          duplicates.push({
            address,
            mnemonics: [addressMap.get(address), { mnemonic, index }]
          });
        } else {
          addressMap.set(address, { mnemonic, index });
        }
      } catch (error) {
        console.warn(`助记词 ${index + 1} 生成地址失败:`, error.message);
      }
    });

    return {
      isUnique: duplicates.length === 0,
      totalAddresses: addressMap.size,
      duplicates,
      message: duplicates.length === 0
        ? '所有地址都是唯一的'
        : `发现 ${duplicates.length} 组重复地址`
    };
  } catch (error) {
    console.error('地址唯一性验证失败:', error);
    return {
      isUnique: false,
      error: error.message,
      message: `验证失败: ${error.message}`
    };
  }
};

/**
 * 获取支持的网络信息
 * @returns {Array} 支持的网络列表
 */
export const getSupportedNetworks = () => {
  return [
    {
      name: 'Ethereum Mainnet',
      chainId: 1,
      rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/your-api-key',
      blockExplorer: 'https://etherscan.io'
    },
    {
      name: 'Sepolia Testnet',
      chainId: 11155111,
      rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/your-api-key',
      blockExplorer: 'https://sepolia.etherscan.io'
    },
    {
      name: 'Base Mainnet',
      chainId: 8453,
      rpcUrl: 'https://mainnet.base.org',
      blockExplorer: 'https://basescan.org'
    },
    {
      name: 'Base Sepolia',
      chainId: 84532,
      rpcUrl: 'https://sepolia.base.org',
      blockExplorer: 'https://sepolia.basescan.org'
    }
  ];
};