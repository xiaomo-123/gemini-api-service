# Gemini API Service

这是一个基于Node.js的RESTful API服务，用于管理Gemini Business账户和临时邮箱。该服务将原有的命令行工具转换为Web API，便于集成和自动化使用。

## 功能特性

- 邮箱账户管理（创建、删除、列表）
- Gemini账户令牌自动刷新
- Gemini Pool平台账户同步
- 无效账户自动清理
- RESTful API接口
- 完整的错误处理和参数验证

## 快速开始

新用户请参考[QUICKSTART.md](QUICKSTART.md)快速配置和启动服务。

## 系统要求

- Node.js 18.0或更高版本
- npm或yarn包管理器

gemini-api-service/
├── app.js                    # 应用入口
├── package.json              # 项目依赖和脚本
├── README.md                 # 项目文档
├── routes/                   # API路由
│   ├── auth.js              # 认证路由
│   ├── email.js             # 邮箱管理路由
│   └── gemini.js           # Gemini管理路由
├── services/                # 业务逻辑
│   ├── emailService.js       # 邮箱服务
│   └── geminiService.js     # Gemini服务
├── utils/                   # 工具函数
│   ├── config.js            # 配置管理
│   └── logger.js           # 日志工具
└── config/                  # 配置文件
    ├── temp-mail.yaml       # 邮箱配置
    ├── gemini-mail.yaml     # Gemini配置
    └── proxy.yaml          # 代理配置

## 安装步骤

1. 克隆或下载项目到本地

2. 安装依赖
```bash
cd gemini-api-service
npm install
```

3. 配置文件
在`config`目录下创建以下配置文件：

- `temp-mail.yaml` - 临时邮箱配置
- `gemini-mail.yaml` - Gemini账户配置
- `proxy.yaml` - 代理配置（可选）

**重要提示**：
- 必须修改`gemini-mail.yaml`中的`poolApiUrl`为实际的Gemini Pool服务地址，否则API调用会失败
- 详细配置说明请参考[CONFIG.md](CONFIG.md)

4. 启动服务
```bash
npm start
```

或使用开发模式（自动重启）：
```bash
npm run dev
```

服务默认运行在 `http://localhost:3000`

## API接口文档

### 认证接口

#### POST /api/auth/login
登录邮箱服务

**请求体：**
```json
{
  "account": "your_account",
  "password": "your_password",
  "defaultDomain": "@example.com",
  "emailApiUrl": "https://api.example.com"
}
```

**响应：**
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 邮箱管理接口

#### GET /api/email/accounts
获取所有邮箱账户

**响应：**
```json
{
  "success": true,
  "data": {
    "parent": {
      "email": "parent@example.com",
      "accountId": "12345",
      "name": "Parent Account",
      "status": "active",
      "createTime": "2023-01-01T00:00:00.000Z"
    },
    "children": [
      {
        "email": "child1@example.com",
        "accountId": "12346",
        "name": "Child Account 1",
        "status": "active",
        "createTime": "2023-01-02T00:00:00.000Z"
      }
    ],
    "total": 2
  }
}
```

#### POST /api/email/accounts
创建新的邮箱账户

**响应：**
```json
{
  "success": true,
  "message": "账户创建成功",
  "data": {
    "email": "new_account@example.com",
    "accountId": "12347",
    "name": "New Account",
    "status": "active",
    "createTime": "2023-01-03T00:00:00.000Z"
  }
}
```

#### DELETE /api/email/accounts/:accountId
删除指定账户

**参数：**
- accountId: 账户ID（数字）

**响应：**
```json
{
  "success": true,
  "message": "账户删除成功",
  "data": {}
}
```

#### GET /api/email/accounts/:accountId/verification-code
获取账户的最新验证码

**参数：**
- accountId: 账户ID（数字）

**响应：**
```json
{
  "success": true,
  "data": {
    "code": "123456",
    "time": "2023-01-03T12:00:00.000Z",
    "subject": "Your verification code",
    "from": "noreply@example.com"
  }
}
```

### Gemini管理接口

#### GET /api/gemini/accounts
获取Gemini配置中的所有账户

**响应：**
```json
{
  "success": true,
  "data": {
    "parent": {
      "email": "parent@example.com",
      "accountId": "12345",
      "tokens": {
        "csesidx": "...",
        "host_c_oses": "...",
        "secure_c_ses": "...",
        "team_id": "..."
      }
    },
    "children": [
      {
        "email": "child1@example.com",
        "accountId": "12346",
        "tokens": {
          "csesidx": "...",
          "host_c_oses": "...",
          "secure_c_ses": "...",
          "team_id": "..."
        }
      }
    ],
    "total": 2
  }
}
```

#### GET /api/gemini/temp-accounts
获取临时邮箱中的所有账户（用于选择Business账户）

**响应：**
```json
{
  "success": true,
  "data": {
    "parent": {
      "email": "parent@example.com",
      "accountId": "12345",
      "name": "Parent Account",
      "status": "active",
      "createTime": "2023-01-01T00:00:00.000Z"
    },
    "children": [
      {
        "email": "child1@example.com",
        "accountId": "12346",
        "name": "Child Account 1",
        "status": "active",
        "createTime": "2023-01-02T00:00:00.000Z"
      }
    ],
    "total": 2
  }
}
```

