import { useState, useEffect, useCallback } from "react";
import { Contract, formatUnits } from "ethers";
import { ADDRESSES, BASKET_MANAGER_ABI } from "../config";

export default function Dashboard({ provider }) {
  const [nav, setNav] = useState(null);
  const [nps, setNps] = useState(null);
  const [assets, setAssets] = useState([]);
  const [weights, setWeights] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!provider || !ADDRESSES.manager) return;
    setLoading(true);
    try {
      const mgr = new Contract(ADDRESSES.manager, BASKET_MANAGER_ABI, provider);
      const [navRaw, npsRaw, assetList, weightList] = await Promise.all([
        mgr.getNav(),
        mgr.navPerShare(),
        mgr.getAssets(),
        mgr.getWeights(),
      ]);
      // NAV is in 1e18 units (normalized USDC)
      setNav(formatUnits(navRaw, 18));
      setNps(formatUnits(npsRaw, 18));
      setAssets(assetList);
      setWeights(weightList.map((w) => Number(w)));
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!provider) return null;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Fund Dashboard</h2>
        <button onClick={refresh} disabled={loading} className="btn-sm">
          {loading ? "..." : "Refresh"}
        </button>
      </div>
      <div className="stat-row">
        <div className="stat">
          <span className="label">Total NAV (USDC)</span>
          <span className="value">{nav !== null ? Number(nav).toFixed(6) : "—"}</span>
        </div>
        <div className="stat">
          <span className="label">NAV per Share (USDC)</span>
          <span className="value">{nps !== null ? Number(nps).toFixed(6) : "—"}</span>
        </div>
      </div>
      {assets.length > 0 && (
        <table className="asset-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Weight (bps)</th>
              <th>Weight (%)</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((addr, i) => (
              <tr key={addr}>
                <td title={addr}>{addr.slice(0, 10)}…{addr.slice(-6)}</td>
                <td>{weights[i]}</td>
                <td>{((weights[i] / 10000) * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
