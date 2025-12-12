# Gemini API Service 配置指南

## 配置文件说明

Gemini API服务使用三个主要的配置文件，位于`config`目录下：

1. `temp-mail.yaml` - 邮箱服务配置
2. `gemini-mail.yaml` - Gemini账户配置
3. `proxy.yaml` - 代理配置（可选）

## gemini-mail.yaml 配置

这是最重要的配置文件，包含Gemini账户和Pool平台信息：

```yaml
# Gemini Pool平台地址 - 必须替换为实际地址
poolApiUrl: https://your-gemini-pool-domain.com  # 请替换为实际的Gemini Pool服务地址

# 管理员密码
password: 'your_admin_password'

# 账户信息
accounts:
  parent:
    accountId: 1
    email: admin@example.com
    name: admin
    # ... 其他字段
  children:
    - accountId: 17
      email: child1@example.com
      name: child1
      # ... 其他字段
      tokens:
        csesidx: '...'
        host_c_oses: '...'
        secure_c_ses: '...'
        team_id: '...'
      lastUpdated: '2023-12-12T01:58:35.693Z'
    # ... 更多子账户
```

### 重要配置项

1. **poolApiUrl**: 必须替换为实际的Gemini Pool服务地址，否则API调用会失败
2. **password**: Gemini Pool管理员密码
3. **accounts**: 包含母号和所有子号的完整信息

## temp-mail.yaml 配置

邮箱服务配置，用于创建和管理临时邮箱：

```yaml
# 邮箱API凭据
credentials:
  account: your_account
  password: your_password
  defaultDomain: "@example.com"
  emailApiUrl: https://api.example.com

# 账户信息
accounts:
  parent:
    email: parent@example.com
    accountId: 1
    # ... 其他字段
  children:
    - accountId: 2
      email: child1@example.com
      # ... 其他字段
    # ... 更多子账户
```

## proxy.yaml 配置

代理配置（可选）：

```yaml
proxy:
  enabled: true
  type: http  # 或 socks5
  url: 127.0.0.1
  port: 8080
  username: your_username  # 可选
  password: your_password  # 可选
```

## 常见问题

### 1. "connect ECONNREFUSED 127.0.0.1:8000" 错误

这个错误表示API服务无法连接到Gemini Pool平台。解决方法：

1. 确保Gemini Pool服务正在运行
2. 检查`gemini-mail.yaml`中的`poolApiUrl`是否正确
3. 如果使用本地服务，确保端口和IP地址正确

### 2. 邮箱服务认证失败

检查`temp-mail.yaml`中的邮箱凭据是否正确：
- account
- password
- emailApiUrl

### 3. 代理连接失败

如果启用代理但连接失败，检查`proxy.yaml`中的配置：
- 代理服务器地址和端口
- 认证信息（如果需要）
- 代理类型（http/socks5）

## 安全建议

1. 不要将包含敏感信息的配置文件提交到版本控制系统
2. 在生产环境中使用环境变量覆盖敏感配置
3. 定期更换密码和访问令牌
4. 限制API服务的网络访问范围

## 配置验证

启动服务前，可以使用以下命令验证配置：

```bash
# 检查配置文件语法
node -e "console.log(require('./utils/config').loadGeminiMailConfig())"
node -e "console.log(require('./utils/config').loadTempMailConfig())"
node -e "console.log(require('./utils/config').getProxyConfig())"
```

如果命令执行没有错误，说明配置文件格式正确。
