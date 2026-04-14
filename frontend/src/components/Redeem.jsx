import { useState } from "react";
import { Contract, parseUnits, formatUnits } from "ethers";
import { ADDRESSES, BASKET_MANAGER_ABI, ERC20_ABI } from "../config";

export default function Redeem({ signer, address }) {
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function fetchBalance() {
    if (!signer || !ADDRESSES.indexToken) return;
    try {
      const tok = new Contract(ADDRESSES.indexToken, ERC20_ABI, signer);
      const bal = await tok.balanceOf(address);
      setBalance(formatUnits(bal, 18));
    } catch (_) {}
  }

  async function handleRedeem() {
    if (!signer || !amount || Number(amount) <= 0) return;
    setLoading(true);
    setStatus("");
    try {
      const mgr = new Contract(ADDRESSES.manager, BASKET_MANAGER_ABI, signer);
      const sharesRaw = parseUnits(amount, 18);

      setStatus("Redeeming…");
      const tx = await mgr.redeem(sharesRaw, address);
      const receipt = await tx.wait();

      const iface = mgr.interface;
      let stableReturned = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === "Redeemed") {
            stableReturned = parsed.args.stableReturned;
          }
        } catch (_) {}
      }

      setStatus(
        stableReturned != null
          ? `Redeemed! USDC received: ${(Number(stableReturned) / 1e6).toFixed(6)}`
          : `Tx confirmed: ${receipt.hash}`
      );
      fetchBalance();
    } catch (err) {
      setStatus(`Error: ${err.reason || err.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!signer) return null;

  return (
    <div className="card">
      <h2>Redeem TRXETF</h2>
      <div className="balance-row">
        <span>Balance: {balance !== null ? `${Number(balance).toFixed(6)} TRXETF` : "—"}</span>
        <button onClick={fetchBalance} className="btn-sm">Check</button>
      </div>
      <div className="input-row">
        <input
          type="number"
          min="0"
          step="any"
          placeholder="Shares amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={loading}
        />
        <button onClick={handleRedeem} disabled={loading || !amount}>
          {loading ? "Wait…" : "Redeem"}
        </button>
      </div>
      {status && <p className="status">{status}</p>}
    </div>
  );
}
