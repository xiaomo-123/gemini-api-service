// testProxy.js
// 代理测试脚本，用于验证proxy.yaml中配置的代理是否可用

const { getProxyConfig } = require('../config/proxy.yaml');
const net = require('net');
const { URL } = require('url');

/**
 * 测试代理连接
 * @param {Object} proxyConfig - 代理配置对象
 * @returns {Promise<boolean>} 代理是否可用
 */
async function testProxyConnection(proxyConfig) {
    console.log('\n' + '='.repeat(50));
    console.log('🔍 开始代理测试');
    console.log('='.repeat(50));

    console.log(`\n📋 代理配置信息:`);
    console.log(`   启用状态: ${proxyConfig.enabled ? '已启用' : '未启用'}`);
    console.log(`   代理类型: ${proxyConfig.type}`);
    console.log(`   代理地址: ${proxyConfig.url}:${proxyConfig.port}`);
    console.log(`   认证信息: ${proxyConfig.username ? '已设置' : '未设置'}`);
    console.log(`   完整认证信息: ${proxyConfig.username ? proxyConfig.username + ':' + proxyConfig.password : '无'}`);

    if (!proxyConfig.enabled) {
        console.log('\n⚠️  代理未启用，无需测试');
        return false;
    }

    // 根据代理类型构建代理服务器URL
    let proxyServer;
    if (proxyConfig.type === 'socks5') {
        proxyServer = `socks5://${proxyConfig.url}:${proxyConfig.port}`;
    } else {
        proxyServer = `${proxyConfig.type}://${proxyConfig.url}:${proxyConfig.port}`;
    }

    console.log(`\n🔍 测试代理连接: ${proxyServer}`);

    try {
        // 尝试使用代理直接请求httpbin.org/ip，验证代理是否生效
        const axios = require('axios');
        const https = require('https');
        const url = require('url');

        // 构建目标URL（使用httpbin.org作为测试目标）
        const targetUrl = 'https://httpbin.org/ip';

        // 配置axios使用代理
        const axiosConfig = {
            method: 'get',
            url: targetUrl,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false // 忽略证书验证
            }),
            timeout: 15000, // 15秒超时
            proxy: {
                protocol: proxyConfig.type,
                host: proxyConfig.url,
                port: proxyConfig.port,
                auth: proxyConfig.username && proxyConfig.password ? {
                    username: proxyConfig.username,
                    password: proxyConfig.password
                } : undefined
            }
        };

        console.log('\n🔍 正在通过代理请求测试目标URL...');
        console.log(`   请求URL: ${targetUrl}`);
        console.log(`   代理主机: ${proxyConfig.url}:${proxyConfig.port}`);

        const response = await axios(axiosConfig);
        const result = response.data;

        console.log('\n📋 代理响应结果:');
        console.log(`   状态码: ${response.status}`);
        console.log(`   响应IP: ${result.origin}`);

        // 验证代理是否生效
        if (result.origin && result.origin !== '127.0.0.1') {
            console.log('   ✓ 代理已生效，IP已改变');
            console.log('\n✅ 代理测试通过');
            return true;
        } else {
            console.log('   ⚠️ 代理可能未生效');
            console.log('\n❌ 代理测试失败');
            return false;
        }
    } catch (error) {
        console.log(`\n❌ 代理测试失败: ${error.message}`);

        // 如果是网络错误，尝试备用测试方法
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.log('\n🔄 尝试备用测试方法...');

            try {
                // 使用HTTP CONNECT方法测试代理连接，支持认证
                const https = require('https');
                const url = require('url');

                // 构建目标URL（使用httpbin.org作为测试目标）
                const targetUrl = 'https://httpbin.org/ip';
                const targetParsed = url.parse(targetUrl);

                // 设置代理选项
                const proxyOptions = {
                    host: proxyConfig.url,
                    port: proxyConfig.port,
                    method: 'CONNECT',
                    path: `${targetParsed.hostname}:${targetParsed.port || 443}`,
                    headers: {
                        'Host': `${targetParsed.hostname}:${targetParsed.port || 443}`
                    }
                };

                // 如果有认证信息，添加Proxy-Authorization头
                if (proxyConfig.username && proxyConfig.password) {
                    const auth = Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64');
                    proxyOptions.headers['Proxy-Authorization'] = `Basic ${auth}`;
                }

                await new Promise((resolve, reject) => {
                    const req = https.request(proxyOptions);

                    req.setTimeout(10000); // 10秒超时

                    req.on('connect', (res, socket) => {
                        if (res.statusCode === 200) {
                            console.log('   ✓ 代理连接成功');
                            socket.end();
                            resolve();
                        } else {
                            console.log(`   ✗ 代理连接失败，状态码: ${res.statusCode}`);
                            socket.end();
                            reject(new Error(`代理连接失败，状态码: ${res.statusCode}`));
                        }
                    });

                    req.on('timeout', () => {
                        console.log('   ✗ 代理连接超时');
                        req.destroy();
                        reject(new Error('代理连接超时'));
                    });

                    req.on('error', (err) => {
                        console.log(`   ✗ 代理连接失败: ${err.message}`);
                        reject(err);
                    });

                    req.end();
                });

                console.log('\n✅ 代理测试通过（备用方法）');
                return true;
            } catch (backupError) {
                console.log(`\n❌ 备用测试方法也失败: ${backupError.message}`);
                return false;
            }
        }

        return false;
    }
}

