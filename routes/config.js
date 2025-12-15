const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const router = express.Router();

// 配置文件路径映射
const configFiles = {
    'gemini-mail': path.join(__dirname, '../config/gemini-mail.yaml'),
    'proxy': path.join(__dirname, '../config/proxy.yaml'),
    'temp-mail': path.join(__dirname, '../config/temp-mail.yaml')
};

/**
 * GET /api/config/:configName
 * 获取指定配置文件内容
 */
router.get('/:configName', async (req, res, next) => {
    try {
        const { configName } = req.params;

        // 检查配置是否存在
        if (!configFiles[configName]) {
            return res.status(404).json({
                error: '配置文件不存在',
                configName
            });
        }

        // 读取配置文件
        const configContent = await fs.readFile(configFiles[configName], 'utf8');

        // 设置响应头为纯文本
        res.setHeader('Content-Type', 'text/plain');
        res.status(200).send(configContent);
    } catch (error) {
        logger.error(`读取配置文件失败: ${error.message}`);
        next(error);
    }
});

/**
 * POST /api/config/:configName
 * 保存指定配置文件内容
 */
router.post('/:configName', async (req, res, next) => {
    try {
        const { configName } = req.params;

        // 检查配置是否存在
        if (!configFiles[configName]) {
            return res.status(404).json({
                error: '配置文件不存在',
                configName
            });
        }

        // 获取请求体中的配置内容
        let configContent;
        
        // 支持text/plain和application/json格式
        if (typeof req.body === 'string') {
            configContent = req.body;
        } else if (req.body && req.body.content) {
            configContent = req.body.content;
        } else {
            configContent = '';
        }

        // 验证内容不为空
        if (!configContent || configContent.trim() === '') {
            return res.status(400).json({
                error: '配置内容不能为空'
            });
        }

        // 备份原配置文件
        const backupPath = configFiles[configName] + '.backup';
        await fs.copyFile(configFiles[configName], backupPath);
        logger.info(`已备份配置文件: ${backupPath}`);

        // 写入新配置
        await fs.writeFile(configFiles[configName], configContent, 'utf8');
        logger.info(`配置文件已更新: ${configName}`);

        res.status(200).json({
            success: true,
            message: '配置保存成功'
        });
    } catch (error) {
        logger.error(`保存配置文件失败: ${error.message}`);
        next(error);
    }
});

module.exports = router;
