# Gemini API Service 快速开始指南

本指南将帮助您快速配置和启动Gemini API服务。

## 1. 必要配置

### 修改Gemini Pool地址

打开 `config/gemini-mail.yaml` 文件，找到以下行：

```yaml
poolApiUrl: https://your-gemini-pool-domain.com  # 请替换为实际的Gemini Pool服务地址
```

将 `https://your-gemini-pool-domain.com` 替换为您实际的Gemini Pool服务地址。

### 配置邮箱服务

打开 `config/temp-mail.yaml` 文件，确保以下配置正确：

```yaml
credentials:
  account: your_email_account
  password: your_email_password
  defaultDomain: "@your-domain.com"
  emailApiUrl: https://your-email-api.com
```

## 2. 启动服务

```bash
# 安装依赖
npm install

# 启动服务
npm start
```

服务将在 http://localhost:3000 上运行。

## 3. 验证配置

1. 访问健康检查接口：
```bash
curl http://localhost:3000/health
```

2. 登录邮箱服务获取令牌：
```bash
curl -X POST http://localhost:3000/api/auth/login   -H "Content-Type: application/json"   -d '{
    "account": "your_email_account",
    "password": "your_email_password"
  }'
```

## 4. 常见问题

### "请将gemini-mail.yaml中的poolApiUrl替换为实际的Gemini Pool服务地址"

这个错误表示您仍在使用示例URL。请按照步骤1修改配置文件。

### "无法连接到Gemini Pool平台"

检查以下几点：
1. 确认Gemini Pool服务地址正确
2. 确认Gemini Pool服务正在运行
3. 检查网络连接和防火墙设置

### "邮箱服务认证失败"

检查以下几点：
1. 确认temp-mail.yaml中的邮箱凭据正确
2. 确认邮箱API地址可访问

## 5. API使用示例

获取令牌后，您可以使用以下命令测试API：

```bash
# 获取邮箱账户列表
curl -X GET http://localhost:3000/api/email/accounts   -H "Authorization: your_token_here"

# 刷新Gemini令牌
curl -X POST http://localhost:3000/api/gemini/refresh-tokens   -H "Authorization: your_token_here"
```

## 6. 下一步

- 阅读 [CONFIG.md](CONFIG.md) 了解详细配置选项
- 查看 [README.md](README.md) 了解完整的API文档
- 使用Postman或其他API客户端测试所有接口

---

需要帮助？请查看日志文件 `logs/combined.log` 和 `logs/error.log` 获取更多信息。
