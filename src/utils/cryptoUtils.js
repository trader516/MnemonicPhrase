import * as bip39 from 'bip39';

// 使用浏览器兼容的crypto实现
const crypto = require('crypto-browserify');
const { createHash, randomBytes, pbkdf2, createCipheriv, createDecipheriv } = crypto;

/**
 * 生成符合 BIP39 标准的助记词
 * @param {number} wordCount - 助记词数量 (12, 15, 18, 21, 24)
 * @returns {string} 生成的助记词字符串
 */
export const generateMnemonic = async (wordCount = 12) => {
  try {
    // 计算所需的熵位数
    const entropyBits = {
      12: 128,
      15: 160,
      18: 192,
      21: 224,
      24: 256
    };

    const bits = entropyBits[wordCount];
    if (!bits) {
      throw new Error(`不支持的助记词长度: ${wordCount}`);
    }

    // 生成随机熵
    const entropy = randomBytes(bits / 8);
    
    // 生成助记词
    const mnemonic = bip39.entropyToMnemonic(entropy.toString('hex'));
    
    // 验证生成的助记词
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
 * 使用 AES-256-CTR 加密助记词
 * 加密参数:
 * - 算法: AES-256-CTR
 * - 密钥派生: PBKDF2 + SHA-256
 * - 迭代次数: 10,000
 * - 盐值长度: 16 字节
 * - IV长度: 16 字节
 * 
 * @param {string} mnemonic - 要加密的助记词
 * @param {string} password - 加密密码
 * @returns {string} Base64编码的加密结果 [盐值16字节] + [IV16字节] + [密文]
 */
export const encryptMnemonic = async (mnemonic, password) => {
  try {
    if (!mnemonic || !password) {
      throw new Error('助记词和密码不能为空');
    }

    // 验证助记词格式
    if (!validateMnemonic(mnemonic)) {
      throw new Error('助记词格式不正确');
    }

    // 生成随机盐值 (16字节)
    const salt = randomBytes(16);
    
    // 生成随机IV (16字节)  
    const iv = randomBytes(16);
    
    // 使用 PBKDF2 派生密钥 (32字节 = 256位)
    const iterations = 10000;
    const key = await new Promise((resolve, reject) => {
      pbkdf2(password, salt, iterations, 32, 'sha256', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });

    // 创建 AES-256-CTR 加密器
    const cipher = createCipheriv('aes-256-ctr', key, iv);
    
    // 加密助记词
    let encrypted = cipher.update(mnemonic, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // 组合最终数据: [盐值16字节] + [IV16字节] + [密文]
    const finalData = Buffer.concat([salt, iv, encrypted]);
    
    // 转换为Base64编码
    const base64Result = finalData.toString('base64');
    
    console.log('🔒 助记词加密成功');
    console.log('📊 加密信息:', {
      algorithm: 'AES-256-CTR',
      keyDerivation: 'PBKDF2-SHA256',
      iterations: iterations,
      saltLength: salt.length,
      ivLength: iv.length,
      encryptedLength: encrypted.length,
      totalLength: finalData.length,
      base64Length: base64Result.length
    });
    
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
    const data = Buffer.from(encryptedData, 'base64');
    
    // 检查数据长度 (至少需要32字节的盐值和IV)
    if (data.length < 32) {
      throw new Error('加密数据格式错误');
    }
    
    // 提取数据: [0-15:盐值] + [16-31:IV] + [32+:密文]
    const salt = data.subarray(0, 16);
    const iv = data.subarray(16, 32);
    const encrypted = data.subarray(32);
    
    console.log('🔍 解密信息:', {
      totalLength: data.length,
      saltLength: salt.length,
      ivLength: iv.length,
      encryptedLength: encrypted.length
    });
    
    // 使用相同参数派生密钥
    const iterations = 10000;
    const key = await new Promise((resolve, reject) => {
      pbkdf2(password, salt, iterations, 32, 'sha256', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
    
    // 创建 AES-256-CTR 解密器
    const decipher = createDecipheriv('aes-256-ctr', key, iv);
    
    // 解密数据
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // 转换为字符串
    const mnemonicText = decrypted.toString('utf8');
    
    // 验证解密结果
    if (!validateMnemonic(mnemonicText)) {
      throw new Error('解密结果不是有效的助记词，可能密码错误或数据损坏');
    }
    
    console.log('🔓 助记词解密成功');
    return mnemonicText;
    
  } catch (error) {
    console.error('❌ 解密失败:', error);
    throw new Error(`解密失败: ${error.message}`);
  }
};

/**
 * 生成助记词的种子
 * @param {string} mnemonic - 助记词
 * @param {string} passphrase - 可选的密码短语
 * @returns {Buffer} 64字节的种子
 */
export const mnemonicToSeed = async (mnemonic, passphrase = '') => {
  try {
    if (!validateMnemonic(mnemonic)) {
      throw new Error('无效的助记词');
    }
    
    const seed = await bip39.mnemonicToSeed(mnemonic, passphrase);
    console.log('🌱 种子生成成功');
    return seed;
    
  } catch (error) {
    console.error('❌ 种子生成失败:', error);
    throw new Error(`种子生成失败: ${error.message}`);
  }
};

/**
 * 从熵生成助记词
 * @param {string} entropy - 十六进制熵字符串
 * @returns {string} 助记词
 */
export const entropyToMnemonic = (entropy) => {
  try {
    const mnemonic = bip39.entropyToMnemonic(entropy);
    
    if (!validateMnemonic(mnemonic)) {
      throw new Error('从熵生成的助记词无效');
    }
    
    return mnemonic;
  } catch (error) {
    console.error('❌ 从熵生成助记词失败:', error);
    throw new Error(`从熵生成助记词失败: ${error.message}`);
  }
};

/**
 * 将助记词转换为熵
 * @param {string} mnemonic - 助记词
 * @returns {string} 十六进制熵字符串
 */
export const mnemonicToEntropy = (mnemonic) => {
  try {
    if (!validateMnemonic(mnemonic)) {
      throw new Error('无效的助记词');
    }
    
    const entropy = bip39.mnemonicToEntropy(mnemonic);
    return entropy;
  } catch (error) {
    console.error('❌ 助记词转换为熵失败:', error);
    throw new Error(`助记词转换为熵失败: ${error.message}`);
  }
};

/**
 * 获取支持的语言列表
 * @returns {Array} 支持的语言列表
 */
export const getSupportedLanguages = () => {
  return ['english', 'japanese', 'chinese_simplified', 'chinese_traditional', 'french', 'italian', 'korean', 'spanish'];
};

/**
 * 设置助记词语言
 * @param {string} language - 语言代码
 */
export const setMnemonicLanguage = (language) => {
  try {
    bip39.setDefaultWordlist(language);
    console.log('🌐 助记词语言设置为:', language);
  } catch (error) {
    console.error('❌ 语言设置失败:', error);
    throw new Error(`语言设置失败: ${error.message}`);
  }
};

/**
 * 安全清理内存中的敏感数据
 * @param {string|Buffer} data - 要清理的数据
 */
export const secureClear = (data) => {
  try {
    if (typeof data === 'string') {
      // 对字符串进行覆盖清理
      data = '\0'.repeat(data.length);
    } else if (Buffer.isBuffer(data)) {
      // 对Buffer进行零填充
      data.fill(0);
    }
    
    // 触发垃圾回收 (如果可用)
    if (global.gc) {
      global.gc();
    }
  } catch (error) {
    console.warn('⚠️ 内存清理警告:', error);
  }
};

/**
 * 验证加密数据的完整性
 * @param {string} encryptedData - Base64编码的加密数据
 * @returns {object} 验证结果和数据信息
 */
export const validateEncryptedData = (encryptedData) => {
  try {
    if (!encryptedData || typeof encryptedData !== 'string') {
      return { valid: false, error: '加密数据不能为空' };
    }
    
    // 尝试解析Base64
    let data;
    try {
      data = Buffer.from(encryptedData, 'base64');
    } catch (error) {
      return { valid: false, error: '不是有效的Base64数据' };
    }
    
    // 检查最小长度 (盐值16 + IV16 + 至少1字节密文)
    if (data.length < 33) {
      return { valid: false, error: '数据长度不足' };
    }
    
    return {
      valid: true,
      totalLength: data.length,
      saltLength: 16,
      ivLength: 16,
      encryptedLength: data.length - 32,
      format: 'AES-256-CTR/PBKDF2-SHA256'
    };
    
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

// 导出常量
export const CRYPTO_CONSTANTS = {
  ALGORITHM: 'aes-256-ctr',
  KEY_DERIVATION: 'pbkdf2',
  HASH_ALGORITHM: 'sha256',
  KEY_LENGTH: 32,        // 256 bits
  SALT_LENGTH: 16,       // 128 bits  
  IV_LENGTH: 16,         // 128 bits
  ITERATIONS: 10000,
  SUPPORTED_WORD_COUNTS: [12, 15, 18, 21, 24]
};

console.log('🔐 CryptoUtils 模块加载完成');
console.log('📋 支持的功能:', Object.keys({
  generateMnemonic,
  validateMnemonic, 
  encryptMnemonic,
  decryptMnemonic,
  mnemonicToSeed,
  entropyToMnemonic,
  mnemonicToEntropy
}));
