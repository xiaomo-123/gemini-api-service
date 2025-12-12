const express = require('express');
const Joi = require('joi');
const { loginEmailService } = require('../services/emailService');
const logger = require('../utils/logger');

const router = express.Router();

// 登录验证模式
const loginSchema = Joi.object({
  account: Joi.string().required().messages({
    'string.empty': '账号不能为空',
    'any.required': '账号是必填项'
  }),
  password: Joi.string().required().messages({
    'string.empty': '密码不能为空',
    'any.required': '密码是必填项'
  }),
  defaultDomain: Joi.string().optional(),
  emailApiUrl: Joi.string().optional()
});

/**
 * POST /api/auth/login
 * 登录邮箱服务
 */
router.post('/login', async (req, res, next) => {
  try {
    // 验证请求数据
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: '请求参数验证失败',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    // 登录邮箱服务
    const token = await loginEmailService();

    res.status(200).json({
      success: true,
      message: '登录成功',
      data: {
        token
      }
    });
  } catch (error) {
    logger.error(`登录失败: ${error.message}`);
    next(error);
  }
});

module.exports = router;
