# Pearl 本地签名网页钱包（Vercel 版）

这是一个只部署到 Vercel 的纯前端 Pearl 钱包。

## 功能

- 输入 WIF 或 64 位 hex 私钥，浏览器本地推导 Pearl 地址。
- 查询余额和 UTXO：`http://blockbook.pearlresearch.ai/api/v2/address/{address}`、`/utxo/{address}`。
- 本地构造并签名 Taproot 交易。
- 广播 rawtx：`http://blockbook.pearlresearch.ai/api/v2/sendtx/{rawtx}`。
- 私钥只在浏览器内使用，不上传到 Vercel、作者服务器或 Blockbook。

## 一键部署到 Vercel

1. 把本目录上传到 GitHub 新仓库。
2. 打开 Vercel，点击 `Add New Project`。
3. 选择这个 GitHub 仓库。
4. Framework Preset 选 `Vite`。
5. Build Command 保持 `npm run build`。
6. Output Directory 保持 `dist`。
7. 点击 Deploy。

部署完成后，用户打开 Vercel 域名即可使用。

## 本地测试

```bash
npm install
npm run dev
```

然后打开 Vite 显示的本地地址。

## 安全说明

- 不要添加 Vercel API Route 处理私钥。
- 不要接入统计、广告、客服、第三方脚本。
- 不要把私钥保存到 localStorage、cookie、IndexedDB。
- 大额转账建议先小额测试。
- 谨慎用户可以 fork 源码后部署自己的 Vercel。

## 技术来源

Pearl 官方源码仓库：

```text
https://github.com/pearl-research-labs/pearl
```

本项目的地址、Taproot 交易结构、签名流程与 Pearl 官方 Go 工具里的逻辑保持同类：WIF 私钥、Pearl mainnet `prl` bech32 地址、Taproot key-path 签名、Blockbook 查询和广播。
