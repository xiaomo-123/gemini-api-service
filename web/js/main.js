// API端点列表
const apiEndpoints = [
    // 健康检查
    { method: 'GET', path: '/health', description: '健康检查' },

    // 认证相关
    { method: 'POST', path: '/api/auth/login', description: '登录邮箱服务' },

    // 邮箱管理
    { method: 'GET', path: '/api/email/accounts', description: '获取所有邮箱账户' },
    { method: 'POST', path: '/api/email/accounts', description: '创建新的邮箱账户' },
    { method: 'POST', path: '/api/email/accounts/batch', description: '批量创建多个邮箱账户' },
    { method: 'DELETE', path: '/api/email/accounts/all', description: '删除所有邮箱账户' },
    { method: 'DELETE', path: '/api/email/accounts/:accountId', description: '删除指定邮箱账户' },
    { method: 'GET', path: '/api/email/accounts/:accountId/verification-code', description: '获取账户的最新验证码' },

    // Gemini相关
    { method: 'GET', path: '/api/gemini/accounts', description: '获取Gemini配置中的所有账户' },
    { method: 'GET', path: '/api/gemini/temp-accounts', description: '获取临时邮箱中的所有账户' },
    { method: 'POST', path: '/api/gemini/select-accounts', description: '选择Business账户' },
    { method: 'GET', path: '/api/gemini/refresh-tokens', description: '刷新所有Gemini账户的令牌' },
    { method: 'POST', path: '/api/gemini/update-pool', description: '更新Gemini Pool' },
    { method: 'POST', path: '/api/gemini/clean-invalid', description: '清理无效账户' }
];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 加载API列表
    loadApiList();

    // 加载默认配置
    loadConfig('gemini-mail');

    // 监听标签页切换事件
    document.querySelectorAll('#configTabs button').forEach(tab => {
        tab.addEventListener('click', function(e) {
            // 移除所有活动状态
            document.querySelectorAll('#configTabs button').forEach(t => {
                t.classList.remove('active');
            });
            
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('active');
            });
            
            // 设置当前标签为活动状态
            e.target.classList.add('active');
            
            // 获取目标标签ID
            const targetId = e.target.getAttribute('data-tab');
            if (targetId) {
                const targetPane = document.getElementById(targetId);
                if (targetPane) {
                    targetPane.classList.add('active');
                    loadConfig(targetId);
                }
            }
        });
    });
    
    // 添加按钮事件监听器
    document.getElementById('refresh-gemini-mail').addEventListener('click', () => loadConfig('gemini-mail'));
    document.getElementById('save-gemini-mail').addEventListener('click', () => saveConfig('gemini-mail'));
    
    document.getElementById('refresh-proxy').addEventListener('click', () => loadConfig('proxy'));
    document.getElementById('save-proxy').addEventListener('click', () => saveConfig('proxy'));
    
    document.getElementById('refresh-temp-mail').addEventListener('click', () => loadConfig('temp-mail'));
    document.getElementById('save-temp-mail').addEventListener('click', () => saveConfig('temp-mail'));
});

// 加载API列表
function loadApiList() {
    const apiListElement = document.getElementById('apiList');

    apiEndpoints.forEach(api => {
        const apiItem = document.createElement('div');
        apiItem.className = 'api-item';

        const methodClass = api.method.toLowerCase();

        apiItem.innerHTML = `
            <span class="api-method ${methodClass}">${api.method}</span>
            <code>${api.path}</code>
            <span class="ms-2">${api.description}</span>
        `;

        apiListElement.appendChild(apiItem);
    });
}

// 加载配置文件
async function loadConfig(configName) {
    try {
        const response = await fetch(`/api/config/${configName}`);

        if (!response.ok) {
            throw new Error(`获取配置失败: ${response.statusText}`);
        }

        const configData = await response.text();
        document.getElementById(`${configName}-editor`).value = configData;
    } catch (error) {
        showToast(`加载配置失败: ${error.message}`, 'danger');
        console.error('加载配置失败:', error);
    }
}

// 保存配置文件
async function saveConfig(configName) {
    try {
        const configContent = document.getElementById(`${configName}-editor`).value;

        const response = await fetch(`/api/config/${configName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: configContent
        });

        if (!response.ok) {
            throw new Error(`保存配置失败: ${response.statusText}`);
        }

        showToast('配置保存成功', 'success');
    } catch (error) {
        showToast(`保存配置失败: ${error.message}`, 'danger');
        console.error('保存配置失败:', error);
    }
}

// 显示Toast通知
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');

    const toastId = 'toast-' + Date.now();
    const toastClass = type === 'success' ? 'toast-success' : type === 'danger' ? 'toast-danger' : 'toast-info';
    
    const toastHtml = `
        <div id="${toastId}" class="toast ${toastClass}">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close" aria-label="Close"></button>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    // 显示Toast
    const toastElement = document.getElementById(toastId);
    
    // 为关闭按钮添加事件监听器
    const closeButton = toastElement.querySelector('.btn-close');
    closeButton.addEventListener('click', () => closeToast(toastId));
    
    setTimeout(() => {
        toastElement.classList.add('show');
    }, 10);
    
    // 3秒后自动隐藏
    setTimeout(() => {
        closeToast(toastId);
    }, 3000);
}

// 关闭Toast通知
function closeToast(toastId) {
    const toastElement = document.getElementById(toastId);
    if (toastElement) {
        toastElement.classList.remove('show');
        setTimeout(() => {
            toastElement.remove();
        }, 150);
    }
}
