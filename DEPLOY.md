# دليل النشر — Deploy Guide

This app has two parts that run together as one Node server:

- **Frontend** (the public agencies page + the `/admin` page)
- **Backend API** + a small **SQLite database** that stores the agencies, the admin
  account, and uploaded logos.

Because there's a database and uploaded files, you need a host that runs Node **and
keeps a persistent disk** (a "volume"). The site is already Docker-ready, so any of the
hosts below work. **Railway is the easiest** — start there.

---

## Important: persistent storage

The database file and uploaded logos are saved under one folder. In production that folder
must live on a **persistent volume**, otherwise your changes disappear on every redeploy.

Set these two environment variables to point inside the volume:

```
DB_PATH=/data/data.db
UPLOAD_DIR=/data/uploads
```

…and mount the volume at `/data`. (Both are already the defaults in the Dockerfile.)

---

## Environment variables to set on the host

| Variable         | What it's for                                        | Example                        |
| ---------------- | ---------------------------------------------------- | ------------------------------ |
| `ADMIN_EMAIL`    | Your admin login email (seeded on first run)         | `you@yourdomain.com`           |
| `ADMIN_PASSWORD` | Your admin password (seeded on first run)            | a strong password              |
| `JWT_SECRET`     | Signs login sessions — use a long random string      | 40+ random characters          |
| `DB_PATH`        | Database file location (on the volume)               | `/data/data.db`                |
| `UPLOAD_DIR`     | Uploaded logos location (on the volume)              | `/data/uploads`                |

> `ADMIN_EMAIL` / `ADMIN_PASSWORD` are only used to create the admin the **first** time the
> database is empty. Changing them later won't change an existing account.

---

## Step 0 — Put the code on GitHub (needed for Railway/Render)

From this folder:

```bash
git init
git add .
git commit -m "Initial commit: agencies site + admin"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

---

## Option A — Railway (recommended, easiest)

1. Go to **railway.app** and sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** pick your repo. Railway detects the
   `Dockerfile` and builds automatically.
3. Add a volume: open the service → **Variables/Settings → Volumes → New Volume**, mount
   path = **`/data`**.
4. Open **Variables** and add the env vars from the table above (`ADMIN_EMAIL`,
   `ADMIN_PASSWORD`, `JWT_SECRET`, `DB_PATH=/data/data.db`, `UPLOAD_DIR=/data/uploads`).
   Railway provides `PORT` automatically — don't set it.
5. **Settings → Networking → Generate Domain** to get a public URL.
6. Open the URL → public site. Open `URL/admin` → log in with your admin email/password.

To use your own domain later: **Settings → Networking → Custom Domain**, then add the CNAME
record Railway shows you at your domain registrar.

---

## Option B — Fly.io (free volume, CLI-based)

```bash
# install flyctl, then:
fly launch --no-deploy          # detects the Dockerfile; pick a name/region
fly volumes create data --size 1   # 1 GB persistent volume
```

In the generated `fly.toml`, mount the volume and set the internal port:

```toml
[mounts]
  source = "data"
  destination = "/data"

[http_service]
  internal_port = 8080
```

Set the internal port in the app too (Fly doesn't inject `PORT` the same way):

```bash
fly secrets set PORT=8080 ADMIN_EMAIL=... ADMIN_PASSWORD=... JWT_SECRET=... \
  DB_PATH=/data/data.db UPLOAD_DIR=/data/uploads
fly deploy
```

---

## Option C — Your own VPS (DigitalOcean/Hetzner/etc.)

If you already have a Linux server with Docker:

```bash
# on the server, in the project folder:
docker build -t agencies-site .
docker run -d --name agencies \
  -p 80:8080 \
  -e PORT=8080 \
  -e ADMIN_EMAIL='you@yourdomain.com' \
  -e ADMIN_PASSWORD='your-strong-password' \
  -e JWT_SECRET='a-long-random-string' \
  -e DB_PATH=/data/data.db \
  -e UPLOAD_DIR=/data/uploads \
  -v /srv/agencies-data:/data \
  agencies-site
```

The site is now on `http://<server-ip>/`. Put it behind Nginx + a free Let's Encrypt
certificate for HTTPS and your domain.

---

## After deploying — first thing to do

1. Visit `your-url/admin`, log in.
2. **Change the admin password** is done by setting a strong `ADMIN_PASSWORD` *before* the
   first deploy (it seeds the account). If you already deployed with a weak one, the easiest
   reset is to delete the volume's `data.db` and redeploy, which re-seeds from the env vars.
3. Note: 3 of the seeded logos (مدن، المراجعين الداخليين، المساحة الجيومكانية) were broken
   source files — re-upload real images for them from the admin page.

---

## Running locally (for reference)

```bash
npm install
npm run dev      # frontend on http://localhost:5173 , API on http://localhost:3001
```

Default local admin: `admin@example.com` / `admin1234` (override via a `.env` file —
see `.env.example`).
