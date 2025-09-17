// 兼容性导入处理
let JSZip, saveAs;

try {
  JSZip = require('jszip');
  saveAs = require('file-saver').saveAs;
} catch (error) {
  console.warn('⚠️ JSZip或file-saver未安装，压缩包功能将不可用');
}

/**
 * 文件导出工具类
 * 支持多种格式和保存模式的文件导出功能
 */
export class FileExportUtils {
  constructor() {
    this.supportedFormats = ['json', 'csv', 'txt'];
    this.supportedModes = ['single', 'multiple', 'archive'];
  }

  /**
   * 导出单个加密结果
   * @param {Object} result - 加密结果对象
   * @param {string} format - 导出格式 (json/csv/txt)
   * @param {string} filename - 文件名
   */
  async exportSingle(result, format = 'json', filename = null) {
    try {
      if (!filename) {
        filename = this.generateFilename('single', format);
      }

      const data = this.formatSingleData(result, format);
      await this.saveFile(data, filename);
      
      console.log('📄 单个文件导出成功:', filename);
      return { success: true, filename };
      
    } catch (error) {
      console.error('❌ 单个文件导出失败:', error);
      throw new Error(`导出失败: ${error.message}`);
    }
  }

  /**
   * 批量导出 - 单文件模式
   * @param {Array} results - 批量加密结果数组
   * @param {string} format - 导出格式
   * @param {string} filename - 文件名
   */
  async exportBatchSingle(results, format = 'json', filename = null) {
    try {
      if (!filename) {
        filename = this.generateFilename('batch_single', format);
      }

      const data = this.formatBatchData(results, format);
      await this.saveFile(data, filename);
      
      console.log('📄 批量单文件导出成功:', filename, `(${results.length} 项)`);
      return { success: true, filename, count: results.length };
      
    } catch (error) {
      console.error('❌ 批量单文件导出失败:', error);
      throw new Error(`导出失败: ${error.message}`);
    }
  }

  /**
   * 批量导出 - 多文件模式
   * @param {Array} results - 批量加密结果数组
   * @param {string} format - 导出格式
   * @param {string} prefix - 文件名前缀
   */
  async exportBatchMultiple(results, format = 'json', prefix = 'mnemonic_') {
    try {
      const files = [];
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const filename = `${prefix}${String(i + 1).padStart(3, '0')}.${format}`;
        const data = this.formatSingleData(result, format);
        
        // 保存到临时数组，稍后一起下载
        files.push({
          filename,
          data,
          result
        });
      }

      // 使用浏览器下载API逐个下载文件
      for (const file of files) {
        await this.saveFile(file.data, file.filename);
        // 增加延迟避免浏览器限制多个下载
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      console.log('📁 批量多文件导出成功:', files.length, '个文件');
      return { success: true, count: files.length, files: files.map(f => f.filename) };
      
    } catch (error) {
      console.error('❌ 批量多文件导出失败:', error);
      throw new Error(`导出失败: ${error.message}`);
    }
  }

  /**
   * 批量导出 - 压缩包模式
   * @param {Array} results - 批量加密结果数组
   * @param {string} format - 导出格式
   * @param {string} zipFilename - 压缩包文件名
   * @param {string} prefix - 内部文件名前缀
   */
  async exportBatchArchive(results, format = 'json', zipFilename = null, prefix = 'mnemonic_') {
    try {
      if (!JSZip) {
        throw new Error('压缩包功能不可用，请使用其他保存模式');
      }
      
      const zip = new JSZip();
      
      if (!zipFilename) {
        zipFilename = this.generateFilename('batch_archive', 'zip');
      }

      // 创建批量信息文件
      const batchInfo = {
        exportTime: new Date().toISOString(),
        totalCount: results.length,
        format: format,
        encryptionAlgorithm: 'AES-256-CTR',
        keyDerivation: 'PBKDF2-SHA256',
        iterations: 10000,
        note: '助记词加密工具批量导出'
      };
      
      zip.file('batch_info.json', JSON.stringify(batchInfo, null, 2));

      // 添加各个加密文件
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const filename = `${prefix}${String(i + 1).padStart(3, '0')}.${format}`;
        const data = this.formatSingleData(result, format);
        zip.file(filename, data);
      }

      // 添加README文件
      const readme = this.generateReadme(results.length, format);
      zip.file('README.txt', readme);

      // 生成压缩包
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      // 下载压缩包
      if (saveAs) {
        saveAs(zipBlob, zipFilename);
      } else {
        // 使用浏览器原生下载
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = zipFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      
      console.log('🗜️ 批量压缩包导出成功:', zipFilename, `(${results.length} 项)`);
      return { success: true, filename: zipFilename, count: results.length };
      
    } catch (error) {
      console.error('❌ 批量压缩包导出失败:', error);
      throw new Error(`导出失败: ${error.message}`);
    }
  }

