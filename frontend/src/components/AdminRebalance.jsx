import { useState } from "react";
import { Contract, formatUnits } from "ethers";
import {
  ADDRESSES,
  BASKET_MANAGER_ABI,
  ERC20_ABI,
  ORACLE_ABI,
} from "../config";

// Off-chain delta computation per spec pseudocode
// Returns int256[] as BigInt[]
async function computeDeltas(provider, managerAddress) {
  const mgr = new Contract(managerAddress, BASKET_MANAGER_ABI, provider);
  const oracle = new Contract(ADDRESSES.oracle, ORACLE_ABI, provider);

  const [assets, weights, navRaw] = await Promise.all([
    mgr.getAssets(),
    mgr.getWeights(),
    mgr.getNav(),
  ]);

  const nav = navRaw; // 1e18 units

  const deltas = [];
  for (let i = 0; i < assets.length; i++) {
    const tok = new Contract(assets[i], ERC20_ABI, provider);
    const [bal, { price }] = await Promise.all([
      tok.balanceOf(managerAddress),
      oracle.getPrice(assets[i]).then((r) => ({ price: r[0] })),
    ]);

    // targetValue_i = totalNAV * weights[i] / 10000  (1e18 units)
    const targetValue = (nav * weights[i]) / 10000n;
    // currentValue_i = (bal * price) / 1e18          (1e18 units)
    const currentValue = (bal * price) / BigInt(1e18);
    // deltaValue = targetValue - currentValue        (signed 1e18)
    const deltaValue = targetValue - currentValue;
    // deltaToken raw = (deltaValue * 1e18) / price
    const deltaToken =
      price === 0n ? 0n : (deltaValue * BigInt(1e18)) / price;

    deltas.push(deltaToken);
  }
  return { deltas, assets, weights: weights.map(Number) };
}

export default function AdminRebalance({ signer, provider, address }) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  async function handlePreview() {
    if (!provider) return;
    setLoading(true);
    setStatus("");
    try {
      const result = await computeDeltas(provider, ADDRESSES.manager);
      setPreview(result);
      setStatus("Preview computed. Review deltas before executing.");
    } catch (err) {
      setStatus(`Preview error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!signer || !preview) return;
    setLoading(true);
    setStatus("");
    try {
      const mgr = new Contract(ADDRESSES.manager, BASKET_MANAGER_ABI, signer);
      setStatus("Sending executeRebalance tx…");
      const tx = await mgr.executeRebalance(preview.deltas);
      const receipt = await tx.wait();
      setStatus(`RebalanceExecuted! Tx: ${receipt.hash}`);
      setPreview(null);
    } catch (err) {
      setStatus(`Error: ${err.reason || err.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!signer) return null;

  return (
    <div className="card admin-card">
      <h2>Admin: Rebalance</h2>
      <p className="hint">Compute target deltas off-chain, then submit on-chain.</p>
      <div className="btn-row">
        <button onClick={handlePreview} disabled={loading}>
          {loading && !preview ? "Computing…" : "Compute Deltas"}
        </button>
        {preview && (
          <button onClick={handleExecute} disabled={loading} className="btn-danger">
            {loading ? "Executing…" : "Execute Rebalance"}
          </button>
        )}
      </div>

      {preview && (
        <table className="asset-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Weight (bps)</th>
              <th>Delta (raw units)</th>
            </tr>
          </thead>
          <tbody>
            {preview.assets.map((addr, i) => (
              <tr key={addr}>
                <td title={addr}>{addr.slice(0, 10)}…{addr.slice(-6)}</td>
                <td>{preview.weights[i]}</td>
                <td className={preview.deltas[i] >= 0n ? "buy" : "sell"}>
                  {preview.deltas[i] >= 0n ? "+" : ""}
                  {preview.deltas[i].toString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
