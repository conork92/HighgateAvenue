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

If you use **GitHub Actions** (see below), you need a **Google Cloud service account JSON key** (not a token, not the Supabase anon key).

1. In GCP: **IAM & Admin** → **Service Accounts** → **Create**
2. Name e.g. `github-deploy-highgate`
3. Roles:
   - **Cloud Run Admin**
   - **Storage Admin** (for pushing to Container Registry / gcr.io)
   - **Artifact Registry Writer** (for pushing images)
   - **Artifact Registry Create-on-push Writer** (so the first push can create the gcr.io repo)
   - **Service Account User** (so Cloud Build/Run can act as the default SA)
4. Open the new service account → **Keys** → **Add key** → **Create new key** → **JSON** → **Create**. A `.json` file downloads.
5. In **GitHub** → repo → **Settings** → **Secrets and variables** → **Actions** (repository secrets):
   - `GCP_PROJECT_ID` = your GCP project ID (e.g. `boxd-408821`)
   - `GCP_SA_KEY` = **the entire contents** of that JSON file (one line or multi-line is fine; include the whole file including `"private_key": "-----BEGIN PRIVATE KEY-----..."`).

**Via CLI (same result):**

Set your project and run:

```bash
export PROJECT_ID=boxd-408821   # e.g. boxd-408821
export SA_NAME=github-deploy-highgate
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Create the service account
gcloud iam service-accounts create $SA_NAME \
  --display-name="GitHub deploy Highgate Avenue" \
  --project=$PROJECT_ID

# Grant roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

# Create JSON key (save to current directory; add to .gitignore)
gcloud iam service-accounts keys create ./github-deploy-key.json \
  --iam-account=$SA_EMAIL \
  --project=$PROJECT_ID
```

Add the secrets in GitHub:

- **Option A (recommended – avoids paste/encoding issues):** Install [GitHub CLI](https://cli.github.com/) (`brew install gh`), then from the repo root:
  ```bash
  gh secret set GCP_PROJECT_ID --body "$PROJECT_ID"
  gh secret set GCP_SA_KEY < github-deploy-key.json
  ```
  Then delete the key file: `rm github-deploy-key.json`.

- **Option B (manual):** In GitHub → repo → **Settings** → **Secrets and variables** → **Actions**, add `GCP_PROJECT_ID` and `GCP_SA_KEY`. For `GCP_SA_KEY`, paste the **entire** contents of `github-deploy-key.json` as plain text (open in a text editor, copy all, paste). Use a plain-text editor; avoid pasting from some PDF/viewers that can inject non-JSON characters.

**If you see "failed to parse service account key JSON" or "unexpected token ... is not valid JSON":**

- The secret was likely corrupted by copy-paste (encoding, invisible characters, or truncated). Set it from the file instead: `gh secret set GCP_SA_KEY < github-deploy-key.json` (Option A above). If you no longer have the file, create a new key with `gcloud iam service-accounts keys create ./github-deploy-key.json --iam-account=$SA_EMAIL --project=$PROJECT_ID` and then run the `gh secret set` command.

**If you see "no key provided to sign" or "failed to sign jwt using private key":**

- `GCP_SA_KEY` must be the **service account JSON key file** from step 4, not the Supabase anon key and not an OAuth token.
- The JSON must include a non-empty `private_key` field (starts with `-----BEGIN PRIVATE KEY-----`). If you redacted or emptied it, create a **new** key for the same service account and paste the full file again.
- Paste the **entire** file: open the downloaded `.json` in a text editor, select all, copy, and paste into the secret value. Do not truncate or remove the middle of the key.
- Create a **new** key if the old one was never saved correctly: Service account → Keys → Add key → Create new key → JSON, then update the `GCP_SA_KEY` secret with the new file contents.

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

**If you see `Permission 'artifactregistry.repositories.uploadArtifacts' denied`:**  
Your service account needs **Artifact Registry Writer**. Add it (use your project ID and service account email):

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-deploy-highgate@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

Then re-run the failed workflow. You do **not** need to change the GitHub token or create a new key.

**If you see `gcr.io repo does not exist. Creating on push requires the artifactregistry.repositories.createOnPush permission`:**  
The first push needs permission to create the image repository. Grant the create-on-push role (use your project ID and service account email):

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-deploy-highgate@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.createOnPushWriter"
```

Then re-run the failed workflow. After the first successful push, the repo exists and later pushes will work.

---

## After first deploy

- **URL**: Cloud Run → service **highgate-avenue** → copy the URL.
- **Env vars**: Change them in Cloud Run → **Edit & deploy** → **Variables & secrets**, then deploy a new revision (or re-run the trigger/workflow).

Summary: do the one-time GCP setup, set env vars on Cloud Run, then choose either a **Cloud Build trigger** on `main` or **GitHub Actions** on `main` so that merging to main pushes the new version to the live website.
