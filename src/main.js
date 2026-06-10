import "./style.css";
import {
  broadcastRawTx,
  buildSignedTransaction,
  formatPrl,
  getBalance,
  getStatus,
  privateKeyToAddress
} from "./pearl.js";

const app = document.querySelector("#app");

app.innerHTML = `
  <main>
    <section class="hero">
      <h1>Pearl 本地签名钱包</h1>
      <p>纯前端钱包：私钥只在你的浏览器本地推导地址和签名，服务器不会收到私钥。余额/UTXO 查询使用 Pearl Blockbook，转账只广播已签名 rawtx。</p>
      <p class="warning">安全提示：不要在别人发来的陌生网页里输入大额钱包私钥。建议先小额测试，谨慎用户可下载源码自行部署。</p>
    </section>

    <section class="card">
      <div id="network"></div>
      <label>私钥 WIF 或 64 位 hex</label>
      <input id="privateKey" type="password" autocomplete="off" spellcheck="false" placeholder="粘贴你的私钥" />
      <button id="showBalance">显示地址和余额</button>
      <button id="clearKey" class="secondary">清空私钥</button>

      <label>地址</label>
      <input id="address" readonly />
      <label>余额</label>
      <input id="balance" readonly />
    </section>

    <section class="card">
      <div class="grid">
        <div>
          <label>目标地址</label>
          <input id="target" placeholder="prl..." />
        </div>
        <div>
          <label>金额 PRL</label>
          <input id="amount" placeholder="例如 1.23" />
        </div>
      </div>
      <label>固定手续费 PRL</label>
      <input id="fee" value="0.001" />
      <button id="send" class="danger">一键转账</button>
    </section>

    <section class="card">
      <div id="status" class="status">准备好了。</div>
    </section>

    <aside class="corner-note">
      <b>by akakay04</b><br />
      风险免责声明：本工具仅提供本地签名与广播辅助，链上转账不可撤回。请自行确认私钥安全、目标地址、金额和手续费，使用风险自担。
    </aside>
  </main>
`;

const $ = (id) => document.querySelector(`#${id}`);
const setStatus = (text) => {
  $("status").textContent = text;
};

async function withStatus(text, task) {
  try {
    setStatus(text);
    await task();
  } catch (error) {
    setStatus(`错误: ${error.message || error}`);
  }
}

async function refreshNetworkStatus() {
  try {
    const status = await getStatus();
    const height = status?.backend?.blocks ?? "-";
    const synced = status?.blockbook?.inSync;
    $("network").innerHTML = `
      <span class="pill">Blockbook: <b class="${synced ? "ok" : "bad"}">${synced ? "synced" : "offline"}</b></span>
      <span class="pill">height: <b>${height}</b></span>
      <span class="pill">network: <b>${status?.blockbook?.network ?? "PRL"}</b></span>
    `;
  } catch (error) {
    $("network").innerHTML = `<span class="pill">Blockbook: <b class="bad">${error.message}</b></span>`;
  }
}

$("showBalance").addEventListener("click", () =>
  withStatus("正在本地推导地址并查询余额...", async () => {
    const privateKey = $("privateKey").value.trim();
    const address = privateKeyToAddress(privateKey);
    const balance = await getBalance(address);
    $("address").value = address;
    $("balance").value =
      balance.unconfirmed !== "0"
        ? `${balance.confirmed} PRL (+${balance.unconfirmed} unconfirmed, ${balance.txs} txs)`
        : `${balance.confirmed} PRL`;
    setStatus(`完成\n地址: ${address}\n余额: ${$("balance").value}`);
  })
);

$("clearKey").addEventListener("click", () => {
  $("privateKey").value = "";
  setStatus("私钥输入框已清空。");
});

$("send").addEventListener("click", () =>
  withStatus("正在查询 UTXO、本地签名并广播...", async () => {
    if (!confirm("确认发送交易？链上转账不可撤回。")) return;
    const signed = await buildSignedTransaction({
      privateKey: $("privateKey").value.trim(),
      target: $("target").value.trim(),
      amount: $("amount").value.trim(),
      fee: $("fee").value.trim()
    });
    const txid = await broadcastRawTx(signed.rawtx);
    setStatus(
      [
        "交易已广播",
        `txid: ${txid}`,
        `source: ${signed.source}`,
        `inputs: ${signed.inputCount}`,
        `fee: ${formatPrl(signed.feeSats)} PRL`,
        `change: ${formatPrl(signed.changeSats)} PRL`
      ].join("\n")
    );
  })
);

refreshNetworkStatus();
