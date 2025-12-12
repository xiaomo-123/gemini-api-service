const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const logger = require('./logger');

// 配置文件路径
const TEMP_MAIL_CONFIG_PATH = path.join(__dirname, '../config/temp-mail.yaml');
const GEMINI_MAIL_CONFIG_PATH = path.join(__dirname, '../config/gemini-mail.yaml');
const PROXY_CONFIG_PATH = path.join(__dirname, '../config/proxy.yaml');

// 确保配置目录存在
const configDir = path.join(__dirname, '../config');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

/**
 * 规范化换行符为 Windows 格式
 */
function normalizeLineEndings(content) {
  // 将所有换行符替换为Windows格式的CRLF
  return content.replace(/\r?\n/g, '\r\n');
}

/**
 * 加载 temp-mail.yaml 配置
 */
function loadTempMailConfig() {
  try {
    if (!fs.existsSync(TEMP_MAIL_CONFIG_PATH)) {
      throw new Error(`配置文件缺失: ${TEMP_MAIL_CONFIG_PATH}`);
    }

    const raw = yaml.load(fs.readFileSync(TEMP_MAIL_CONFIG_PATH, 'utf8')) || {};

    // 确保基本结构存在
    if (!raw.credentials) {
      raw.credentials = { account: '', password: '' };
    }

    if (!raw.accounts) {
      raw.accounts = {
        parent: {
          email: '',
          accountId: null,
          name: '',
          status: null,
          latestEmailTime: '',
          createTime: ''
        },
        children: [],
        lastUpdated: ''
      };
    } else {
      raw.accounts.parent = raw.accounts.parent || {
        email: '',
        accountId: null,
        name: '',
        status: null,
        latestEmailTime: '',
        createTime: ''
      };
      raw.accounts.children = raw.accounts.children || [];
      raw.accounts.lastUpdated = raw.accounts.lastUpdated || '';
    }

    return raw;
  } catch (error) {
    logger.error(`加载 temp-mail.yaml 失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取邮箱API凭据
 */
function getEmailCredentials() {
  const config = loadTempMailConfig();
  const { account, password } = config.credentials;
  const defaultDomain = config.defaultDomain;
  const emailApiUrl = config.emailApiUrl;

  if (!account || !password) {
    throw new Error('请在 temp-mail.yaml 中填写 account 与 password 字段');
  }

  const loginEmail = defaultDomain && !account.includes('@') 
    ? `${account}${defaultDomain}` 
    : account;

  return {
    account,
    password,
    defaultDomain,
    emailApiUrl,
    loginEmail
  };
}

/**
 * 保存 temp-mail.yaml 配置
 */
function saveTempMailConfig(config) {
  try {
    const serialized = yaml.dump(config, { lineWidth: -1 });
    fs.writeFileSync(TEMP_MAIL_CONFIG_PATH, normalizeLineEndings(serialized), 'utf8');
    logger.info('temp-mail.yaml 配置已更新');
  } catch (error) {
    logger.error(`保存 temp-mail.yaml 失败: ${error.message}`);
    throw error;
  }
}

/**
 * 加载 gemini-mail.yaml 配置
 */
function loadGeminiMailConfig() {
  try {
    if (!fs.existsSync(GEMINI_MAIL_CONFIG_PATH)) {
      throw new Error(`配置文件缺失: ${GEMINI_MAIL_CONFIG_PATH}`);
    }

    const raw = yaml.load(fs.readFileSync(GEMINI_MAIL_CONFIG_PATH, 'utf8')) || {};

    if (!raw.accounts) {
      throw new Error('gemini-mail.yaml 格式错误：缺少 accounts 字段');
    }

    if (!raw.accounts.parent) {
      throw new Error('gemini-mail.yaml 格式错误：缺少 parent 账号信息');
    }

    if (!raw.accounts.children || !Array.isArray(raw.accounts.children)) {
      raw.accounts.children = [];
    }

    return raw;
  } catch (error) {
    logger.error(`加载 gemini-mail.yaml 失败: ${error.message}`);
    throw error;
  }
}

/**
 * 保存 gemini-mail.yaml 配置
 */
function saveGeminiMailConfig(config) {
  try {
    const serialized = yaml.dump(config, { lineWidth: -1 });
    fs.writeFileSync(GEMINI_MAIL_CONFIG_PATH, normalizeLineEndings(serialized), 'utf8');
    logger.info('gemini-mail.yaml 配置已更新');
  } catch (error) {
    logger.error(`保存 gemini-mail.yaml 失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取代理配置
 */
function getProxyConfig() {
  try {
    // 如果代理配置文件不存在，返回默认禁用状态
    if (!fs.existsSync(PROXY_CONFIG_PATH)) {
      return {
        enabled: false,
        type: 'http',
        url: '127.0.0.1',
        port: 8080,
        username: '',
        password: ''
      };
    }

    const proxyConfig = yaml.load(fs.readFileSync(PROXY_CONFIG_PATH, 'utf8')) || {};

    // 如果没有proxy配置，返回默认禁用状态
    if (!proxyConfig.proxy) {
      return {
        enabled: false,
        type: 'http',
        url: '127.0.0.1',
        port: 8080,
        username: '',
        password: ''
      };
    }

    // 返回配置的代理设置，确保所有字段都有默认值
    return {
      enabled: proxyConfig.proxy.enabled || false,
      type: proxyConfig.proxy.type || 'http',
      url: proxyConfig.proxy.url || '127.0.0.1',
      port: proxyConfig.proxy.port || 8080,
      username: proxyConfig.proxy.username || '',
      password: proxyConfig.proxy.password || ''
    };
  } catch (error) {
    logger.error(`读取代理配置文件出错: ${error.message}`);
    // 出错时返回默认禁用状态
    return {
      enabled: false,
      type: 'http',
      url: '127.0.0.1',
      port: 8080,
      username: '',
      password: ''
    };
  }
}

module.exports = {
  loadTempMailConfig,
  getEmailCredentials,
  saveTempMailConfig,
  loadGeminiMailConfig,
  saveGeminiMailConfig,
  getProxyConfig
};
