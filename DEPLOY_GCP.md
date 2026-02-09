# Deploy Highgate Avenue to Google Cloud (merge to main → live site)

You can use either **Cloud Build** (GCP only) or **GitHub Actions** so that merging to `main` builds and deploys the app to **Cloud Run**.

---

## One-time Google Cloud setup

Do this once per project.

### 1. Create / select a GCP project

- Go to [Google Cloud Console](https://console.cloud.google.com)
- Create a project or select existing (e.g. `boxd-408821`)
- Note your **Project ID**

### 2. Enable APIs

```bash
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

Or in Console: **APIs & Services** → **Enable APIs** → enable **Cloud Run**, **Container Registry**, **Cloud Build**.

### 3. Set environment variables on Cloud Run

Your app needs Supabase and GCP env vars at runtime. Set them on the Cloud Run service **before** or **at first deploy**.

**Option A – Use your existing `.env` file (recommended)**

If you already have a `.env` in the project (same folder as `app.py`), deploy with it so Cloud Run gets those variables. Run from the project root:

```bash
cd /path/to/HighgateAvenue
gcloud run deploy highgate-avenue \
  --source . \
  --region europe-west1 \
  --platform managed \
  --allow-unauthenticated \
  --env-vars-file .env
```

The `.env` format is one variable per line: `KEY=value`. Cloud Run will use these at runtime. (Do not commit `.env`; it’s in `.gitignore`.)

**Option B – Deploy first, then set env vars in the console**

Deploy without passing env vars, then add them in the UI:

```bash
gcloud run deploy highgate-avenue \
  --source . \
  --region europe-west1 \
  --platform managed \
  --allow-unauthenticated
```

Then in [Cloud Run](https://console.cloud.google.com/run) → service **highgate-avenue** → **Edit & deploy new revision** → **Variables & secrets** → add your variables. Save and deploy.

**Option C – Use a YAML env file**

If you prefer a separate `env.yaml` (not `.env`), create it and use the `cat` command from the docs below—but **Option A with `.env` is simpler** if you already have one.

**Option D – Secret Manager (production)**

Store secrets in Secret Manager, then in Cloud Run add them as “Reference a secret” so the value never appears in the console.

### 4. (GitHub Actions only) Service account for deploy

If you use **GitHub Actions** (see below), create a service account that can push images and deploy:

1. **IAM & Admin** → **Service Accounts** → **Create**
2. Name e.g. `github-deploy-highgate`
3. Roles:
   - **Cloud Run Admin**
   - **Storage Admin** (for pushing to Container Registry)
   - **Service Account User** (so Cloud Build/Run can act as the default SA)
4. Create a **JSON key**, download it.
5. In **GitHub** → repo → **Settings** → **Secrets and variables** → **Actions**:
   - `GCP_PROJECT_ID` = your GCP project ID
   - `GCP_SA_KEY` = entire contents of the JSON key file

---

## Option A: Deploy on merge using Cloud Build (no GitHub Actions)

Every push/merge to `main` runs a build in GCP and deploys to Cloud Run.

1. In [Cloud Build](https://console.cloud.google.com/cloud-build/triggers): **Create trigger**
2. **Source**: connect your repo (GitHub / Bitbucket / etc.)
3. **Event**: “Push to a branch”
4. **Branch**: `^main$`
5. **Configuration**: “Cloud Build configuration file”
6. **Location**: `cloudbuild.yaml` (repo root)
7. Save

From then on, merging to `main` will run `cloudbuild.yaml`, build the image, push to Container Registry, and deploy to Cloud Run. Your site URL will be like:

`https://highgate-avenue-xxxxx-uc.a.run.app`

---

## Option B: Deploy on merge using GitHub Actions

Every push/merge to `main` runs the workflow in `.github/workflows/deploy-gcp.yml`, which builds the image and deploys to Cloud Run.

1. Complete the **One-time setup** above, including the **Service account for deploy** and GitHub secrets (`GCP_PROJECT_ID`, `GCP_SA_KEY`).
2. Push the workflow file to your repo (it’s already in the repo).
3. Merge to `main` (or push to `main`). The **Actions** tab will show “Deploy to Google Cloud Run”; when it’s green, the site is updated.

No Cloud Build trigger is required; everything runs in GitHub.

---

## After first deploy

- **URL**: Cloud Run → service **highgate-avenue** → copy the URL.
- **Env vars**: Change them in Cloud Run → **Edit & deploy** → **Variables & secrets**, then deploy a new revision (or re-run the trigger/workflow).

Summary: do the one-time GCP setup, set env vars on Cloud Run, then choose either a **Cloud Build trigger** on `main` or **GitHub Actions** on `main` so that merging to main pushes the new version to the live website.
