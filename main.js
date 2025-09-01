// main.js
const child_process = require('child_process');

// 自动安装依赖
console.log('Installing dependencies...');
child_process.execSync('yarn install --frozen-lockfile', { stdio: 'inherit', cwd: __dirname });

// 运行主逻辑
require('./index.js');
