# Vercel Deployment Guide for MTG Online

Your Next.js frontend is on Vercel (serverless), but it needs a socket.io server running elsewhere since Vercel doesn't support persistent connections.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Vercel         │         │ Railway/Render   │
│  (Frontend)     │────────▶│  (Socket.io)     │
│  Next.js        │         │  socket-server.js│
└─────────────────┘         └──────────────────┘
       ▲                             ▲
       │        PostgreSQL (Neon)   │
       └─────────────────────────────┘
```

## Step 1: Deploy Socket Server to Railway

1. **Create a Railway account** at [railway.app](https://railway.app)

2. **Deploy from this repo:**
   - New Project → Import from GitHub → Select `EWilliamHertz/mtg`
   - Set **Start Command**: `node socket-server.js`
   - Add Environment Variables:
     ```
     DATABASE_URL=postgresql://... (copy from Neon)
     ALLOWED_ORIGINS=https://mtg-liart-seven.vercel.app
     SOCKET_PORT=3001
     ```

3. **Get the deployed URL** from Railway (e.g., `https://mtg-socket-api-prod.up.railway.app`)

## Step 2: Update Vercel Frontend

1. **Add environment variable to Vercel:**
   - Go to Vercel Dashboard → Settings → Environment Variables
   - Add: `NEXT_PUBLIC_SOCKET_URL=https://mtg-socket-api-prod.up.railway.app`
   - Redeploy

## Step 3: Local Development

To test locally with real database:

```bash
# Terminal 1: Next.js frontend on port 3000
npm run dev

# Terminal 2: Socket.IO server on port 3001
node socket-server.js
```

Visit `http://localhost:3000` and the frontend will connect to `http://localhost:3001`.

## Troubleshooting

**"Failed to connect to socket.io"?**
- Check that socket-server.js is running
- Check ALLOWED_ORIGINS includes your frontend URL
- Check browser console for exact error

**Server running but no events happening?**
- Verify DATABASE_URL works (test with `psql`)
- Check socket-server.js logs for connection errors

## Alternative Hosting

Can't use Railway? Try:
- **Render.com** — Similar setup, free tier available
- **Heroku** — Same architecture (paid now)
- **Fly.io** — Global deployment, generous free tier

All follow the same pattern: deploy `socket-server.js` separately, update `NEXT_PUBLIC_SOCKET_URL`.
