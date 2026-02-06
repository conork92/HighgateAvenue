# Supabase Storage Setup Guide

This guide will help you set up Supabase Storage for image uploads in your Highgate Avenue application.

## Step 1: Create Storage Bucket

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"**
4. Configure the bucket:
   - **Name**: `renovation-images` (or update `STORAGE_BUCKET` in your `.env` if you use a different name)
   - **Public bucket**: ✅ **Enable this** (so images can be accessed via public URLs)
   - **File size limit**: 10MB (or adjust as needed)
   - **Allowed MIME types**: Leave empty to allow all image types, or specify: `image/png,image/jpeg,image/jpg,image/gif,image/webp`
5. Click **"Create bucket"**

## Step 2: Set Up Storage Policies

After creating the bucket, you need to set up Row Level Security (RLS) policies:

1. Go to **Storage** > **Policies** (or click on your bucket and go to the Policies tab)
2. Click **"New Policy"** or use the SQL Editor

### Option A: Public Read Access (Recommended for this use case)

Run this SQL in the Supabase SQL Editor:

```sql
-- Allow public to read files
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT
USING (bucket_id = 'renovation-images');

-- Allow public to insert files (for uploads)
CREATE POLICY "Public Upload" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'renovation-images');

-- Allow public to update files
CREATE POLICY "Public Update" ON storage.objects
FOR UPDATE
USING (bucket_id = 'renovation-images');

-- Allow public to delete files
CREATE POLICY "Public Delete" ON storage.objects
FOR DELETE
USING (bucket_id = 'renovation-images');
```

### Option B: Authenticated Access Only (More Secure)

If you want to restrict uploads to authenticated users only:

```sql
-- Allow authenticated users to read
CREATE POLICY "Authenticated Read" ON storage.objects
FOR SELECT
USING (bucket_id = 'renovation-images' AND auth.role() = 'authenticated');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated Upload" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'renovation-images' AND auth.role() = 'authenticated');

-- Allow authenticated users to update
CREATE POLICY "Authenticated Update" ON storage.objects
FOR UPDATE
USING (bucket_id = 'renovation-images' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete
CREATE POLICY "Authenticated Delete" ON storage.objects
FOR DELETE
USING (bucket_id = 'renovation-images' AND auth.role() = 'authenticated');
```

## Step 3: Update Environment Variables

Make sure your `.env` file includes:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
STORAGE_BUCKET=renovation-images
```

The `STORAGE_BUCKET` variable is optional - it defaults to `renovation-images` if not set.

## Step 4: Test the Setup

1. Start your application: `make start`
2. Open http://localhost:8000
3. Click **"+ Add Design"**
4. Try uploading an image
5. Check the Storage section in Supabase to see if the file was uploaded

## Troubleshooting

### "Bucket not found" error
- Make sure the bucket name matches exactly (case-sensitive)
- Verify the bucket exists in your Supabase Storage dashboard

### "Permission denied" error
- Check that your storage policies are set up correctly
- If using public access, make sure the bucket is set to "Public"

### Images not displaying
- Verify the bucket is set to "Public"
- Check that the `image_url` in the database is correct
- Look at browser console for CORS errors

### File size errors
- Check the bucket's file size limit
- Default is 10MB in the code, adjust if needed

## Storage Costs

Supabase offers:
- **Free tier**: 1GB storage, 2GB bandwidth/month
- **Pro tier**: 100GB storage, 250GB bandwidth/month

For a personal renovation ideas project, the free tier should be more than sufficient.