#### POST /api/gemini/select-accounts
选择Business账户

**请求体：**
```json
{
  "accountIds": [1, 3, 5]
}
```

**响应：**
```json
{
  "success": true,
  "message": "已选择 3 个Business账户",
  "data": {
    "count": 3,
    "accounts": [
      {
        "email": "child1@example.com",
        "accountId": "12346"
      },
      {
        "email": "child3@example.com",
        "accountId": "12348"
      },
      {
        "email": "child5@example.com",
        "accountId": "12350"
      }
    ]
  }
}
```

#### POST /api/gemini/refresh-tokens
刷新所有Gemini账户的令牌

**响应：**
```json
{
  "success": true,
  "message": "令牌刷新完成",
  "data": {
    "successCount": 5,
    "failureCount": 0
  }
}
```

#### POST /api/gemini/update-pool
更新Gemini Pool（删除所有账户并重新添加）

**响应：**
```json
{
  "success": true,
  "message": "Gemini Pool更新完成",
  "data": {
    "deletedCount": 5,
    "addedCount": 5,
    "skippedCount": 0,
    "totalCount": 5
  }
}
```

#### POST /api/gemini/clean-invalid
清理无效账户

**响应：**
```json
{
  "success": true,
  "message": "无效账户清理完成",
  "data": {
    "validCount": 3,
    "invalidCount": 2
  }
}
```

## 接口测试示例

### 使用curl测试

1. 登录邮箱服务
```bash
curl -X POST http://localhost:3000/api/auth/login   -H "Content-Type: application/json"   -d '{
    "account": "your_account",
    "password": "your_password"
  }'
```

2. 获取所有邮箱账户
```bash
curl -X GET http://localhost:3000/api/email/accounts   -H "Authorization: your_token_here"
```

3. 创建新邮箱账户
```bash
curl -X POST http://localhost:3000/api/email/accounts   -H "Authorization: your_token_here"
```

4. 删除邮箱账户
```bash
curl -X DELETE http://localhost:3000/api/email/accounts/12346   -H "Authorization: your_token_here"
```

5. 刷新Gemini令牌
```bash
curl -X POST http://localhost:3000/api/gemini/refresh-tokens   -H "Authorization: your_token_here"
```
7、选择Business账户
curl -X POST http://localhost:3000/api/gemini/select-accounts \
  -H "Content-Type: application/json" \
  -d '{
    "accountIds": [1, 3, 5]
  }'

 8、更新Gemini Pool 
curl -X POST http://localhost:3000/api/gemini/update-pool

9、清理无效账户
curl -X POST http://localhost:3000/api/gemini/clean-invalid

### 使用Postman测试

1. 导入以下环境变量：
   - `baseUrl`: http://localhost:3000
   - `token`: (从登录接口获取)

2. 创建以下集合：

   - 认证请求
     - 登录邮箱服务: POST {{baseUrl}}/api/auth/login

   - 邮箱管理
     - 获取账户列表: GET {{baseUrl}}/api/email/accounts
     - 创建新账户: POST {{baseUrl}}/api/email/accounts
     - 删除账户: DELETE {{baseUrl}}/api/email/accounts/{{accountId}}
     - 获取验证码: GET {{baseUrl}}/api/email/accounts/{{accountId}}/verification-code

   - Gemini管理
     - 获取Gemini账户: GET {{baseUrl}}/api/gemini/accounts
     - 获取临时账户: GET {{baseUrl}}/api/gemini/temp-accounts
     - 选择Business账户: POST {{baseUrl}}/api/gemini/select-accounts
     - 刷新令牌: POST {{baseUrl}}/api/gemini/refresh-tokens
     - 更新Pool: POST {{baseUrl}}/api/gemini/update-pool
     - 清理无效账户: POST {{baseUrl}}/api/gemini/clean-invalid

## 错误处理

API使用标准HTTP状态码表示请求结果：

- 200: 请求成功
- 201: 创建成功
- 400: 请求参数错误
- 401: 认证失败
- 404: 资源不存在
- 500: 服务器内部错误

错误响应格式：
```json
{
  "error": "错误描述",
  "details": [
    {
      "field": "参数字段",
      "message": "具体错误信息"
    }
  ]
}
```

## 日志

应用日志保存在`logs`目录下：
- `combined.log`: 所有日志
- `error.log`: 错误日志

## 原代码与API代码的对应关系

| 原功能 | API接口 | 说明 |
|--------|---------|------|
| 重新获取所有邮箱 | GET /api/email/accounts | 获取母号和所有子号 |
| 新建子号 | POST /api/email/accounts | 创建新的子号 |
| 删除子号 | DELETE /api/email/accounts/:accountId | 删除指定子号 |
| 获取最新登录验证码 | GET /api/email/accounts/:accountId/verification-code | 获取指定账户的验证码 |
| 重置已注册的 Business 账号 | POST /api/gemini/select-accounts | 选择Business账户 |
| 检查并去除 Gemini Pool 失效账户 | POST /api/gemini/clean-invalid | 清理无效账户 |
| 刷新账户 Token 并同步到 Gemini Pool | POST /api/gemini/refresh-tokens | 刷新令牌 |
| 同步 Token 到 Gemini Pool 平台 | POST /api/gemini/update-pool | 更新Pool平台 |


