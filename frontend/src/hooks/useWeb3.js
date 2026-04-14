import { useState, useCallback } from "react";
import { BrowserProvider } from "ethers";
import { HASHKEY_TESTNET } from "../config";

export function useWeb3() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState("");

  const connect = useCallback(async () => {
    setError("");
    if (!window.ethereum) {
      setError("No injected wallet found. Install MetaMask.");
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });

      // Switch / add HashKey testnet
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: HASHKEY_TESTNET.chainId }],
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [HASHKEY_TESTNET],
          });
        } else {
          throw switchErr;
        }
      }

      const prov = new BrowserProvider(window.ethereum);
      const sgn = await prov.getSigner();
      const addr = await sgn.getAddress();
      const network = await prov.getNetwork();

      setProvider(prov);
      setSigner(sgn);
      setAddress(addr);
      setChainId(Number(network.chainId));
    } catch (err) {
      setError(err.message || "Connection failed");
    }
  }, []);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAddress("");
    setChainId(null);
  }, []);

  return { provider, signer, address, chainId, error, connect, disconnect };
}
