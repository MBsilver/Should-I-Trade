# Should I Be Trading? — Deployment Guide

A Bloomberg Terminal-style market dashboard that scores the current trading environment using live Yahoo Finance data.

---

## Option 1: Railway (Recommended — Easiest)

Railway offers a free Hobby tier with 500 hours/month (enough for always-on).

### Steps

1. **Push this repo to GitHub**
   ```bash
   cd trading-dashboard
   git init
   git add -A
   git commit -m "initial commit"
   gh repo create should-i-be-trading --public --push --source=.
   ```
   Or create a repo at github.com/new and push manually.

2. **Go to [railway.app](https://railway.app)** and sign in with GitHub

3. **Click "New Project" → "Deploy from GitHub Repo"**

4. **Select your `should-i-be-trading` repo**

5. Railway will auto-detect `railway.toml` and:
   - Run `npm ci && npm run build`
   - Start with `npm start`
   - Assign a public URL

6. **Click "Settings" → "Networking" → "Generate Domain"** to get your public URL

That's it. The app will be live at `https://your-app.up.railway.app`.

---

## Option 2: Render (Free Tier)

Render has a free web service tier (spins down after 15 min of inactivity, cold starts in ~30s).

### Steps

1. **Push to GitHub** (same as step 1 above)

2. **Go to [render.com](https://render.com)** and sign in with GitHub

3. **Click "New" → "Web Service"**

4. **Connect your repo** and configure:
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free

5. Click **"Create Web Service"**

Your app will be live at `https://your-app.onrender.com`.

> Note: Render free tier sleeps after 15 min of no traffic. First visit after sleep takes ~30 seconds. Paid tier ($7/mo) stays always-on.

---

## Option 3: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# From the project directory
fly launch --name should-i-be-trading
fly deploy
```

Fly has a free tier with 3 shared VMs. The Dockerfile is included and will be auto-detected.

---

## Option 4: VPS (DigitalOcean, Linode, etc.)

```bash
# On your VPS
git clone <your-repo-url>
cd trading-dashboard
npm ci
npm run build
PORT=3000 npm start

# Or with Docker
docker build -t trading-dashboard .
docker run -d -p 3000:5000 --name trading-dashboard trading-dashboard
```

Use `pm2` or `systemd` to keep it running:
```bash
npm install -g pm2
pm2 start dist/index.cjs --name trading-dashboard
pm2 save
pm2 startup
```

---

## How It Works

- **Backend** (Express): Fetches live quotes and 1-year historical data from Yahoo Finance v8 API, computes scoring (volatility, trend, breadth, momentum, macro), caches results
- **Frontend** (React): Bloomberg-terminal dark theme, auto-refresh toggle (15min/OFF), manual refresh, Swing/Day mode
- **Single server** serves both the API (`/api/dashboard`) and the static frontend
- **No database required** — all data is fetched live from Yahoo Finance and computed in memory
- **No API keys required** — uses Yahoo Finance's public v8 chart API

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server port (Railway/Render set this automatically) |
| `NODE_ENV` | `production` | Must be `production` for built app |

## Local Development

```bash
npm install
npm run dev
# Open http://localhost:5000
```
