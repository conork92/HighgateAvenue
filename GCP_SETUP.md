# Google Cloud Platform (GCP) Storage Setup Guide

This guide will help you set up Google Cloud Storage for image uploads in your Highgate Avenue application.

## Prerequisites

- A Google Cloud Platform account
- A GCP project created
- Billing enabled (required for Cloud Storage, but free tier available)

## Step 1: Create a Cloud Storage Bucket

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create a new one)
3. Navigate to **Cloud Storage** > **Buckets**
4. Click **"Create Bucket"**
5. Configure your bucket:
   - **Name**: `highgate-avenue-images` (must be globally unique)
   - **Location type**: Choose based on your needs (Multi-region recommended for availability)
   - **Storage class**: Standard (or choose based on your access patterns)
   - **Access control**: **Uniform** (recommended) or Fine-grained
   - **Public access**: Enable if you want public URLs (recommended for this use case)
6. Click **"Create"**

## Step 2: Make the Bucket Public (Optional but Recommended)

If you want images to be publicly accessible:

1. Go to your bucket in Cloud Storage
2. Click on the **"Permissions"** tab
3. Click **"Grant Access"**
4. Add:
   - **Principal**: `allUsers`
   - **Role**: `Storage Object Viewer`
5. Click **"Save"**

**Note**: This makes all objects in the bucket publicly readable. For production, consider using signed URLs instead.

## Step 3: Create a Service Account

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **"Create Service Account"**
3. Fill in:
   - **Service account name**: `highgate-avenue-storage`
   - **Description**: "Service account for Highgate Avenue image uploads"
4. Click **"Create and Continue"**
5. Grant roles:
   - **Storage Object Admin** (or **Storage Admin** for full access)
6. Click **"Continue"** and then **"Done"**

## Step 4: Create and Download Service Account Key

1. Click on the service account you just created
2. Go to the **"Keys"** tab
3. Click **"Add Key"** > **"Create new key"**
4. Choose **JSON** format
5. Click **"Create"** - the JSON file will download automatically
6. **Save this file securely** - you'll need it for authentication

## Step 5: Configure Your Application

You have three options for providing credentials:

### Option A: Service Account JSON File (Recommended for Local Development)

1. Save the downloaded JSON file (e.g., as `gcp-credentials.json`)
2. Place it in your project directory (but **add it to .gitignore**!)
3. Set environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/gcp-credentials.json
   ```
   Or in your `.env` file:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json
   ```

### Option B: JSON String in Environment Variable (Recommended for Docker/Production)

1. Copy the entire contents of the JSON file
2. Set it as an environment variable (as a single-line JSON string):
   ```env
   GCP_CREDENTIALS_JSON='{"type":"service_account","project_id":"your-project",...}'
   ```
   
   Or in Docker Compose:
   ```yaml
   environment:
     - GCP_CREDENTIALS_JSON=${GCP_CREDENTIALS_JSON}
   ```

### Option C: Default Credentials (For GCP Environments)

If running on Google Cloud (Cloud Run, Compute Engine, etc.), you can use the default service account or metadata service.

## Step 6: Update Environment Variables

Add these to your `.env` file:

```env
# GCP Storage Configuration
GCP_PROJECT_ID=your-project-id
GCP_BUCKET_NAME=highgate-avenue-images
GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json
# OR use JSON string instead:
# GCP_CREDENTIALS_JSON='{"type":"service_account",...}'
```

## Step 7: Test the Setup

1. Start your application: `make start`
2. Open http://localhost:8000
3. Click **"+ Add Design"**
4. Try uploading an image
5. Check your GCP Storage bucket to see if the file was uploaded

## Security Best Practices

1. **Never commit credentials to git**: Always add `gcp-credentials.json` to `.gitignore`
2. **Use least privilege**: Only grant the minimum permissions needed
3. **Rotate keys regularly**: Regenerate service account keys periodically
4. **Use signed URLs for production**: Instead of making buckets public, use signed URLs for temporary access
5. **Enable bucket versioning**: Helps recover from accidental deletions

## Cost Considerations

Google Cloud Storage pricing (as of 2024):
- **Free tier**: 5GB storage, 5,000 Class A operations, 50,000 Class B operations per month
- **Standard storage**: ~$0.020 per GB/month
- **Operations**: Class A (writes) ~$0.05 per 10,000, Class B (reads) ~$0.004 per 10,000

For a personal renovation ideas project, the free tier should be more than sufficient.

## Troubleshooting

### "Bucket not found" error
- Verify the bucket name is correct (case-sensitive)
- Check that the bucket exists in your GCP project
- Ensure you're using the correct project ID

### "Permission denied" error
- Verify your service account has the correct permissions
- Check that the credentials file is valid
- Ensure the service account key hasn't been revoked

### "Authentication failed" error
- Verify the credentials JSON is valid
- Check that `GOOGLE_APPLICATION_CREDENTIALS` points to the correct file
- Ensure the service account key hasn't expired

### Images not displaying
- Check bucket public access settings
- Verify the blob was made public after upload
- Check CORS settings if accessing from a browser

## Alternative: Using Signed URLs (More Secure)

For production, consider using signed URLs instead of making the bucket public:

```python
# Generate signed URL (valid for 1 hour)
url = blob.generate_signed_url(
    expiration=datetime.timedelta(hours=1),
    method='GET'
)
```

This requires updating the upload endpoint to generate signed URLs instead of making blobs public.
