
<p align="center">
  <img src="assets/icon-128.png" alt="Bozzoo Wallet Logo" width="150" height="150" style="filter:drop-shadow(0 0 25px rgba(255, 165, 0, 0.3));"/>
</p>

# Bozzoo  Bitcoin Wallet

A **privacy-focused, open-source, non-custodial HD Bitcoin wallet** built specifically as a secure browser extension.

Built entirely in **TypeScript** using battle-tested, audited Bitcoin libraries (`bitcoinjs-lib`, `bip39`, `@bitcoinerlab/secp256k1`). All encryption, key derivation, and transaction signing happens entirely locally — your keys and seed phrases absolutely never leave your device.

Compatible with **Chrome, Brave, Edge, Firefox, and Tor Browser**.

## 100% Free Forever
This wallet was built by and for the Bitcoin community. It is **completely free** for everyone to use. There are absolutely no hidden platform taxes, no "premium" upgrades, and no paid features. We believe privacy-preserving Bitcoin tools should be accessible, open-source, and strictly non-profit.

---

## Why Bozzoo? (How We Compare)

There are many Bitcoin web wallets available, but Bozzoo was built from the ground up to solve the friction points power users face every day. We prioritize **fee efficiency, ultimate privacy, and total transparency**.

| Feature | Bozzoo Wallet | Existing Web Wallets |
|---|---|---|
| **Multi-Send (Batching)** | ✅ Send to up to 20 addresses in a single transaction, cutting network fees by up to 60%. | ❌ Usually restricted to 1 transaction per recipient. |
| **Advanced Coin Control** | ✅ Full manual UTXO selection for ultimate privacy. You choose exactly which coins to spend. | ⚠️ Rarely supported, or hidden behind complex "pro" menus. |
| **Real-time Dynamic Fees** | ✅ Uses pure live data from a native fallback network (`mempool.space`, `mempool.ninja`) without artificially inflating numbers. If the network is quiet, we tell you, and let you pay the absolute minimum. | ⚠️ Frequently use delayed or static node RPC fee estimates and artificially bump ranges. |
| **100% Free & Transparent** | ✅ Zero hidden routing fees. We use a strictly voluntary donation model (minimum $0.30 equivalent). | ❌ Often inject hidden swap fees or flat platform taxes. |
| **Complete Address Support**| ✅ Seamlessly toggle between Legacy, Nested SegWit, Native SegWit, and Taproot. | ⚠️ Usually locked into Native SegWit or Taproot only. |
---

##  Complete Feature List

- **Non-Custodial** — You hold the keys. No servers, no accounts, no KYC.
- **4 Address Types Supported** — Legacy (P2PKH), Nested SegWit (P2SH), Native SegWit (P2WPKH), Taproot (P2TR).
- **HD Wallet Architecture** — Utilizes BIP-39/44/49/84/86 standard derivation paths for infinite address generation.
- **Multi-Send (Transaction Batching)** — Add multiple recipients visually and send one single transaction.
- **Advanced Coin Control** — View your UTXOs and manually select which ones to include in your transaction to preserve privacy.
- **Dynamic Fee Estimation** — Real-time rates from the live mempool, ensuring competitive inclusion times.
- **AES-256-GCM Encryption** — Your seed phrase is heavily encrypted before it ever touches your local storage.
- **PBKDF2 Password Hashing** — 100,000 iterations with a random salt to protect against brute-force attacks.
- **Auto-Lock Security** — Automatically locks the wallet after 10 minutes of inactivity.
- **Strict Derivation Bounds** — Safely enforces standard BIP32 maximum derivation limits (up to 2,147,483,647) preventing path overflow and invalid key generation.
- **Voluntary Donation System** — A completely optional, transparent toggle to support development without hidden fees.

---

##  Security Model

| Component | Implementation |
|---|---|
| **Seed Phrase Storage** | AES-256-GCM encrypted, stored strictly in `browser.storage.local`. |
| **Password** | Never stored anywhere. Derived on the fly via PBKDF2-SHA256 (100k iterations). |
| **Private Keys** | Never stored. Derived purely on-demand at signing, and wiped from memory immediately. |
| **Session State** | Completely cleared from memory upon lock or browser close. |
| **Network Requests** | Openly documented and completely transparent. We strictly query public APIs for balances and fees (`mempool.space`, `blockchain.info`, `api.binance.com`, `mempool.ninja`). No tracking servers, no telemetry, and zero user-data collection. |

