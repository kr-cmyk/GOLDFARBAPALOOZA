# 🏀 GOLDFARBAPALOOZA
### NCAA Tournament Betting Tracker — Duke Blue Edition

---

## 🚀 Deploy to Railway in 5 Minutes

### Step 1 — Upload to GitHub

1. Go to **github.com** and sign in (create a free account if needed)
2. Click the **+** button → **New repository**
3. Name it `goldfarbapalooza`, set it to **Public**, click **Create repository**
4. On the next screen, click **uploading an existing file**
5. Upload ALL these files maintaining the folder structure:
   ```
   goldfarbapalooza/
   ├── index.html
   ├── package.json
   ├── vite.config.js
   ├── railway.json
   ├── .gitignore
   └── src/
       ├── main.jsx
       ├── App.jsx
       └── index.css
   ```
   > **Important:** Create the `src` folder by dragging it in, or use GitHub Desktop (see below)
6. Click **Commit changes**

#### Easier option — GitHub Desktop
1. Download **GitHub Desktop** at desktop.github.com
2. File → New Repository → name it `goldfarbapalooza`
3. Copy all the files into the folder it creates
4. Click **Commit to main** → **Publish Repository**

---

### Step 2 — Deploy on Railway

1. Go to **railway.app** and sign up with your GitHub account
2. Click **New Project** → **Deploy from GitHub repo**
3. Select `goldfarbapalooza`
4. Railway auto-detects it's a Node/Vite project and runs `npm run build`
5. Once deployed, click **Settings** → **Networking** → **Generate Domain**
6. You'll get a public URL like `goldfarbapalooza.up.railway.app`

**That's it.** Share the URL with the group and everyone can open it on their phone. 🎉

---

## 💻 Run Locally (optional)

If you have Node.js installed:

```bash
cd goldfarbapalooza
npm install
npm run dev
```

Opens at **http://localhost:5173**

---

## 📱 Features

- **Live Scores** — pulls today's NCAA Men's Basketball schedule from ESPN, refreshes every 10 seconds
- **🔥 YOUR BET highlighting** — games with active wagers glow gold and float to the top
- **Bet Tracker** — log bets across all tournament rounds, mark W/L/P
- **Running P&L** — cumulative record, net profit/loss, win % across the whole tournament
- **Per-round stats** — each round shows its own record and P&L
- **Add new bets** — modal for logging new bets as the tournament progresses
- **Persistent storage** — bets saved in browser localStorage, survive refreshes

---

## 🏀 Current Bets (Round of 64)

| Pick | Type | Odds | Stake |
|------|------|------|-------|
| TCU ML | Moneyline | +125 | $150 |
| Troy +13 | Spread | -110 | $150 |
| Louisville -4.5 | Spread | -110 | $150 |
| Wisconsin / High Point Under 162 | Total | -110 | $150 |
| North Dakota State +16 | Spread | -110 | $150 |
| Vanderbilt -12 | Spread | -110 | $150 |
| Siena Over 138.5 | Total | -110 | $150 |
| Hawaii / Arkansas Over 158.5 | Total | -110 | $150 |

Total wagered: **$1,200**
