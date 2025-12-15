const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('./utils/logger');

// 导入路由
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/email');
const geminiRoutes = require('./routes/gemini');
const configRoutes = require('./routes/config');

// 创建Express应用
const app = express();

// 安全中间件
app.use(helmet({
  crossOriginOpenerPolicy: false,
  originAgentCluster: false
}));

// CORS配置
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// 添加text/plain请求体解析
app.use(express.text({ type: 'text/plain', limit: '10mb' }));

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 限制每个IP 15分钟内最多100个请求
  message: {
    error: '请求过于频繁，请稍后再试'
  }
});
app.use('/api/', limiter);

// 请求日志
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// 健康检查
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 静态文件服务 - 提供web管理页面
app.use('/web', express.static(path.join(__dirname, 'web')));

// 主页重定向到管理页面
app.get('/', (req, res) => {
  res.redirect('/web');
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/api/config', configRoutes);

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: '未找到请求的资源',
    path: req.originalUrl
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error(err.stack);

  // Joi验证错误
  if (err.isJoi) {
    return res.status(400).json({
      error: '请求参数验证失败',
      details: err.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }

  // 默认错误
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误'
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`Gemini API服务已启动，端口: ${PORT}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，正在关闭服务器...');
  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
});

module.exports = app;
