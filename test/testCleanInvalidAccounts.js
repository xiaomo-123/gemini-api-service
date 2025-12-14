// testCleanInvalidAccounts.js
const cleanInvalidAccounts = require('./Gemini-Business-OpenAi/util/gemini/cleanInvalidAccounts');

// 直接调用函数
cleanInvalidAccounts()
  .then(() => {
    console.log('测试完成');
  })
  .catch(err => {
    console.error('测试失败:', err.message);
  });
