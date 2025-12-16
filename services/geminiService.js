const axios = require('axios');
const puppeteer = require('puppeteer');
const { loadGeminiMailConfig, saveGeminiMailConfig, getProxyConfig, getEmailCredentials } = require('../utils/config');
const { getEmailList } = require('./emailService');
const logger = require('../utils/logger');

// 从配置文件获取邮箱 API URL
const { emailApiUrl } = getEmailCredentials();
const EMAIL_LIST_URL = `${emailApiUrl}/api/email/list`;

/**
 * 确保 fetch API 可用
 */
function ensureFetchAvailable() {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("当前 Node 版本不支持全局 fetch，请使用 Node 18+ 或自行 polyfill fetch");
  }
}

/**
 * 从邮件文本中提取 Gemini 验证码
 * @param {string} text - 邮件正文
 * @returns {string|null} 验证码或 null
 */
function extractGeminiVerificationCode(text) {
  // 匹配 "您的一次性验证码为：\n\nXXXXXX" 格式
  const match = text.match(/您的一次性验证码为：\s*\n\s*\n\s*([A-Z0-9]{6})/i);
  return match ? match[1] : null;
}

/**
 * 获取指定账号的最新邮件列表
 * @param {string} token - 已登录的会话令牌
 * @param {number} accountId - 账号ID
 * @param {number} size - 获取邮件数量（默认5）
 * @returns {Promise<Object>} 邮件列表数据
 */
async function fetchEmailList(token, accountId, size = 5) {
  ensureFetchAvailable();

  const url = `${EMAIL_LIST_URL}?accountId=${accountId}&emailId=0&timeSort=0&size=${size}&type=0`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": token,
    },
  });

  if (!response.ok) {
    throw new Error(`获取邮件列表失败，HTTP 状态码 ${response.status}`);
  }

  const payloadText = await response.text();
  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`邮件列表响应无法解析为 JSON: ${error.message}`);
  }

  if (payload.code !== 200) {
    throw new Error(`获取邮件列表失败: ${payload.message || "未知错误"}`);
  }

  return payload.data;
}

/**
 * 查找最新的 Gemini 验证码邮件
 * @param {Array} emailList - 邮件列表
 * @returns {string|null} 验证码或 null
 */
function findGeminiVerificationCode(emailList) {
  if (!emailList || emailList.length === 0) {
    logger.info(`   ⚠️ 邮件列表为空`);
    return null;
  }

  logger.info(`   🔍 开始在 ${emailList.length} 封邮件中查找验证码...`);
  
  // 遍历邮件列表，查找 Gemini Business 验证码邮件
  for (const email of emailList) {
    logger.info(`   📧 检查邮件: ${email.subject || '(无主题)'}`);
    
    if (email.subject === "Gemini Business 验证码") {
      logger.info(`   ✅ 找到验证码邮件`);
      
      if (!email.text) {
        logger.info(`   ⚠️ 邮件内容为空`);
        continue;
      }
      
      const code = extractGeminiVerificationCode(email.text);
      
      if (code) {
        logger.info(`   ✅ 成功提取验证码: ${code}`);
        return code;
      } else {
        logger.info(`   ❌ 无法从邮件内容中提取验证码`);
        // 打印部分邮件内容以便调试
        const preview = email.text.substring(0, 200);
        logger.info(`   📄 邮件内容预览: ${preview}${email.text.length > 200 ? '...' : ''}`);
      }
    }
  }

  logger.info(`   ❌ 未找到有效的验证码邮件`);
  return null;
}

/**
 * 等待并获取 Gemini 验证码（最多重试5次，每次等待5秒）
 * @param {string} token - 已登录的会话令牌
 * @param {number} accountId - 账号ID
 * @returns {Promise<string>} 验证码
 */
