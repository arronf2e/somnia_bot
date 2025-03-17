import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 配置文件
const config = {
  TX_LINK: `https://shannon-explorer.somnia.network/tx/`,
  RPC_URL: "https://dream-rpc.somnia.network",
  PING_TOKEN_ADDRESS: "0xbecd9b5f373877881d91cbdbaf013d97eb532154",
  PONG_TOKEN_ADDRESS: "0x7968ac15a72629e05f41b8271e4e7292e0cc9f90",
  SWAP_CONTRACT_ADDRESS: "0x6aac14f090a35eea150705f72d90e4cdc4a49b2c",
  THREAD_COUNT: 1,  // 线程数
};

// 读取私钥和地址
const PRIVATE_KEYS = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, 'private_keys.txt'), 'utf8')
      .split('\n').map(l => l.trim()).filter(l => l);
  } catch (error) {
    console.error(chalk.red('读取私钥文件失败:'), error.message);
    return [];
  }
})();

const PROXY_URLS = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, 'proxies.txt'), 'utf8')
      .split('\n').map(l => l.trim()).filter(l => l);
  } catch (error) {
    console.error(chalk.red('读取代理文件失败:'), error.message);
    return [];
  }
})();

// 启动工作线程
async function startWorkers() {
  let currentIndex = 0;
  let activeWorkers = 0;
  const maxThreads = config.THREAD_COUNT;

  function createNextWorker() {
    while (activeWorkers < maxThreads && currentIndex < PRIVATE_KEYS.length) {
      const privateKey = PRIVATE_KEYS[currentIndex];
      const proxy = PROXY_URLS[currentIndex % PROXY_URLS.length];
      const workerIndex = ++currentIndex; // 使用自增后的索引作为线程编号
      activeWorkers++;

      const worker = new Worker(path.join(__dirname, 'worker.js'), {
        workerData: {
          ...config,
          privateKey: privateKey,
          proxy,
        }
      });

      worker.on('message', msg => {
        console.log(`[线程 ${workerIndex}] ${msg}`);
      });

      worker.on('error', err => {
        console.log(chalk.red(`[线程 ${workerIndex}] 错误: ${err.message}`));
      });

      worker.on('exit', code => {
        activeWorkers--;
        console.log(chalk.yellow(`[线程 ${workerIndex}] 已退出，代码 ${code}`));
        createNextWorker(); // 触发新线程创建
      });
    }
  }

  console.log(chalk.green(`🚀 启动动态线程池（最大 ${maxThreads} 线程）`));
  createNextWorker(); // 初始化启动
}

// 主程序启动
function main() {
  console.log(chalk.bold.green("=================== SOMNIA 自动机器人 ==================="));
  
  if (!PRIVATE_KEYS.length) {
    console.log(chalk.red("❌ 未找到有效私钥，请创建 private_keys.txt 文件"));
    process.exit(1);
  }

  startWorkers();
}

main();
