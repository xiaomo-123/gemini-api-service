const axios = require('axios');
const { getEmailCredentials, loadTempMailConfig, saveTempMailConfig } = require('../utils/config');
const logger = require('../utils/logger');

/**
 * 登录邮箱服务
 */
async function loginEmailService() {
  try {
    const { emailApiUrl, loginEmail, password } = getEmailCredentials();
    const LOGIN_URL = `${emailApiUrl}/api/login`;

    logger.info(`正在登录邮箱服务: ${loginEmail}`);

    const response = await axios.post(LOGIN_URL, {
      email: loginEmail,
      password
    });

    if (response.data.code !== 200 || !response.data.data?.token) {
      throw new Error(`登录失败: ${response.data.message || '未知错误'}`);
    }

    logger.info('邮箱服务登录成功');
    return response.data.data.token;
  } catch (error) {
    logger.error(`邮箱服务登录失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取所有邮箱账户
 */
async function getAllEmailAccounts(token) {
  try {
    const { emailApiUrl } = getEmailCredentials();
    const ACCOUNT_LIST_URL = `${emailApiUrl}/api/account/list?accountId=0&size=100`;

    logger.info('正在获取邮箱账户列表');

    const response = await axios.get(ACCOUNT_LIST_URL, {
      headers: {
        Authorization: token
      }
    });

    if (response.data.code !== 200 || !Array.isArray(response.data.data)) {
      throw new Error(`获取邮箱列表失败: ${response.data.message || '未知错误'}`);
    }

    const accountList = response.data.data;
    const { loginEmail } = getEmailCredentials();
    const { parent, children } = splitAccounts(accountList, loginEmail);

    // 保存账户快照
    saveTempMailConfig({
      ...loadTempMailConfig(),
      accounts: {
        parent,
        children,
        lastUpdated: new Date().toISOString()
      }
    });

    logger.info(`已获取母号 ${parent.email} 和 ${children.length} 个子号`);
    return { parent, children };
  } catch (error) {
    logger.error(`获取邮箱账户失败: ${error.message}`);
    throw error;
  }
}

/**
 * 创建新的邮箱账户
 */
async function createEmailAccount(token) {
  try {
    const { emailApiUrl, defaultDomain } = getEmailCredentials();
    const CREATE_ACCOUNT_URL = `${emailApiUrl}/api/account/add`;

    // 生成随机邮箱名
    function generateRandomName(length = 15) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }

    const randomName = generateRandomName(15);
    const email = `${randomName}${defaultDomain}`;

    logger.info(`正在创建新子号: ${email}`);

    const response = await axios.post(CREATE_ACCOUNT_URL, {
      email: email,
      token: ''
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      }
    });

    if (response.data.code !== 200 || !response.data.data) {
      throw new Error(`创建子号失败: ${response.data.message || '未知错误'}`);
    }

    const accountData = response.data.data;
    logger.info(`子号创建成功: ${accountData.email}`);
    return accountData;
  } catch (error) {
    logger.error(`创建邮箱账户失败: ${error.message}`);
    throw error;
  }
}

/**
 * 删除邮箱账户
 */
async function deleteEmailAccount(token, accountId) {
  try {
    const { emailApiUrl } = getEmailCredentials();
    const DELETE_ACCOUNT_URL = `${emailApiUrl}/api/account/delete`;

    logger.info(`正在删除账号 ID: ${accountId}`);

    const response = await axios.delete(`${DELETE_ACCOUNT_URL}?accountId=${accountId}`, {
      headers: {
        'Authorization': token
      }
    });

    if (response.data.code !== 200) {
      throw new Error(`删除账号失败: ${response.data.message || '未知错误'}`);
    }

    logger.info(`账号 ID ${accountId} 删除成功`);
    return response.data;
  } catch (error) {
    logger.error(`删除邮箱账户失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取账户邮件列表
 */
async function getEmailList(token, accountId, size = 5) {
  try {
    const { emailApiUrl } = getEmailCredentials();
    const EMAIL_LIST_URL = `${emailApiUrl}/api/email/list`;

    const url = `${EMAIL_LIST_URL}?accountId=${accountId}&emailId=0&timeSort=0&size=${size}&type=0`;

    const response = await axios.get(url, {
      headers: {
        'Authorization': token
      }
    });

    if (response.data.code !== 200) {
      throw new Error(`获取邮件列表失败: ${response.data.message || '未知错误'}`);
    }

    return response.data.data;
  } catch (error) {
    logger.error(`获取邮件列表失败: ${error.message}`);
    throw error;
  }
}

/**
 * 从邮件主题中提取验证码
 */
function extractVerificationCode(subject) {
  // 匹配 "你的 ChatGPT 代码为 XXXXXX" 格式
  const match = subject.match(/(?:代码为|code is|código es)\s*(\d{6})/i);
  return match ? match[1] : null;
}

/**
 * 查找最新的验证码邮件
 */
function findLatestVerificationCode(emailList) {
  if (!emailList || emailList.length === 0) {
    return null;
  }

  // 遍历邮件列表，查找包含验证码的邮件
  for (const email of emailList) {
    const code = extractVerificationCode(email.subject);
    if (code) {
      return {
        code: code,
        time: email.createTime,
        subject: email.subject,
        from: email.name || email.sendEmail,
      };
    }
  }

  return null;
}

/**
 * 获取最新登录验证码
 */
async function getLatestVerificationCode(token, accountId) {
  try {
    logger.info(`正在获取账户 ID ${accountId} 的最新邮件`);

    // 获取邮件列表
    const emailData = await getEmailList(token, accountId, 10);

    if (!emailData.list || emailData.list.length === 0) {
      throw new Error('该账号暂无邮件');
    }

    // 查找验证码
    const verificationInfo = findLatestVerificationCode(emailData.list);

    if (!verificationInfo) {
      throw new Error('未找到 ChatGPT 验证码邮件');
    }

    logger.info(`找到验证码: ${verificationInfo.code}`);
    return verificationInfo;
  } catch (error) {
    logger.error(`获取验证码失败: ${error.message}`);
    throw error;
  }
}

/**
 * 分割母号和子号
 */
function splitAccounts(list, loginEmail) {
  const children = [];
  let parent = null;

  for (const item of list) {
    if (!parent && item.email === loginEmail) {
      parent = item;
      continue;
    }
    children.push(item);
  }

  if (!parent) {
    parent = {
      email: loginEmail,
      accountId: null,
      name: '',
      status: null,
      latestEmailTime: '',
      createTime: new Date().toISOString(),
    };
  }

  return { parent, children };
}

module.exports = {
  loginEmailService,
  getAllEmailAccounts,
  createEmailAccount,
  deleteEmailAccount,
  getEmailList,
  getLatestVerificationCode,
  splitAccounts
};
