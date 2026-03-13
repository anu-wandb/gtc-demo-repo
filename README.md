# GTC Isaac Lab GPU Training Demo

Conference attendees fill out a form to trigger real RL training jobs (Isaac Lab on CoreWeave GPUs), tracked via W&B.

## Architecture

| Layer    | Stack                     | Deploys to |
|----------|---------------------------|------------|
| Frontend | Next.js 14 + Tailwind CSS | Vercel     |
| Backend  | FastAPI + SQLite          | Docker     |

## Backend

### Env vars

| Variable               | Required | Default | Description                          |
|------------------------|----------|---------|--------------------------------------|
| `NORTHFLANK_TOKEN`     | yes      |         | Northflank API token                 |
| `NORTHFLANK_PROJECT_ID`| yes      |         | Northflank project containing the job|
| `NORTHFLANK_JOB_ID`    | yes      |         | Northflank job template to run       |
| `MAX_RUNS_PER_TEAM`   | no       | `5`     | Max training runs per W&B team       |
| `ALLOWED_ORIGINS`     | no       | `*`     | CORS origins (comma-separated)       |

### Run locally

```bash
cd backend
pip install -r requirements.txt

export NORTHFLANK_TOKEN="..."
export NORTHFLANK_PROJECT_ID="..."
export NORTHFLANK_JOB_ID="..."

uvicorn main:app --reload
```

The API starts at `http://localhost:8000`. SQLite database is created automatically at `./data/runs.db`.

### Docker

```bash
cd backend
docker build -t gtc-backend .
docker run -p 8000:8000 \
  -e NORTHFLANK_TOKEN="..." \
  -e NORTHFLANK_PROJECT_ID="..." \
  -e NORTHFLANK_JOB_ID="..." \
  gtc-backend
```

## Frontend

### Env vars

| Variable              | Required | Default                  | Description             |
|-----------------------|----------|--------------------------|-------------------------|
| `NEXT_PUBLIC_API_URL` | no       | `http://localhost:8000`  | Backend API base URL    |

### Run locally

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:3000`.

### Deploy to Vercel

Set `NEXT_PUBLIC_API_URL` to your deployed backend URL in Vercel environment variables.
