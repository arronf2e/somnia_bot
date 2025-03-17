import { workerData, parentPort } from 'worker_threads';
import { ethers } from 'ethers';
import axios from 'axios';
import chalk from 'chalk';
import { randomInt } from 'crypto';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { PING_ABI, PONG_ABI, swapContractABI } from './abi.js'

// 工具函数
const log = msg => {
    const time = new Date().toLocaleTimeString();
    parentPort.postMessage(`${chalk.gray(`[${time}]`)} ${msg}`);
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const randomInRange = (min, max) => randomInt(min, max + 1);

const THREAD_DELAY = Math.random() * (workerData.MAX_THREAD_DELAY || 60) * 1000; // 随机延迟 0-60 秒
// 初始化合约
const provider = new ethers.JsonRpcProvider(workerData.RPC_URL);
const wallet = new ethers.Wallet(workerData.privateKey, provider);
const pingContract = new ethers.Contract(workerData.PING_TOKEN_ADDRESS, PING_ABI, wallet);
const pongContract = new ethers.Contract(workerData.PONG_TOKEN_ADDRESS, PONG_ABI, wallet);
const swapContract = new ethers.Contract(workerData.SWAP_CONTRACT_ADDRESS, swapContractABI, wallet);

// 核心业务流程
async function mainLoop() {
    try {

        log(chalk.yellow(`⇄ 开始claim $STT 代币...，使用代理 ${workerData.proxy}`));
        await claimSttFromFaucet(wallet.address, workerData.proxy);
        await delay(5000)

        // 1. 领取水龙头
        log(chalk.yellow(`⇄ 开始mint PING 代币...`));
        await claimFaucetPing();
        await delay(5000);
        log(chalk.yellow(`⇄ 开始mint PONG 代币...`));
        await claimFaucetPong();
        await delay(5000);

        // 2. 自动交换
        await autoSwapPingPong();
        await delay(5000);

        // 3. 自动发送代币        
        await autoSendTokenRandom();

        // 退出线程
        parentPort.postMessage('exit'); // 可选：通知主线程
        process.exit(0);
    } catch (error) {
        log(chalk.red(`流程错误: ${error.message}`));
    }
}

async function claimSttFromFaucet(address, proxy = null) {
    const agent = proxy ? new SocksProxyAgent(proxy) : null;
    try {
        const response = await axios({
            url: 'https://testnet.somnia.network/api/faucet',
            method: 'POST',
            headers: {
                Accept: '*/*',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en-US,en;q=0.9',
                'Content-Type': 'application/json',
                Priority: 'u=1, i',
                'Sec-Ch-Ua': '"Not)A;Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            },
            data: { address },
            httpsAgent: agent,
            httpAgent: agent,
            timeout: 10000
        });
        log(chalk.green('✅ $STT 水龙头领取成功'));
        console.log(response, 'response')
        return response.data;
    } catch (error) {
        log(chalk.red(`❌ $STT 水龙头请求失败: ${error.response?.data?.error || error.message}`));
    }
}

async function claimFaucetPing() {
    try {
        const tx = await pingContract.mint(wallet.address, ethers.parseUnits("1000", 18));
        log(chalk.cyan(`🔄 请求PING水龙头... 交易哈希: ${workerData.TX_LINK}${tx.hash}...`));
        await tx.wait();
        log(chalk.green('✅ PING水龙头领取成功'));
    } catch (error) {
        log(chalk.red(`❌ PING水龙头失败: ${error.message}`));
    }
}

async function claimFaucetPong() {
    try {
        const tx = await pongContract.mint(wallet.address, ethers.parseUnits("1000", 18));
        log(chalk.cyan(`🔄 请求PONG水龙头... 交易哈希: ${workerData.TX_LINK}${tx.hash}...`));
        await tx.wait();
        log(chalk.green('✅ PONG水龙头领取成功'));
    } catch (error) {
        log(chalk.red(`❌ PONG水龙头失败: ${error.message}`));
    }
}

async function autoSwapPingPong() {
    const count = randomInRange(3, 5);
    for (let i = 0; i < count; i++) {
        const direction = Math.random() < 0.5 ? 'PING->PONG' : 'PONG->PING';
        const amount = randomInRange(100, 500);

        try {
            const tx = await swapContract.exactInputSingle({
                tokenIn: direction === 'PING->PONG' ? workerData.PING_TOKEN_ADDRESS : workerData.PONG_TOKEN_ADDRESS,
                tokenOut: direction === 'PING->PONG' ? workerData.PONG_TOKEN_ADDRESS : workerData.PING_TOKEN_ADDRESS,
                amountIn: ethers.parseUnits(amount.toString(), 18),
                fee: 500,
                recipient: wallet.address,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0n
            });
            const delayTime = randomInRange(10000, 20000)
            log(chalk.cyan(`⇄ 交换 ${i + 1}/${count} [${direction}] 数量: ${amount} 哈希: ${workerData.TX_LINK}${tx.hash}，等待${delayTime / 1000}s进行下一次交换`));
            await tx.wait();
            await delay(delayTime);
        } catch (error) {
            log(chalk.red(`❌ 交换失败: ${error.message}`));
        }
    }
    log(chalk.green('✅ PING-SWAP 交互成功'));
}

async function autoSendTokenRandom() {
    const sendCount = randomInRange(1, 3);
    log(chalk.yellow(`⇄ 执行随机发送代币，随机次数：${sendCount}...`));
    for (let i = 0; i < sendCount; i++) {
        // 生成新的随机钱包地址
        const randomWallet = ethers.Wallet.createRandom();
        const target = randomWallet.address;
        const amount = (Math.random() * (0.00005 - 0.00001) + 0.00001).toFixed(5);  // 修改范围并保留5位小数
        try {
            log(chalk.cyan(`✈️ 随机发送 ${i + 1}/${sendCount} ${amount} 到 ${target}...`));
            const tx = await wallet.sendTransaction({
                to: target,
                value: ethers.parseUnits(amount, 18)
            });
            const delayTime = randomInRange(5000, 10000)
            log(chalk.magenta(`✈️ 发送成功，哈希: ${workerData.TX_LINK}${tx.hash}，等待${delayTime / 1000}s进行下一次发送`));
            await tx.wait();
            await delay(delayTime);
        } catch (error) {
            log(chalk.red(`❌ 发送失败: ${error.message}`));
        }
    }
    log(chalk.green(`✅ 成功执行随机发送代币 ${sendCount} 次`));
}

async function startWithDelay() {
    log(chalk.yellow(`⏳ 线程将在 ${(THREAD_DELAY / 1000).toFixed(1)} 秒后开始...`));
    await new Promise(resolve => setTimeout(resolve, THREAD_DELAY));
    log(chalk.yellow(`👛 钱包 ${wallet.address.slice(0, 6)}... 开始运行`));
    mainLoop();
}

// 替换原来的启动命令
startWithDelay();