---

##  Prerequisites

- **Node.js** ≥ 18 ([download](https://nodejs.org))
- **npm** ≥ 9 (included with Node.js)

---

##  Installation & Build

### 1. Clone the repository

Click the copy button on the block below to copy the command, then paste it into your terminal:

```bash
git clone https://github.com/BozzooTech/bozzoo-btc-wallet.git
cd bozzoo-btc-wallet
```

### 2. Quick Setup (Recommended)

To install dependencies, compile the codebase, and package the extension for all browsers in one command, simply run:

```bash
npm run setup
```
The  files will be ready in the `dist/` directory.

### 3. Manual Build Commands

If you prefer to build or package manually:

**For Chromium-based Engines (Chrome, Brave, Edge):**
```bash
npm run build
```
Output is generated in `dist/chrome/`

**For Gecko-based Engines (Firefox, Tor):**
```bash
npm run build:firefox
```
Output is generated in `dist/firefox/`

**Build & Package Everything:**
```bash
npm run package:all
```
This compiles both versions and generates the final `.zip` artifacts in the `releases/` folder.

---

##  Loading the Extension in Your Browser

### Chromium-based Engines (Chrome, Brave, Edge)

1. Open your browser and navigate to the extensions page:
   - Chrome/Brave: `chrome://extensions`
   - Edge: `edge://extensions`
2. Toggle **Developer Mode** ON (top-right switch).
3. Click **Load unpacked**.
4. Select the `dist/chrome/` folder generated by the build process.
5. The Bozzoo wallet icon will immediately appear in your toolbar!

### Gecko-based Engines (Firefox, Tor Browser)

1. Ensure you have built the Firefox version (`npm run setup` or `npm run build:firefox`).
2. Open Firefox and navigate to the debugging page:
   ```
   about:debugging
   ```
3. Click **This Firefox** in the left sidebar.
4. Click **Load Temporary Add-on...**
5. Navigate to the `dist/firefox/` directory and select the `manifest.json` file.

> **Note:** Temporary add-ons in Firefox are removed when the browser closes. For a persistent install, the extension must be signed and published by Mozilla.

---

##  Development

### Run locally (Development Server)
```bash
npm start
```
Runs a local development server on port 8080 with hot-reloading for rapid UI iteration.

### Run tests
```bash
npm test
```

### Watch mode (auto-rebuild on file change)
```bash
npm run build:watch
```

### Type checking only (no build)
```bash
npm run type-check
```

---

##  Voluntary Donation

The wallet includes an **optional, transparent** donation checkbox on the send screen to support ongoing open-source development.

- **Opt-in only** - OFF by default.
- **Calculated Minimums** - Automatically calculates a minimum $0.30 equivalent to prevent network dust rejections.
- **Transparent** - The exact donation amount in BTC and USD is displayed clearly in the transaction breakdown before broadcasting.

### Support the Developer
If you love this wallet and want to support its ongoing development directly, you can send Bitcoin to our native SegWit donation address:
**`bc1quh3kk0499s9vngls6sfghuhrn52j9l0pvn8f3k`**


---

## 📁 Project Structure

```
bozzoo-btc-wallet/
├── src/
│   ├── background/       # Service worker (auto-lock, session)
│   ├── engine/           # Wallet logic (HD derivation, transactions, network APIs)
│   ├── security/         # AES-256-GCM encryption & PBKDF2
│   ├── ui/               # React popup UI (Webpack)
│   │   ├── components/   # Reusable UI components
│   │   └── pages/        # App pages (Dashboard, Send, Receive, Settings)
│   └── types/            # Shared TypeScript types
├── assets/               # Extension icons
├── dist/                 # Build output (generated, not committed)
│   ├── chrome/
│   └── firefox/
├── test/                 # Jest test suite
├── manifest.json         # Chrome/Edge manifest
├── manifest.firefox.json # Firefox manifest
└── webpack.config.js     # Build configuration
```

---

## &#x2764; Contributing

Contributions are incredibly welcome! Please open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📬 Contact

For support or security disclosures, reach out securely:
**Email:** `contact.bozzoo@proton.me`

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.