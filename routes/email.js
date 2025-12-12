const express = require('express');
const Joi = require('joi');
const { 
  getAllEmailAccounts, 
  createEmailAccount, 
  deleteEmailAccount,
  getLatestVerificationCode
} = require('../services/emailService');
const { loginEmailService } = require('../services/emailService');
const logger = require('../utils/logger');

const router = express.Router();

// 验证参数模式
const accountIdSchema = Joi.object({
  accountId: Joi.number().integer().positive().required().messages({
    'number.base': '账户ID必须是数字',
    'number.integer': '账户ID必须是整数',
    'number.positive': '账户ID必须是正数',
    'any.required': '账户ID是必填项'
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
 * GET /api/email/accounts
 * 获取所有邮箱账户
 */
router.get('/accounts', getEmailToken, async (req, res, next) => {
  try {
    const { parent, children } = await getAllEmailAccounts(req.emailToken);

    res.status(200).json({
      success: true,
      data: {
        parent,
        children,
        total: children.length + 1
      }
    });
  } catch (error) {
    logger.error(`获取邮箱账户失败: ${error.message}`);
    next(error);
  }
});

/**
 * POST /api/email/accounts
 * 创建新的邮箱账户
 */
router.post('/accounts', getEmailToken, async (req, res, next) => {
  try {
    const account = await createEmailAccount(req.emailToken);

    res.status(201).json({
      success: true,
      message: '账户创建成功',
      data: account
    });
  } catch (error) {
    logger.error(`创建邮箱账户失败: ${error.message}`);
    next(error);
  }
});

/**
 * DELETE /api/email/accounts/:accountId
 * 删除邮箱账户
 */
router.delete('/accounts/:accountId', getEmailToken, async (req, res, next) => {
  try {
    // 验证参数
    const { error, value } = accountIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json({
        error: '请求参数验证失败',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    const { accountId } = value;
    const result = await deleteEmailAccount(req.emailToken, accountId);

    res.status(200).json({
      success: true,
      message: '账户删除成功',
      data: result
    });
  } catch (error) {
    logger.error(`删除邮箱账户失败: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/email/accounts/:accountId/verification-code
 * 获取账户的最新验证码
 */
router.get('/accounts/:accountId/verification-code', getEmailToken, async (req, res, next) => {
  try {
    // 验证参数
    const { error, value } = accountIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json({
        error: '请求参数验证失败',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    const { accountId } = value;
    const verificationInfo = await getLatestVerificationCode(req.emailToken, accountId);

    res.status(200).json({
      success: true,
      data: verificationInfo
    });
  } catch (error) {
    logger.error(`获取验证码失败: ${error.message}`);
    next(error);
  }
});

module.exports = router;
