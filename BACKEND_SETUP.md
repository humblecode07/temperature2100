# Python Backend Setup

This project uses `FastAPI`.

## Actual backend files in this app

- API app: `my-app/python_backend/app/main.py`
- Vercel Python entrypoint: `my-app/api/index.py`
- Python dependencies: `my-app/requirements.txt`
- Frontend API caller: `my-app/app/page.tsx`

`python-vercel-api/` looks like an older standalone copy. For the deployed frontend in `my-app`, use the files above.

## 1. Run the backend locally

Open a terminal in `my-app` and run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn python_backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Then test:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Expected result:

```json
{"status":"ok"}
```

Open FastAPI docs here:

- `http://127.0.0.1:8000/docs`

## 2. Connect the frontend locally

Create `my-app/.env.local` with:

```env
NEXT_PUBLIC_SCENARIO_API_BASE=http://127.0.0.1:8000
```

Then run the frontend:

```powershell
npm run dev
```

Frontend:

- `http://localhost:3000`

Backend route used by the frontend:

- `POST http://127.0.0.1:8000/simulate`

## 3. If CORS blocks the request

Set this in the backend terminal before starting `uvicorn`, or add it in your deployment platform env vars:

```powershell
$env:CORS_ALLOW_ORIGINS="http://localhost:3000,https://your-project.vercel.app"
```

If you use a custom Vercel domain, include that too:

```powershell
$env:CORS_ALLOW_ORIGINS="http://localhost:3000,https://your-project.vercel.app,https://yourdomain.com"
```

## 4. Quick internet testing

If you only want temporary public testing, use a tunnel:

```powershell
ngrok http 8000
```

Then set:

```env
NEXT_PUBLIC_SCENARIO_API_BASE=https://your-ngrok-url
```

Also allow that frontend origin in `CORS_ALLOW_ORIGINS`.

## 5. Easiest deployment options

### Option A: Same Vercel project

This app already has `my-app/api/index.py`, so Vercel can run the Python API in the same project.

In production, the frontend now falls back to:

- `/api/simulate`
- `/api/health`

That means if frontend and backend are deployed together in the same Vercel project, you may not need `NEXT_PUBLIC_SCENARIO_API_BASE` at all.

Vercel settings for this option:

- Root Directory: `my-app`
- Build Command: leave empty
- Output Directory: leave empty
- Install Command: leave empty

Do not point Vercel at the repo root, and do not point it at `my-app/python-vercel-api` unless you only want the standalone Python API without the Next.js frontend.

If Vercel was previously connected to the wrong folder, update the project setting in:

- Vercel Dashboard -> Project -> Settings -> General -> Root Directory

Then redeploy.

### Option A.1: If you deploy only the standalone Python API

The older standalone API copy lives in `my-app/python-vercel-api`.

Vercel settings for this option:

- Root Directory: `my-app/python-vercel-api`

Its `vercel.json` must reference `api/index.py`. If you see this error:

```text
The pattern "index.py" defined in `functions` doesn't match any Serverless Functions inside the `api` directory.
```

that means Vercel is reading the standalone API config and the function path is wrong.

### Option B: Render or Railway

Use these settings:

- Root directory: `my-app`
- Install command: `pip install -r requirements.txt`
- Start command: `uvicorn python_backend.app.main:app --host 0.0.0.0 --port $PORT`

Set env vars:

- `CORS_ALLOW_ORIGINS=https://your-project.vercel.app`

Then set this in Vercel frontend env vars:

- `NEXT_PUBLIC_SCENARIO_API_BASE=https://your-render-or-railway-url`

## 6. Common mistakes

- `404`: frontend is calling the wrong path. This app needs `/simulate`, or `/api/simulate` when using same-project Vercel.
- `Failed to fetch`: backend is not running, wrong URL, or blocked by CORS.
- `CORS error`: backend did not allow the frontend origin.
- `Connection refused`: wrong port or the Python server is not started.
- `Scenario API is not configured`: local frontend is missing `NEXT_PUBLIC_SCENARIO_API_BASE`.

## 7. Minimal test request

```powershell
$body = @{
  target_year = 2035
  simulations = 250
  co2_modifier = 0
  forest_loss_modifier = 0
  renewables_modifier = 0
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://127.0.0.1:8000/simulate `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```
