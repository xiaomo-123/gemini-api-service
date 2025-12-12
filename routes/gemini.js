const express = require('express');
const Joi = require('joi');
const { 
  loginEmailService 
} = require('../services/emailService');
const { 
  autoRefreshGeminiTokens,
  updateGeminiPool,
  cleanInvalidAccounts,
  selectBusinessAccounts
} = require('../services/geminiService');
const { loadGeminiMailConfig, loadTempMailConfig } = require('../utils/config');
const logger = require('../utils/logger');

const router = express.Router();

// 验证参数模式
const accountIdsSchema = Joi.object({
  accountIds: Joi.array().items(Joi.number().integer().positive()).min(1).required().messages({
    'array.base': '账户ID列表必须是数组',
    'array.min': '至少需要选择一个账户',
    'any.required': '账户ID列表是必填项'
  })
});

/**
 * 中间件：获取并验证邮箱服务令牌
 */
async function getEmailToken(req, res, next) {
  try {
    // 如果请求头中有令牌，直接使用
    if (req.headers.authorization) {
      req.emailToken = req.headers.authorization;
      return next();
    }

    // 否则尝试登录获取新令牌
    const token = await loginEmailService();
    req.emailToken = token;
    next();
  } catch (error) {
    logger.error(`获取邮箱令牌失败: ${error.message}`);
    res.status(401).json({
      error: '邮箱服务认证失败',
      message: error.message
    });
  }
}

/**
 * GET /api/gemini/accounts
 * 获取Gemini配置中的所有账户
 */
router.get('/accounts', async (req, res, next) => {
  try {
    const geminiConfig = loadGeminiMailConfig();
    const { parent, children } = geminiConfig.accounts;

    res.status(200).json({
      success: true,
      data: {
        parent,
        children,
        total: children.length + 1
      }
    });
  } catch (error) {
    logger.error(`获取Gemini账户失败: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/gemini/temp-accounts
 * 获取临时邮箱中的所有账户（用于选择Business账户）
 */
router.get('/temp-accounts', async (req, res, next) => {
  try {
    const tempMailConfig = loadTempMailConfig();
    const { parent, children } = tempMailConfig.accounts;

    // 只返回必要信息，不包含敏感数据
    const safeChildren = children.map(child => ({
      email: child.email,
      accountId: child.accountId,
      name: child.name,
      status: child.status,
      createTime: child.createTime
    }));

    res.status(200).json({
      success: true,
      data: {
        parent: {
          email: parent.email,
          accountId: parent.accountId,
          name: parent.name,
          status: parent.status,
          createTime: parent.createTime
        },
        children: safeChildren,
        total: safeChildren.length + 1
      }
    });
  } catch (error) {
    logger.error(`获取临时邮箱账户失败: ${error.message}`);
    next(error);
  }
});

/**
 * POST /api/gemini/select-accounts
 * 选择Business账户
 */
router.post('/select-accounts', async (req, res, next) => {
  try {
    // 验证请求数据
    const { error, value } = accountIdsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: '请求参数验证失败',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    const { accountIds } = value;
    const selectedChildren = await selectBusinessAccounts(accountIds);

    res.status(200).json({
      success: true,
      message: `已选择 ${selectedChildren.length} 个Business账户`,
      data: {
        count: selectedChildren.length,
        accounts: selectedChildren.map(child => ({
          email: child.email,
          accountId: child.accountId
        }))
      }
    });
  } catch (error) {
    logger.error(`选择Business账户失败: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/gemini/refresh-tokens
 * 刷新所有Gemini账户的令牌
 */
router.get('/refresh-tokens', async (req, res, next) => {
  try {
    // 步骤1: 获取邮箱服务令牌
    logger.info('\n📋 步骤 1: 获取邮箱服务令牌...');
    const emailToken = await loginEmailService();
    
    // 步骤2: 获取子号列表
    logger.info('\n📋 步骤 2: 获取子号列表');
    const { loginEmail } = require('../utils/config').getEmailCredentials();
    const geminiConfig = require('../utils/config').loadGeminiMailConfig();
    const children = geminiConfig.accounts.children || [];
    logger.info(`找到 ${children.length} 个子账户`);
    
    // 步骤3: 刷新所有子账户的令牌
    logger.info('\n📋 步骤 3: 开始刷新所有子账户的令牌...');
    const result = await autoRefreshGeminiTokens(loginEmail, emailToken);
    
    // 步骤4: 同步到 Gemini Pool（删除所有并重新添加）
    logger.info('\n📋 步骤 4: 同步 Token 到 Gemini Pool 平台...');
    logger.info('='.repeat(50));
    const poolResult = await updateGeminiPool();

    res.status(200).json({
      success: true,
      message: '令牌刷新完成并已同步到Gemini Pool',
      data: {
        refreshResult: result,
        poolResult: poolResult
      }
    });
  } catch (error) {
    logger.error(`刷新Gemini令牌失败: ${error.message}`);
    next(error);
  }
});

/**
 * POST /api/gemini/update-pool
 * 更新Gemini Pool（删除所有账户并重新添加）
 */
router.post('/update-pool', async (req, res, next) => {
  try {
    const result = await updateGeminiPool();

    res.status(200).json({
      success: true,
      message: 'Gemini Pool更新完成',
      data: result
    });
  } catch (error) {
    logger.error(`更新Gemini Pool失败: ${error.message}`);
    next(error);
  }
});

/**
 * POST /api/gemini/clean-invalid
 * 清理无效账户
 */
router.post('/clean-invalid', async (req, res, next) => {
  try {
    const result = await cleanInvalidAccounts();

    res.status(200).json({
      success: true,
      message: '无效账户清理完成',
      data: result
    });
  } catch (error) {
    logger.error(`清理无效账户失败: ${error.message}`);
    next(error);
  }
});

module.exports = router;
