import { useState } from "react";
import { Contract, parseUnits, MaxUint256 } from "ethers";
import { ADDRESSES, BASKET_MANAGER_ABI, ERC20_ABI } from "../config";

export default function Purchase({ signer, address }) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePurchase() {
    if (!signer || !amount || Number(amount) <= 0) return;
    setLoading(true);
    setStatus("");
    try {
      const stable = new Contract(ADDRESSES.stable, ERC20_ABI, signer);
      const mgr = new Contract(ADDRESSES.manager, BASKET_MANAGER_ABI, signer);

      const decimals = Number(await stable.decimals());
      const amountRaw = parseUnits(amount, decimals);

      // Check allowance and approve if needed
      const allowance = await stable.allowance(address, ADDRESSES.manager);
      if (allowance < amountRaw) {
        setStatus("Approving stable spend…");
        const approveTx = await stable.approve(ADDRESSES.manager, MaxUint256);
        await approveTx.wait();
        setStatus("Approval confirmed. Purchasing…");
      } else {
        setStatus("Purchasing…");
      }

      const tx = await mgr.purchase(amountRaw, address);
      const receipt = await tx.wait();

      // Parse Purchased event
      const iface = mgr.interface;
      let sharesMinted = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === "Purchased") {
            sharesMinted = parsed.args.sharesMinted;
          }
        } catch (_) {}
      }

      setStatus(
        sharesMinted != null
          ? `Purchased! Shares minted: ${(Number(sharesMinted) / 1e18).toFixed(6)} TRXETF`
          : `Tx confirmed: ${receipt.hash}`
      );
    } catch (err) {
      setStatus(`Error: ${err.reason || err.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!signer) return null;

  return (
    <div className="card">
      <h2>Purchase TRXETF</h2>
      <p className="hint">Enter USDC.e amount to invest</p>
      <div className="input-row">
        <input
          type="number"
          min="0"
          step="any"
          placeholder="USDC amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={loading}
        />
        <button onClick={handlePurchase} disabled={loading || !amount}>
          {loading ? "Wait…" : "Approve & Purchase"}
        </button>
      </div>
      {status && <p className="status">{status}</p>}
    </div>
  );
}