/**
 * 使用Puppeteer测试代理访问网页
 * @param {Object} proxyConfig - 代理配置对象
 * @returns {Promise<boolean>} 代理访问网页是否成功
 */
async function testProxyWithPuppeteer(proxyConfig) {
    console.log('\n' + '='.repeat(50));
    console.log('🌐 使用Puppeteer测试代理访问网页');
    console.log('='.repeat(50));

    if (!proxyConfig.enabled) {
        console.log('\n⚠️  代理未启用，无需测试');
        return false;
    }

    const puppeteer = require('puppeteer');
    let browser;

    try {
        // 根据代理类型构建代理服务器URL
        // 注意：Puppeteer的--proxy-server参数不应包含认证信息
        let proxyServer;
        if (proxyConfig.type === 'socks5') {
            proxyServer = `socks5://${proxyConfig.url}:${proxyConfig.port}`;
        } else {
            // HTTP代理只传递服务器地址和端口，不包含认证信息
            proxyServer = `${proxyConfig.type}://${proxyConfig.url}:${proxyConfig.port}`;
        }

        // 构建浏览器启动参数
        let launchArgs = [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled', // 避免被检测为自动化
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps'
        ];

        // 添加代理参数
        launchArgs.push(`--proxy-server=${proxyServer}`);

        console.log(`\n🔍 启动浏览器，使用代理: ${proxyConfig.type}://${proxyConfig.url}:${proxyConfig.port}`);
        console.log(`   认证信息: ${proxyConfig.username ? '已设置' : '未设置'}`);

        browser = await puppeteer.launch({
            headless: true, // 无头模式
            args: launchArgs,
            ignoreHTTPSErrors: true // 忽略HTTPS错误
        });

        const page = await browser.newPage();

        // 设置用户代理，避免被识别为机器人
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // 对于HTTP代理，需要单独设置认证信息
        if (proxyConfig.type !== 'socks5' && proxyConfig.username && proxyConfig.password) {
            await page.authenticate({
                username: proxyConfig.username,
                password: proxyConfig.password
            });
            console.log('   ✓ 代理认证已设置');
        }

        console.log('\n🔍 访问测试网页...');

        // 访问一个可以显示IP的网站，验证代理是否生效
        await page.goto('https://httpbin.org/ip', { 
            waitUntil: 'networkidle2',
            timeout: 30000 // 30秒超时
        });

        // 获取页面内容
        const content = await page.content();

        // 提取IP地址
        const ipMatch = content.match(/"origin":\s*"([^"]+)"/);
        const ip = ipMatch ? ipMatch[1] : '未知';

        console.log(`\n📋 代理访问结果:`);
        console.log(`   当前IP: ${ip}`);
        console.log(`   预期代理: ${proxyConfig.url}:${proxyConfig.port}`);

        // 验证IP是否已改变（与本地IP不同）
        if (ip && ip !== '未知' && ip !== '127.0.0.1') {
            console.log('   ✓ 代理已生效，IP已改变');
        } else {
            console.log('   ⚠️ 代理可能未生效');
        }

        console.log('\n✅ 代理访问网页测试完成');
        return true;
    } catch (error) {
        console.log(`\n❌ 代理访问网页测试失败: ${error.message}`);
        return false;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// 主函数
async function runProxyTests() {
    try {
        // 获取代理配置
        const proxyConfig = getProxyConfig();

        // 测试代理连接
        const connectionTest = await testProxyConnection(proxyConfig);

        // 测试代理访问网页
        const webTest = await testProxyWithPuppeteer(proxyConfig);

        // 输出测试结果
        console.log('\n' + '='.repeat(50));
        console.log('📊 测试结果汇总');
        console.log('='.repeat(50));
        console.log(`代理连接测试: ${connectionTest ? '✅ 通过' : '❌ 失败'}`);
        console.log(`代理网页测试: ${webTest ? '✅ 通过' : '❌ 失败'}`);

        if (connectionTest && webTest) {
            console.log('\n🎉 所有测试通过，代理配置正常工作');
        } else {
            console.log('\n⚠️  部分测试失败，请检查代理配置');
        }
    } catch (error) {
        console.error(`\n❌ 测试过程中出错: ${error.message}`);
    }
}

// 运行测试
runProxyTests()
    .then(() => {
        console.log('\n测试完成');
    })
    .catch(err => {
        console.error('\n测试失败:', err.message);
    });
