import * as bip39 from 'bip39';

/**
 * GUI兼容版本的crypto工具
 * 使用浏览器原生API和bip39库
 */

/**
 * 生成符合 BIP39 标准的助记词
 * @param {number} wordCount - 助记词数量 (12, 15, 18, 21, 24)
 * @returns {string} 生成的助记词字符串
 */
export const generateMnemonic = async (wordCount = 12) => {
  try {
    const entropyBits = {
      12: 128, 15: 160, 18: 192, 21: 224, 24: 256
    };

    const bits = entropyBits[wordCount];
    if (!bits) {
      throw new Error(`不支持的助记词长度: ${wordCount}`);
    }

    // 使用bip39内置方法生成
    const mnemonic = bip39.generateMnemonic(bits);
    
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('生成的助记词验证失败');
    }
    
    console.log(`✅ 成功生成 ${wordCount} 个单词的助记词`);
    return mnemonic;
    
  } catch (error) {
    console.error('❌ 助记词生成失败:', error);
    throw new Error(`助记词生成失败: ${error.message}`);
  }
};

/**
 * 验证助记词是否符合 BIP39 标准
 * @param {string} mnemonic - 助记词字符串
 * @returns {boolean} 验证结果
 */
export const validateMnemonic = (mnemonic) => {
  try {
    return bip39.validateMnemonic(mnemonic);
  } catch (error) {
    console.error('助记词验证失败:', error);
    return false;
  }
};

/**
 * 使用浏览器原生 WebCrypto API 进行AES-256-GCM加密
 * 注意：这是简化版本，用于GUI演示
 * @param {string} mnemonic - 要加密的助记词
 * @param {string} password - 加密密码
 * @returns {string} Base64编码的加密结果
 */
export const encryptMnemonic = async (mnemonic, password) => {
  try {
    if (!mnemonic || !password) {
      throw new Error('助记词和密码不能为空');
    }

    if (!validateMnemonic(mnemonic)) {
      throw new Error('助记词格式不正确');
    }

    // 使用WebCrypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(mnemonic);
    const passwordData = encoder.encode(password);
    
    // 生成盐值
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    // 派生密钥
    const keyMaterial = await crypto.subtle.importKey(
      'raw', 
      passwordData, 
      'PBKDF2', 
      false, 
      ['deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 10000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    // 生成IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 加密
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      data
    );
    
    // 组合数据: [盐值16字节] + [IV12字节] + [密文]
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    // 转换为Base64
    const base64Result = btoa(String.fromCharCode(...result));
    
    console.log('🔒 助记词加密成功 (WebCrypto版本)');
    return base64Result;
    
  } catch (error) {
    console.error('❌ 加密失败:', error);
    throw new Error(`加密失败: ${error.message}`);
  }
};

/**
 * 解密助记词
 * @param {string} encryptedData - Base64编码的加密数据
 * @param {string} password - 解密密码
 * @returns {string} 解密后的助记词
 */
export const decryptMnemonic = async (encryptedData, password) => {
  try {
    if (!encryptedData || !password) {
      throw new Error('加密数据和密码不能为空');
    }

    // 解析Base64数据
    const data = new Uint8Array(
      atob(encryptedData)
        .split('')
        .map(char => char.charCodeAt(0))
    );
    
    if (data.length < 28) { // 16 + 12 最小长度
      throw new Error('加密数据格式错误');
    }
    
    // 提取数据部分
    const salt = data.slice(0, 16);
    const iv = data.slice(16, 28);
    const encrypted = data.slice(28);
    
    // 派生密钥
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordData,
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 10000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    // 解密
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );
    
    // 转换为文本
    const decoder = new TextDecoder();
    const mnemonicText = decoder.decode(decrypted);
    
    // 验证解密结果
    if (!validateMnemonic(mnemonicText)) {
      throw new Error('解密结果不是有效的助记词，可能密码错误');
    }
    
    console.log('🔓 助记词解密成功 (WebCrypto版本)');
    return mnemonicText;
    
  } catch (error) {
    console.error('❌ 解密失败:', error);
    throw new Error(`解密失败: ${error.message}`);
  }
};

// 导出常量
export const CRYPTO_CONSTANTS = {
  ALGORITHM: 'aes-256-gcm',
  KEY_DERIVATION: 'pbkdf2-sha256',
  HASH_ALGORITHM: 'sha256',
  KEY_LENGTH: 32,
  SALT_LENGTH: 16,
  IV_LENGTH: 12,
  ITERATIONS: 10000,
  SUPPORTED_WORD_COUNTS: [12, 15, 18, 21, 24]
};

console.log('🔐 CryptoUtils GUI版本加载完成 (使用WebCrypto API)');
console.log('🎯 支持功能: BIP39生成、WebCrypto加密、批量处理');