  /**
   * 格式化单个数据
   * @param {Object} result - 加密结果
   * @param {string} format - 格式
   * @returns {string} 格式化后的数据
   */
  formatSingleData(result, format) {
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify({
          version: '1.0',
          exportTime: new Date().toISOString(),
          algorithm: result.algorithm || 'AES-256-CTR',
          keyDerivation: result.keyDerivation || 'PBKDF2-SHA256',
          iterations: result.iterations || 10000,
          wordCount: result.wordCount,
          createdAt: result.createdAt,
          encryptedData: result.encryptedData,
          note: '助记词加密工具生成'
        }, null, 2);

      case 'csv':
        return `ID,加密数据,EVM地址,创建时间,词数,算法,备注\n` +
               `${result.id || 1},"${result.encryptedData}","${result.address || ''}","${new Date(result.createdAt).toLocaleString()}",${result.wordCount},"${result.algorithm || 'AES-256-CTR'}","单个导出"`;

      case 'txt':
        return `=== 助记词加密数据 ===\n` +
               `导出时间: ${new Date().toLocaleString()}\n` +
               `加密算法: ${result.algorithm || 'AES-256-CTR'}\n` +
               `密钥派生: ${result.keyDerivation || 'PBKDF2-SHA256'}\n` +
               `迭代次数: ${(result.iterations || 10000).toLocaleString()}\n` +
               `助记词长度: ${result.wordCount} 词\n` +
               `创建时间: ${new Date(result.createdAt).toLocaleString()}\n\n` +
               `加密数据:\n${result.encryptedData}\n\n` +
               `⚠️ 重要提醒:\n` +
               `• 请妥善保管此文件和解密密码\n` +
               `• 不要将此文件上传到网络或发送给他人\n` +
               `• 建议将文件备份到多个安全位置`;

      default:
        throw new Error(`不支持的格式: ${format}`);
    }
  }

  /**
   * 格式化批量数据
   * @param {Array} results - 批量结果
   * @param {string} format - 格式
   * @returns {string} 格式化后的数据
   */
  formatBatchData(results, format) {
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify({
          version: '1.0',
          batchInfo: {
            exportTime: new Date().toISOString(),
            totalCount: results.length,
            encryptionParams: 'AES-256-CTR/PBKDF2-SHA256/10000',
            wordCounts: this.getWordCountStats(results)
          },
          mnemonics: results.map((r, index) => ({
            id: index + 1,
            encryptedData: r.encryptedData,
            createdTime: r.createdAt,
            wordCount: r.wordCount,
            algorithm: r.algorithm || 'AES-256-CTR'
          }))
        }, null, 2);

      case 'csv':
        const header = 'ID,加密数据,EVM地址,创建时间,词数,算法,备注\n';
        const rows = results.map((r, index) =>
          `${index + 1},"${r.encryptedData}","${r.address || ''}","${new Date(r.createdAt).toLocaleString()}",${r.wordCount},"${r.algorithm || 'AES-256-CTR'}","批量生成"`
        ).join('\n');
        return header + rows;

      case 'txt':
        const header_txt = `=== 助记词加密批次 ===\n` +
                          `导出时间: ${new Date().toLocaleString()}\n` +
                          `总数量: ${results.length}\n` +
                          `加密算法: AES-256-CTR\n` +
                          `密钥派生: PBKDF2-SHA256\n` +
                          `迭代次数: 10,000\n\n`;
        
        const items = results.map((r, index) => 
          `[${String(index + 1).padStart(3, '0')}] ${r.wordCount}词 | ${new Date(r.createdAt).toLocaleString()}\n${r.encryptedData}\n`
        ).join('\n');
        
        return header_txt + items + '\n⚠️ 请妥善保管此文件和解密密码！';

      default:
        throw new Error(`不支持的格式: ${format}`);
    }
  }

  /**
   * 获取词数统计
   * @param {Array} results - 结果数组
   * @returns {Object} 统计信息
   */
  getWordCountStats(results) {
    const stats = {};
    results.forEach(r => {
      const count = r.wordCount;
      stats[`${count}词`] = (stats[`${count}词`] || 0) + 1;
    });
    return stats;
  }

  /**
   * 生成文件名
   * @param {string} type - 导出类型
   * @param {string} format - 文件格式
   * @returns {string} 生成的文件名
   */
  generateFilename(type, format) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    const prefixes = {
      'single': 'mnemonic_encrypted',
      'batch_single': 'mnemonic_batch',
      'batch_multiple': 'mnemonic_batch',
      'batch_archive': 'mnemonic_batch_archive'
    };

    const prefix = prefixes[type] || 'mnemonic';
    return `${prefix}_${timestamp}.${format}`;
  }

  /**
   * 保存文件
   * @param {string} data - 文件数据
   * @param {string} filename - 文件名
   */
  async saveFile(data, filename) {
    try {
      const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
      
      if (saveAs) {
        // 使用file-saver库
        saveAs(blob, filename);
        console.log('📄 使用file-saver下载:', filename);
      } else {
        // 使用浏览器原生下载
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        // 延迟清理，确保下载开始
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 100);
        
        console.log('📄 使用浏览器原生下载:', filename);
      }
      
      // 增加延迟，确保浏览器处理下载
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error('❌ 文件保存失败:', error);
      throw new Error(`文件保存失败: ${error.message}`);
    }
  }

  /**
   * 生成README内容
   * @param {number} count - 文件数量
   * @param {string} format - 文件格式
   * @returns {string} README内容
   */
  generateReadme(count, format) {
    return `助记词加密工具 - 批量导出说明

导出时间: ${new Date().toLocaleString()}
文件数量: ${count} 个
文件格式: ${format.toUpperCase()}
加密算法: AES-256-CTR
密钥派生: PBKDF2-SHA256 (10,000 次迭代)

文件列表:
${Array.from({length: count}, (_, i) => 
  `- mnemonic_${String(i + 1).padStart(3, '0')}.${format}`
).join('\n')}

使用说明:
1. 每个文件包含一个加密的助记词
2. 使用助记词加密工具可以解密这些文件
3. 请妥善保管解密密码，丢失后无法恢复

安全提醒:
⚠️ 请将此压缩包保存在安全的地方
⚠️ 不要将压缩包上传到网络或发送给他人  
⚠️ 建议制作多个备份并分别保存
⚠️ 定期检查备份文件的完整性

技术支持:
如有问题请查看软件帮助文档或联系技术支持

---
助记词生成与加密工具 v1.0
© 2025 All Rights Reserved`;
  }

  /**
   * 验证导出参数
   * @param {string} format - 格式
   * @param {string} mode - 模式
   * @returns {boolean} 验证结果
   */
  validateParams(format, mode) {
    if (!this.supportedFormats.includes(format.toLowerCase())) {
      throw new Error(`不支持的格式: ${format}`);
    }
    
    if (!this.supportedModes.includes(mode.toLowerCase())) {
      throw new Error(`不支持的模式: ${mode}`);
    }
    
    return true;
  }

  /**
   * 获取支持的格式列表
   * @returns {Array} 格式列表
   */
  getSupportedFormats() {
    return [...this.supportedFormats];
  }

  /**
   * 获取支持的模式列表
   * @returns {Array} 模式列表
   */
  getSupportedModes() {
    return [...this.supportedModes];
  }
}

// 创建单例实例
export const fileExporter = new FileExportUtils();

console.log('📁 文件导出工具加载完成');
console.log('🔧 支持的格式:', fileExporter.getSupportedFormats());
console.log('📦 支持的模式:', fileExporter.getSupportedModes());
