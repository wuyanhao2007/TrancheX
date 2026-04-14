import { useState, useEffect } from "react";
import { Contract } from "ethers";
import "./App.css";
import { useWeb3 } from "./hooks/useWeb3";
import { ADDRESSES } from "./config";
import AdminDashboard from "./pages/AdminDashboard";
import UserDashboard  from "./pages/UserDashboard";
import BasketManagerABI from "./abis/BasketManager.json";

export default function App() {
  const { provider, signer, address, chainId, error, connect, disconnect } = useWeb3();
  const [tab, setTab]         = useState("fund");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!provider||!address||!ADDRESSES.manager) { setIsAdmin(false); return; }
    const mgr = new Contract(ADDRESSES.manager, BasketManagerABI, provider);
    mgr.DEFAULT_ADMIN_ROLE().then((role)=>mgr.hasRole(role,address)).then(setIsAdmin).catch(()=>setIsAdmin(false));
  }, [provider, address]);

  const shortAddr = address ? `${address.slice(0,6)}…${address.slice(-4)}` : "";

  return (
    <div className="app">
      <header className="top-bar">
        <div style={{ display:"flex",alignItems:"center",gap:20 }}>
          <div className="brand">TrancheX</div>
          {address && (
            <nav style={{ display:"flex",gap:4 }}>
              <button className={`nav-tab ${tab==="fund"?"active":""}`} onClick={()=>setTab("fund")}>Fund</button>
              {isAdmin && <button className={`nav-tab ${tab==="admin"?"active":""}`} onClick={()=>setTab("admin")}>Admin</button>}
            </nav>
          )}
        </div>
        <div className="wallet-area">
          {address ? (
            <>
              <span className="chain-badge">{chainId===133?"HashKey Testnet":`Chain ${chainId}`}</span>
              {isAdmin && <span className="tag tag-green" style={{ padding:"3px 10px" }}>Admin</span>}
              <span className="addr-badge">{shortAddr}</span>
              <button className="btn-sm" onClick={disconnect}>Disconnect</button>
            </>
          ) : <button onClick={connect}>Connect Wallet</button>}
        </div>
      </header>
      {error && <p className="global-error">{error}</p>}
      <main className="main-content">
        {!address ? (
          <div className="card welcome" style={{ maxWidth:580,margin:"60px auto" }}>
            <h1>TrancheX</h1>
            <p style={{ fontSize:"1rem",marginBottom:6 }}>RWA Index Fund on HashKey Chain Testnet</p>
            <p style={{ marginBottom:28 }}>Multi-basket tokenized funds — ERC-20 and permissioned ERC-3643 with on-chain compliance.</p>
            <button onClick={connect} style={{ padding:"11px 28px",fontSize:"0.95rem" }}>Connect Wallet</button>
          </div>
        ) : tab==="admin" && isAdmin ? (
          <AdminDashboard signer={signer} provider={provider} />
        ) : (
          <UserDashboard signer={signer} provider={provider} address={address} />
        )}
      </main>
    </div>
  );
}