async function waitForGeminiVerificationCode(token, accountId) {
  const maxRetries = 5;
  const retryDelay = 5000; // 5秒

  logger.info(`   📧 开始为账户ID ${accountId} 获取验证码...`);
  logger.info(`   🔑 使用Token: ${token.substring(0, 20)}...`);

  for (let i = 0; i < maxRetries; i++) {
    logger.info(`   ⏳ 正在获取验证码... (尝试 ${i + 1}/${maxRetries})`);

    try {
      // 使用emailService中的getEmailList函数
      const { getEmailList } = require('./emailService');
      const emailData = await getEmailList(token, accountId, 5);
      logger.info(`   📨 成功获取邮件列表，共 ${emailData.list ? emailData.list.length : 0} 封邮件`);

      if (emailData.list && emailData.list.length > 0) {
        // 打印前几封邮件的主题，便于调试
        logger.info(`   📋 最近邮件主题:`);
        for (let j = 0; j < Math.min(3, emailData.list.length); j++) {
          logger.info(`      ${j + 1}. ${emailData.list[j].subject || '(无主题)'}`);
          if (emailData.list[j].createTime) {
            logger.info(`         创建时间: ${new Date(emailData.list[j].createTime).toLocaleString()}`);
          }
        }
        
        // 查找验证码邮件
        const verificationEmail = emailData.list.find(email => email.subject === "Gemini Business 验证码");
        if (verificationEmail) {
          logger.info(`   ✅ 找到验证码邮件`);
          logger.info(`   📧 邮件ID: ${verificationEmail.id}`);
          
          // 获取邮件详细内容
          if (!verificationEmail.text && verificationEmail.id) {
            try {
              const { emailApiUrl } = require('../utils/config').getEmailCredentials();
              const emailDetailUrl = `${emailApiUrl}/api/email/detail?id=${verificationEmail.id}`;
              
              const axios = require('axios');
              const response = await axios.get(emailDetailUrl, {
                headers: {
                  'Authorization': token
                }
              });
              
              if (response.data.code === 200 && response.data.data) {
                verificationEmail.text = response.data.data.text || response.data.data.content || '';
                logger.info(`   📄 已获取邮件详细内容`);
              }
            } catch (detailError) {
              logger.error(`   ❌ 获取邮件详细内容失败: ${detailError.message}`);
            }
          }
          
          const code = extractGeminiVerificationCode(verificationEmail.text || '');
          if (code) {
            logger.info(`   ✓ 成功获取验证码: ${code}`);
            return code;
          } else {
            logger.info(`   ❌ 无法从邮件内容中提取验证码`);
            // 打印部分邮件内容以便调试
            const preview = (verificationEmail.text || '').substring(0, 200);
            logger.info(`   📄 邮件内容预览: ${preview}${(verificationEmail.text || '').length > 200 ? '...' : ''}`);
          }
        } else {
          logger.info(`   ⚠️  未找到验证码邮件`);
        }
      } else {
        logger.info(`   ⚠️  邮件列表为空`);
      }
    } catch (error) {
      logger.error(`   ❌ 获取邮件失败: ${error.message}`);
      if (error.response) {
        logger.error(`   响应状态: ${error.response.status}`);
        logger.error(`   响应数据: ${JSON.stringify(error.response.data)}`);
      }
    }

    if (i < maxRetries - 1) {
      logger.info(`   ⏳ 未找到验证码，等待 ${retryDelay/1000} 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  logger.error(`   ❌ 已尝试 ${maxRetries} 次，仍未能获取到验证码`);
  throw new Error("未能在规定时间内获取到验证码");
}

/**
 * 登录Gemini Pool平台
 */
async function loginGeminiPool(poolApiUrl, password) {
  try {
    logger.info('正在登录 Gemini Pool 平台...');
    
    const response = await axios.post(`${poolApiUrl}/api/auth/login`, {
      password: password
    });

    if (response.data && response.data.token) {
      logger.info('登录成功！');
      return response.data.token;
    } else {
      throw new Error('登录响应中没有 token');
    }
  } catch (error) {
    logger.error('登录失败:', error.message);
    if (error.response) {
      logger.error('响应状态:', error.response.status);
      logger.error('响应数据:', error.response.data);
    }
    throw error;
  }
}

/**
 * 获取Gemini Pool平台上的所有账户
 */
async function getPoolAccounts(poolApiUrl, adminToken) {
  try {
    logger.info('正在获取平台账户列表...');

    const response = await axios.get(`${poolApiUrl}/api/accounts`, {
      headers: {
        'x-admin-token': adminToken
      }
    });

    if (response.data && response.data.accounts) {
      logger.info(`找到 ${response.data.accounts.length} 个平台账户`);
      return response.data.accounts;
    } else {
      throw new Error('获取账户列表失败');
    }
  } catch (error) {
    logger.error(`获取平台账户失败: ${error.message}`);
    throw error;
  }
}

/**
 * 测试单个账户是否可用
 */
async function testAccount(poolApiUrl, accountId, adminToken) {
  try {
    const response = await axios.get(`${poolApiUrl}/api/accounts/${accountId}/test`, {
      headers: {
        'x-admin-token': adminToken
      }
    });

    return response.data && response.data.success === true;
  } catch (error) {
    logger.error(`测试账户 ${accountId} 失败: ${error.message}`);
    return false;
  }
}

/**
 * 删除账户
 */
async function deleteAccount(poolApiUrl, accountId, adminToken) {
  try {
    const response = await axios.delete(`${poolApiUrl}/api/accounts/${accountId}`, {
      headers: {
        'x-admin-token': adminToken
      }
    });

    // 检查多种成功情况：success 为 true，或者 HTTP 状态码为 2xx
    return (response.data && response.data.success === true) ||
           (response.status >= 200 && response.status < 300);
  } catch (error) {
    // 如果是 404 错误（账户不存在），也视为删除成功
    if (error.response && error.response.status === 404) {
      return true;
    }
    logger.error(`删除账户 ${accountId} 失败: ${error.message}`);
    return false;
  }
}

/**
 * 添加新账户到平台
 */
async function addAccount(poolApiUrl, accountData, adminToken) {
  try {
    const response = await axios.post(`${poolApiUrl}/api/accounts`, {
      team_id: accountData.team_id,
      secure_c_ses: accountData.secure_c_ses,
      host_c_oses: accountData.host_c_oses,
      csesidx: accountData.csesidx,
      user_agent: accountData.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    }, {
      headers: {
        'x-admin-token': adminToken
      }
    });

    return response.data && response.data.success === true;
  } catch (error) {
    logger.error(`添加账户失败: ${error.message}`);
    if (error.response) {
      logger.error(`响应数据: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

/**
 * 从邮件文本中提取 Gemini 验证码
 */
function extractGeminiVerificationCode(text) {
  // 匹配 "您的一次性验证码为：\n\nXXXXXX" 格式
  const match = text.match(/您的一次性验证码为：\s*\n\s*\n\s*([A-Z0-9]{6})/i);
  return match ? match[1] : null;
}

/**
 * 查找最新的 Gemini 验证码邮件
 */
function findGeminiVerificationCode(emailList) {
  if (!emailList || emailList.length === 0) {
    return null;
  }

  // 遍历邮件列表，查找 Gemini Business 验证码邮件
  for (const email of emailList) {
    if (email.subject === "Gemini Business 验证码") {
      const code = extractGeminiVerificationCode(email.text);
      if (code) {
        return code;
      }
    }
  }

  return null;
}

/**
 * 等待并获取 Gemini 验证码（最多重试5次，每次等待5秒）
 */
async function waitForGeminiVerificationCode(token, accountId) {
  const maxRetries = 5;
  const retryDelay = 5000; // 5秒
 
  for (let i = 0; i < maxRetries; i++) {
    logger.info(`正在获取验证码... (尝试 ${i + 1}/${maxRetries})`);

    try {
      const emailData = await getEmailList(token, accountId, 5);
      
      if (emailData.list && emailData.list.length > 0) {
        const code = findGeminiVerificationCode(emailData.list);
        if (code) {
          logger.info(`成功获取验证码: ${code}`);
          return code;
        }
      }
    } catch (error) {
      logger.warn(`获取邮件失败: ${error.message}`);
    }

    if (i < maxRetries - 1) {
      logger.info(`未找到验证码，等待 5 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw new Error("未能在规定时间内获取到验证码");
}

/**
 * 测试代理连接
 */
async function testProxyConnection(proxyConfig) {
  if (!proxyConfig.enabled) {
    return false;
  }

  try {
    
    const https = require('https');
    const url = require('url');   

    const targetUrl = 'https://www.google.com';
    logger.info(`🌐 测试目标URL: ${targetUrl}`);

    // 先构建代理URL
    let proxyUrl;
    if (proxyConfig.username && proxyConfig.password) {
      proxyUrl = `${proxyConfig.type}://${encodeURIComponent(proxyConfig.username)}:${encodeURIComponent(proxyConfig.password)}@${proxyConfig.url}:${proxyConfig.port}`;
    } else {
      proxyUrl = `${proxyConfig.type}://${proxyConfig.url}:${proxyConfig.port}`;
    }
    logger.info(`🌐 使用代理URL: ${proxyUrl.replace(/:[^:]*@/, ':***@')}`); // 隐藏密码

    // 配置axios使用代理
    const axiosConfig = {
      method: 'get',
      url: targetUrl,
      // 添加代理配置
      proxy: proxyUrl,
      // 添加HTTPS代理配置
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // 忽略证书验证
      }),
      timeout: 15000, // 15秒超时
      // 彻底解决IPv6连接问题
      family: 4, // 强制使用IPv4
      // 禁用DNS缓存，防止连接复用问题
      dnsCache: false,
      // 禁用keep-alive，防止连接复用问题
      keepAlive: false,
      // 设置本地地址为0.0.0.0，避免绑定到IPv6地址
      localAddress: '0.0.0.0',
      // 禁用自动重定向，避免重定向到IPv6地址
      maxRedirects: 0,
      // 强制使用IPv4解析器
      resolver: new (require('dns').Resolver)({ family: 4 }),
      // 添加更多请求头，模拟真实浏览器
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    const response = await axios(axiosConfig);   

    logger.info(`🌐 代理测试结果，状态码: ${response.status}`);
    // 接受2xx和3xx状态码作为成功
    if (response.status >= 200 && response.status < 400) {
      logger.info(`代理已生效`);
      return true;
    } else {
      logger.warn(`⚠️ 代理可能未生效，状态码: ${response.status}`);
      // 如果是400错误，可能是代理配置问题
      if (response.status === 400) {
        logger.warn(`💡 状态码400通常表示代理配置问题，请检查以下内容:`);
        logger.warn(`   - 代理服务器地址和端口是否正确`);
        logger.warn(`   - 用户名和密码是否正确`);
        logger.warn(`   - 代理类型是否正确 (http/https/socks5)`);
      }
      return false;
    }
  } catch (error) {      

    logger.error(`代理测试失败: ${error.message}`);
    return false;
  }
}

/**
 * 登录单个 Gemini 子号并获取 token
 */
async function loginGeminiChild(childAccount, token) {
  logger.info(`\n🔄 正在登录子号: ${childAccount.email}`);
  logger.info(`   账号ID: ${childAccount.accountId}`);
  logger.info(`   邮箱: ${childAccount.email}`);

  let browser;
  try {
    // 1. 启动浏览器
    logger.info(`   ⏳ 启动浏览器...`);

    // 获取代理配置
    const proxyConfig = getProxyConfig();
    logger.info(`   代理状态: ${proxyConfig.enabled ? '已启用' : '未启用'}`);
    
    // 创建和准备用户数据目录
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    // 根据操作系统创建临时目录路径
    const tempDir = os.tmpdir();
    const userDataDir = path.join(tempDir, `chrome_user_data_${Date.now()}`);
    
    // 确保目录存在，如果已存在则清空内容
    if (fs.existsSync(userDataDir)) {
      // 清空目录内容
      const files = fs.readdirSync(userDataDir);
      for (const file of files) {
        const filePath = path.join(userDataDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // 递归删除子目录
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          // 删除文件
          fs.unlinkSync(filePath);
        }
      }
      logger.info(`   🧹 已清空用户数据目录: ${userDataDir}`);
    } else {
      // 创建新目录
      fs.mkdirSync(userDataDir, { recursive: true });
      logger.info(`   📁 已创建用户数据目录: ${userDataDir}`);
    }
    
    // 初始化启动参数，添加防止被检测的参数
    let launchArgs = [
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // 强制使用IPv4
     
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certifcate-errors',
      '--ignore-certifcate-errors-spki-list',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-images',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-component-extensions-with-background-pages',
      '--single-process',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-logging',
      '--disable-notifications',
      '--disable-permissions-api',
      '--disable-web-resources',
      '--disable-features=AudioServiceOutOfProcess',
      '--password-store=basic',
      '--use-mock-keychain',
      '--lang=zh-CN,zh;q=0.9,en;q=0.8',
      '--window-size=1920,1080',
      `--remote-debugging-port=${Math.floor(Math.random() * 10000) + 9000}`
    ]
    
    // 定义代理验证状态，确保在后续代码中可用
    let proxyValid = true;
    
    // 如果启用了代理，验证代理并添加代理相关参数
    if (proxyConfig.enabled) {     

      // 根据代理类型构建代理服务器URL
      // 使用更稳定的代理配置方式
      let proxyServer;
      if (proxyConfig.type === 'socks5') {
        proxyServer = `socks5://${proxyConfig.url}:${proxyConfig.port}`;
      } else {
        // 对于HTTP代理，不包含认证信息，认证信息通过page.authenticate设置
        proxyServer = `${proxyConfig.type}://${proxyConfig.url}:${proxyConfig.port}`;
      }

      // 验证代理是否可用
      try {
        await testProxyConnection(proxyConfig);
      } catch (error) {
        logger.info(`   ⚠️ 代理验证出错: ${error.message}`);
      }

      // 只有在代理验证通过时才添加代理参数
      if (proxyValid) {
        // 添加代理参数
        // 对于HTTP代理，不包含认证信息，认证信息通过page.authenticate设置
        const displayProxyServer = proxyConfig.type === 'socks5' 
          ? proxyServer 
          : `${proxyConfig.type}://${proxyConfig.url}:${proxyConfig.port}`;
        
        // 添加代理相关参数
        launchArgs.push(`--proxy-server=${displayProxyServer}`);
        // 添加更多代理相关参数，确保代理连接稳定
        launchArgs.push(`--proxy-bypass-list=<-loopback>`);
        launchArgs.push(`--ignore-certificate-errors`);
        
        logger.info(`   ✓ 已添加代理参数: ${displayProxyServer}`);
        logger.info(`   ✓ 已添加代理绕过列表: <-loopback>`);
      } else {
        logger.info(`   ⚠️ 代理验证失败，将不使用代理继续执行`);
        logger.info(`   💡 提示: 如果需要使用代理，请检查代理配置或网络连接`);
      }
    }

    // 打印代理相关的启动参数
    // logger.info(`   📋 浏览器代理相关启动参数:`);
    // const proxyArgs = launchArgs.filter(arg => arg.includes('proxy') || arg.includes('--disable-ipv6') || arg.includes('--host-resolver-rules'));
    // if (proxyArgs.length > 0) {
    //   proxyArgs.forEach((arg, index) => {
    //     logger.info(`      ${index + 1}. ${arg}`);
    //   });
    // } else {
    //   logger.info(`      (无代理相关参数)`);
    // }

    browser = await puppeteer.launch({
      headless: "new", // 使用新的Headless模式
      // headless: false, // 使用新的Headless模式
      args: launchArgs,
      ignoreHTTPSErrors: true // 忽略HTTPS错误
    });

    const page = await browser.newPage();
    
    // 对于HTTP代理，需要在页面创建后立即设置认证信息
    if (proxyConfig.enabled && proxyConfig.type !== 'socks5' && proxyConfig.username && proxyConfig.password && proxyValid) {
      try {
        await page.authenticate({
          username: proxyConfig.username,
          password: proxyConfig.password
        });
        logger.info(`   ✓ 代理认证已设置`);
      } catch (authError) {
        logger.error(`   ✗ 代理认证设置失败: ${authError.message}`);
        throw new Error(`代理认证失败: ${authError.message}`);
      }
    }

    // 定义多个不同的 UserAgent，用于随机选择
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    
    // 随机选择一个 UserAgent
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    logger.info(`   🌐 使用随机 UserAgent: ${randomUserAgent}`);
    
    // 设置用户代理，避免被识别为机器人
    await page.setUserAgent(randomUserAgent);

    // 代理认证已在页面创建后立即设置，无需重复设置

    // 2. 访问 Gemini 登录页面
    logger.info(`   ⏳ 访问 Gemini 登录页面...`);
    await page.goto('https://auth.business.gemini.google/login?continueUrl=https://business.gemini.google/');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. 填入邮箱
    logger.info(`   ⏳ 填入邮箱...`);
    const emailSelector = '#email-input';
    await page.waitForSelector(emailSelector);
    await page.type(emailSelector, childAccount.email);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. 点击下一步按钮
    logger.info(`   ⏳ 点击下一步按钮...`);
    const nextButtonSelector = '#log-in-button';
    await page.click(nextButtonSelector);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 5. 等待验证码输入框出现
    logger.info(`   ⏳ 等待验证码输入框...`);
    const verificationCodeSelector = 'input[name="pinInput"]';
    await page.waitForSelector(verificationCodeSelector);

    // 6. 等待页面加载完毕，给邮件发送留出时间
    logger.info(`   ⏳ 等待邮件发送（10秒）...`);
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 7. 自动从邮箱获取验证码    
    
    const verificationCode = await waitForGeminiVerificationCode(token, childAccount.accountId);

    // 8. 自动填入验证码
    logger.info(`   ⏳ 填入验证码...`);
    // 先点击输入框聚焦
    await page.click(verificationCodeSelector);
    await new Promise(resolve => setTimeout(resolve, 500));
    // 清空输入框
    await page.evaluate((selector) => {
      document.querySelector(selector).value = '';
    }, verificationCodeSelector);
    // 使用 type 方法逐字输入
    await page.type(verificationCodeSelector, verificationCode, { delay: 100 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 9. 点击验证按钮
    logger.info(`   ⏳ 点击验证按钮...`);
    const verifyButtonSelector = 'button[aria-label="验证"]';
    await page.click(verifyButtonSelector);
    await new Promise(resolve => setTimeout(resolve, 3000));

    logger.info(`   ✓ 验证完成，等待页面跳转...`);

    // 等待页面跳转，处理两种情况：先出现/create然后出现/cid/，或直接出现/cid/
    logger.info(`   ⏳ 等待页面跳转（最多120秒）...`);

    const maxWaitTime = 60000; // 120秒
    const startTime = Date.now();
    let currentUrl = page.url();
    let hasSeenCreate = currentUrl.includes('/admin/create');

    while ((!currentUrl.includes('/cid/') || currentUrl.includes('/admin/create')) && (Date.now() - startTime) < maxWaitTime) {
      logger.info(`      当前 URL: ${currentUrl}`);

      if (currentUrl.includes('/create')) {
        logger.info(`      检测到URL包含/create，等待跳转...`);
        hasSeenCreate = true;
        break;
      } else if (currentUrl.includes('/cid/')) {
        hasSeenCreate = false;
        logger.info(`URL包含/cid/，等待跳转...`);
        break;

      } else {
        logger.info(`      未知页面...`);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
      currentUrl = page.url();
    }

    if (currentUrl.includes('/admin/create')) {
      logger.info(`   ⚠️ 等待超时，URL仍包含/create，停止执行`);

      // 11. 填入名称
      logger.info(`   ⏳ 填入名称...`);
      const nameSelector = '#mat-input-0';
      await page.waitForSelector(nameSelector);
      await page.type(nameSelector, childAccount.email);
      await new Promise(resolve => setTimeout(resolve, 3000));
     // 9. 点击按钮
      logger.info(`   ⏳ 点击按钮...`);
      const ButtonSelector = 'body > saasfe-root > main > saasfe-onboard-component > div > div > div > form > button > span.mdc-button__label';
      await page.click(ButtonSelector)
      await new Promise(resolve => setTimeout(resolve, 3000));
      const startTime1 = Date.now();
      let currentUrl1 = page.url();

      while (!currentUrl1.includes('/cid/') && (Date.now() - startTime1) < maxWaitTime) {
        logger.info(`      当前 URL: ${currentUrl1}`);
        logger.info(`      等待跳转到聊天页面...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        currentUrl = page.url();
      }
       // 再等待一段时间确保页面完全加载
      logger.info(`   ⏳ 页面已跳转，等待完全加载（10秒）...`);
      await new Promise(resolve => setTimeout(resolve, 10000));

      // 11. 获取 4 个 token
      logger.info(`   ⏳ 获取 token...`);

      try {
        const tokens = await getLoginTokens(page);
        // 使用获取到的 tokens 进行后续操作
        logger.info('获取到的 tokens:', tokens);
        return tokens;
      } catch (error) {
        logger.error('获取 tokens 失败:', error.message);
        // 处理错误情况
      }
    }else{
       // 再等待一段时间确保页面完全加载
      logger.info(`   ⏳ 页面已跳转，等待完全加载（10秒）...`);
      await new Promise(resolve => setTimeout(resolve, 10000));

      // 11. 获取 4 个 token
      logger.info(`   ⏳ 获取 token...`);

      try {
        const tokens = await getLoginTokens(page);
        // 使用获取到的 tokens 进行后续操作
        logger.info('获取到的 tokens:', tokens);
        return tokens;
      } catch (error) {
        logger.error('获取 tokens 失败:', error.message);
        // 处理错误情况
      }
    }
  } catch (error) {
    logger.error(`登录子号失败: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 获取登录后的 tokens
 * @param {Object} page - Puppeteer 页面对象
 * @returns {Promise<Object>} 包含 tokens 的对象
 */
async function getLoginTokens(page) {
  logger.info(`   ⏳ 获取 token...`);

  // 获取所有 cookies
  const cookies = await page.cookies();

  // 从 cookies 中提取需要的值
  const secure_c_ses = cookies.find(c => c.name === '__Secure-C_SES')?.value || null;
  const host_c_oses = cookies.find(c => c.name === '__Host-C_OSES')?.value || '';

  // 从 URL 中提取 csesidx 和 team_id (config_id)
  const currentUrl = page.url();
  const urlParams = new URLSearchParams(new URL(currentUrl).search);
  const csesidx = urlParams.get('csesidx') || null;

  // 从 URL 路径中提取 team_id (在 /cid/ 后面)
  const pathMatch = currentUrl.match(/\/cid\/([^/?]+)/);
  const team_id = pathMatch ? pathMatch[1] : null;

  // 验证是否获取到所有必需的 token
  if (!secure_c_ses || !csesidx || !team_id) {
    logger.info(`   ⚠️  Token 获取不完整:`);
    logger.info(`      secure_c_ses: ${secure_c_ses ? '✓' : '✗'}`);
    logger.info(`      csesidx: ${csesidx ? '✓' : '✗'}`);
    logger.info(`      team_id: ${team_id ? '✓' : '✗'}`);
    logger.info(`      host_c_oses: ${host_c_oses ? '✓' : '✗'}`);
    logger.info(`      当前 URL: ${currentUrl}`);
    throw new Error('Token 获取不完整，请检查登录流程');
  }

  const tokens = {
    csesidx: csesidx,
    host_c_oses: host_c_oses,
    secure_c_ses: secure_c_ses,
    team_id: team_id,
  };

  logger.info(`   ✓ 登录成功，获取到 4 个 token`);
  logger.info(`      csesidx: ${csesidx.substring(0, 20)}...`);
  logger.info(`      team_id: ${team_id}`);
  logger.info(`      secure_c_ses: ${secure_c_ses.substring(0, 20)}...`);
  logger.info(`      host_c_oses: ${host_c_oses ? host_c_oses.substring(0, 20) + '...' : '(空)'}`);

  return tokens;
}

/**
 * 自动刷新所有Gemini账户的令牌
 */
async function autoRefreshGeminiTokens(loginEmail, token) {
  try {
    // 加载Gemini配置
    const geminiConfig = loadGeminiMailConfig();
    const children = geminiConfig.accounts.children || [];

    if (children.length === 0) {
      throw new Error('gemini-mail.yaml 中没有子账户，请先选择账户');
    }

    logger.info(`准备刷新 ${children.length} 个账户的令牌...${token} `);

    // 验证母号是否匹配
    const parent = geminiConfig.accounts.parent;
    if (!parent || parent.email !== loginEmail) {
      logger.warn(`母号不匹配！配置文件中的母号: ${parent?.email}, 当前登录的母号: ${loginEmail}`);
      throw new Error('母号不匹配，请检查配置');
    }

    // 刷新每个子账户的令牌
    let successCount = 0;
    let failureCount = 0;

    for (const child of children) {
      try {
        logger.info(`正在刷新账户: ${child.email}`);

        // 登录并获取新令牌
        const tokens = await loginGeminiChild(child, token);

        // 更新配置中的令牌
        child.tokens = {
          csesidx: tokens.csesidx || '',
          host_c_oses: tokens.host_c_oses || '',
          secure_c_ses: tokens.secure_c_ses || '',
          team_id: tokens.team_id || ''
        };
        child.lastUpdated = new Date().toISOString();

        successCount++;
        logger.info(`账户 ${child.email} 令牌刷新成功`);

        // 添加延迟，避免请求过快
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        failureCount++;
        logger.error(`账户 ${child.email} 令牌刷新失败: ${error.message}`);
      }
    }

    // 保存更新后的配置
    saveGeminiMailConfig(geminiConfig);

    logger.info(`令牌刷新完成: 成功 ${successCount} 个，失败 ${failureCount} 个`);
    return { successCount, failureCount };
  } catch (error) {
    logger.error(`自动刷新令牌失败: ${error.message}`);
    throw error;
  }
}

/**
 * 更新Gemini Pool的账户（删除所有并重新添加）
 */
async function updateGeminiPool() {
  try {
    // 1. 读取 gemini-mail.yaml
    logger.info('读取账户信息...');
    const geminiConfig = loadGeminiMailConfig();
    const poolApiUrl = geminiConfig.poolApiUrl;
    const password = geminiConfig.password;
    const accounts = geminiConfig.accounts;

    if (!accounts.children || accounts.children.length === 0) {
      logger.error('gemini-mail.yaml 中没有子账户，请先选择账户');
      return;
    }
    logger.info('登录获取 token...',poolApiUrl, password);
    // 2. 登录获取 token
    const adminToken = await loginGeminiPool(poolApiUrl, password);
  
    // 3. 删除所有账户
    await deleteAllAccounts(poolApiUrl, adminToken);

    // 4. 添加所有账户
    await addAllAccounts(poolApiUrl, accounts, adminToken);

    logger.info('\n✓ 所有任务完成！');
    
    // 获取最终账户总数并返回结果
    const finalAccounts = await getPoolAccounts(poolApiUrl, adminToken);
    return { totalCount: finalAccounts.length };
  } catch (error) {
    logger.error(`更新Gemini Pool失败: ${error.message}`);
    throw error;
  }
}

/**
 * 删除所有账户
 */
async function deleteAllAccounts(poolApiUrl, adminToken) {
  try {
    // 获取所有账户
    const accounts = await getPoolAccounts(poolApiUrl, adminToken);

    if (accounts.length === 0) {
      logger.info('平台上没有账户需要删除');
      return 0;
    }

    logger.info(`\n开始删除所有账户（共 ${accounts.length} 个）...`);

    let deletedCount = 0;

    for (const account of accounts) {
      const accountId = account.id;
      logger.info(`正在删除账户 ID ${accountId}...`);

      const deleted = await deleteAccount(poolApiUrl, accountId, adminToken);
      if (deleted) {
        logger.info(`账户 ${accountId} 已删除`);
        deletedCount++;
      } else {
        logger.warn(`账户 ${accountId} 删除失败`);
      }

      // 添加小延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    logger.info(`\n=== 删除完成 ===`);
    logger.info(`已删除: ${deletedCount}/${accounts.length} 个账户`);

    return deletedCount;

  } catch (error) {
    logger.error('删除账户失败:', error.message);
    throw error;
  }
}

/**
 * 添加所有账户
 */
async function addAllAccounts(poolApiUrl, yamlAccounts, adminToken) {
  try {
    logger.info('\n=== 开始添加账户 ===');

    let addedCount = 0;
    let skippedCount = 0;

    // 遍历 YAML 中的子账户
    if (yamlAccounts.children && yamlAccounts.children.length > 0) {
      for (const child of yamlAccounts.children) {
        // 检查账户是否有临时标记或没有tokens
        if (!child.tokens || child.skipReason) {
          const reason = child.skipReason || '没有tokens信息';
          logger.info(`\n跳过账户 ${child.email}: ${reason}`);
          
          // 如果没有标记但有tokens问题，添加临时标记
          if (!child.tokens && !child.skipReason) {
            child.skipReason = '没有tokens信息';
            child.skipTime = new Date().toISOString();
          }
          
          skippedCount++;
          continue;
        }

        const accountData = {
          team_id: child.tokens.team_id,
          secure_c_ses: child.tokens.secure_c_ses,
          host_c_oses: child.tokens.host_c_oses,
          csesidx: child.tokens.csesidx,
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
        };

        logger.info(`\n正在添加账户 ${child.email}...`);
        const success = await addAccount(poolApiUrl, accountData, adminToken);

        if (success) {
          logger.info(`账户 ${child.email} 添加成功`);
          addedCount++;
        } else {
          logger.warn(`账户 ${child.email} 添加失败`);
        }

        // 添加小延迟
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 获取最终账户总数
    const finalAccounts = await getPoolAccounts(poolApiUrl, adminToken);

    logger.info('\n=== 添加完成 ===');
    logger.info(`成功添加: ${addedCount}`);
    logger.info(`跳过: ${skippedCount}`);
    logger.info(`当前总数: ${finalAccounts.length}`);

    return { addedCount, skippedCount, totalCount: finalAccounts.length };

  } catch (error) {
    logger.error('添加账户失败:', error.message);
    throw error;
  }
}

/**
 * 清理无效账户
 */
async function cleanInvalidAccounts() {
  try {
    const config = loadGeminiMailConfig();
    const poolUrl = config.poolApiUrl;
    const password = config.password;

    if (!password) {
      throw new Error('gemini-mail.yaml 中未配置密码');
    }

    logger.info('正在登录 Gemini Pool 平台...');
    const adminToken = await loginGeminiPool(poolUrl, password);
    logger.info('登录成功！');

    logger.info('正在获取平台账户列表...');
    const accounts = await getPoolAccounts(poolUrl, adminToken);
    logger.info(`找到 ${accounts.length} 个平台账户`);

    if (accounts.length === 0) {
      logger.info('平台上没有账户');
      return { validCount: 0, invalidCount: 0 };
    }

    logger.info('开始检测账户有效性...');
    let validCount = 0;
    let invalidCount = 0;

    for (const account of accounts) {
      const accountId = account.id;
      logger.info(`检测账户 ID ${accountId}...`);

      const isValid = await testAccount(poolUrl, accountId, adminToken);

      if (isValid) {
        logger.info(`账户 ${accountId} 可用`);
        validCount++;
      } else {
        logger.info(`账户 ${accountId} 不可用，正在删除...`);
        const deleted = await deleteAccount(poolUrl, accountId, adminToken);
        if (deleted) {
          logger.info(`账户 ${accountId} 已删除`);
          invalidCount++;
        } else {
          logger.warn(`账户 ${accountId} 删除失败`);
        }
      }

      // 添加小延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info(`清理完成: 存活账户 ${validCount}/${accounts.length}，已删除 ${invalidCount} 个无效账户`);
    return { validCount, invalidCount };
  } catch (error) {
    logger.error(`清理无效账户失败: ${error.message}`);
    throw error;
  }
}

/**
 * 选择Business账户
 */
async function selectBusinessAccounts(accountIds) {
  try {
    // 加载temp-mail.yaml中的所有子号
    const tempMailConfig = require('../utils/config').loadTempMailConfig();
    const children = tempMailConfig.accounts.children || [];

    if (children.length === 0) {
      throw new Error('没有找到任何子号，请先在邮箱管理中创建子号');
    }

    // 读取 gemini-mail.yaml 的配置
    const geminiConfig = loadGeminiMailConfig();
    const poolApiUrl = geminiConfig.poolApiUrl;
    const password = geminiConfig.password || '';

    // 根据ID选择子账户
    const selectedChildren = [];
    for (const id of accountIds) {
      const index = parseInt(id, 10) - 1;
      if (index >= 0 && index < children.length) {
        selectedChildren.push(children[index]);
      }
    }

    if (selectedChildren.length === 0) {
      throw new Error('没有选择任何有效的账号');
    }

    // 保存到 gemini-mail.yaml（清空原有列表）
    const newGeminiConfig = {
      ...geminiConfig,
      accounts: {
        parent: tempMailConfig.accounts.parent,
        children: selectedChildren
      }
    };

    saveGeminiMailConfig(newGeminiConfig);

    logger.info(`已选择 ${selectedChildren.length} 个账号并保存到 gemini-mail.yaml`);
    return selectedChildren;
  } catch (error) {
    logger.error(`选择Business账户失败: ${error.message}`);
    throw error;
  }
}

module.exports = {
  loginGeminiPool,
  getPoolAccounts,
  testAccount,
  deleteAccount,
  addAccount,
  autoRefreshGeminiTokens,
  updateGeminiPool,
  cleanInvalidAccounts,
  selectBusinessAccounts
};