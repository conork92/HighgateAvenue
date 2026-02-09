from flask import Flask, render_template, jsonify, request, redirect, url_for, abort, send_from_directory
from flask_cors import CORS
import os
import uuid
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from google.cloud import storage
from google.oauth2 import service_account
import json
import requests
import hmac
import hashlib
import base64
from urllib.parse import quote
from io import BytesIO
import boto3
from botocore.client import Config

load_dotenv()

app = Flask(__name__)
CORS(app)

# Disable caching for static files
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

# Add no-cache headers for all responses
@app.after_request
def after_request(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Configuration
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Supabase configuration (for database)
# Use the anon/public API key from Project Settings → API in Supabase dashboard, NOT the Postgres connection string.
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY') or os.getenv('SUPABASE_ANON_KEY')
# Service role key for storage operations (bypasses RLS)
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
# S3-compatible storage credentials
SUPABASE_ACCESS_KEY_ID = os.getenv('SUPABASE_ACCESS_KEY_ID_BUCKET')
SUPABASE_SECRET_ACCESS_KEY = os.getenv('SUPABASE_ACCESS_KEY_BUCKET')

# GCP Storage configuration
GCP_BUCKET_NAME = os.getenv('GCP_BUCKET_NAME', 'highgate-avenue-images')
GCP_PROJECT_ID = os.getenv('GCP_PROJECT_ID')
GCP_CREDENTIALS_JSON = os.getenv('GCP_CREDENTIALS_JSON')  # JSON string or path to file
GCP_CREDENTIALS_PATH = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')  # Path to credentials file

# Initialize Supabase client (for database)
supabase: Client = None
supabase_storage: Client = None  # Client with service role for storage operations
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        # Create separate client for storage with service role key if available
        if SUPABASE_SERVICE_ROLE_KEY:
            supabase_storage = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        else:
            # Fall back to regular key if service role not available
            supabase_storage = supabase
            app.logger.warning("SUPABASE_SERVICE_ROLE_KEY not set. Storage uploads may fail if RLS policies are restrictive.")
    except Exception as e:
        import logging
        logging.warning(f"Supabase client not available: {e}. DB features (plans, upload) will be disabled.")
        supabase = None
        supabase_storage = None

# Initialize GCP Storage client
gcp_storage_client = None
gcp_bucket = None

def init_gcp_storage():
    """Initialize GCP Storage client"""
    global gcp_storage_client, gcp_bucket
    try:
        # Try to get credentials from environment
        credentials = None
        
        # Option 1: Credentials file path
        if GCP_CREDENTIALS_PATH and os.path.exists(GCP_CREDENTIALS_PATH):
            credentials = service_account.Credentials.from_service_account_file(
                GCP_CREDENTIALS_PATH
            )
        # Option 2: JSON string in environment variable
        elif GCP_CREDENTIALS_JSON:
            try:
                # Try parsing as JSON string
                creds_dict = json.loads(GCP_CREDENTIALS_JSON)
                credentials = service_account.Credentials.from_service_account_info(creds_dict)
            except json.JSONDecodeError:
                # If not JSON, treat as file path
                if os.path.exists(GCP_CREDENTIALS_JSON):
                    credentials = service_account.Credentials.from_service_account_file(
                        GCP_CREDENTIALS_JSON
                    )
        # Option 3: Use default credentials (for GCP environments or gcloud auth)
        else:
            # Will use default credentials if running on GCP or with gcloud auth
            credentials = None
        
        if credentials:
            gcp_storage_client = storage.Client(credentials=credentials, project=GCP_PROJECT_ID)
        else:
            gcp_storage_client = storage.Client(project=GCP_PROJECT_ID)
        
        gcp_bucket = gcp_storage_client.bucket(GCP_BUCKET_NAME)
        app.logger.info(f"GCP Storage initialized with bucket: {GCP_BUCKET_NAME}")
    except Exception as e:
        app.logger.error(f"Failed to initialize GCP Storage: {str(e)}")
        gcp_storage_client = None
        gcp_bucket = None

# Initialize GCP Storage on startup
init_gcp_storage()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def upload_to_supabase_storage_s3(file_content, file_path, content_type, bucket_name='image_hosting_bucket'):
    """Upload file to Supabase Storage using S3-compatible API with access keys via boto3"""
    if not SUPABASE_ACCESS_KEY_ID or not SUPABASE_SECRET_ACCESS_KEY:
        raise ValueError("Supabase storage access keys not configured")
    
    # Extract project reference from URL
    project_ref = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
    
    # S3-compatible endpoint format for Supabase
    # Format: https://{project_ref}.storage.supabase.co/storage/v1/s3
    endpoint_url = f"https://{project_ref}.storage.supabase.co/storage/v1/s3"
    
    # Create S3 client with Supabase endpoint
    s3_client = boto3.client(
        's3',
        endpoint_url=endpoint_url,
        aws_access_key_id=SUPABASE_ACCESS_KEY_ID,
        aws_secret_access_key=SUPABASE_SECRET_ACCESS_KEY,
        config=Config(
            signature_version='s3v4',
            s3={
                'addressing_style': 'path'
            }
        )
    )
    
    # Upload file using boto3
    # Use put_object for binary data
    file_obj = BytesIO(file_content)
    
    try:
        s3_client.put_object(
            Bucket=bucket_name,
            Key=file_path,
            Body=file_obj,
            ContentType=content_type
        )
        
        # Return a mock response object for compatibility
        class MockResponse:
            status_code = 200
            text = "Upload successful"
        
        return MockResponse()
    except Exception as e:
        error_msg = str(e)
        # Try to extract more details from boto3 exceptions
        if hasattr(e, 'response'):
            error_msg = f"{error_msg} - {e.response.get('Error', {}).get('Message', '')}"
        raise Exception(f"Upload failed: {error_msg}")

# Design sections: single source of truth for labels and images (used by / and /designs/<id>/)
DESIGN_SECTIONS = {
    'exterior': {
        'label': 'Exterior',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/Outside.png', 'alt': 'Highgate Avenue Exterior'},
        ],
    },
    'floor-plans': {
        'label': 'Floor plans',
        'layout': 'double',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/floor_plans/old_floor_plan.PNG', 'alt': 'Original floor plan'},
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/floor_plans/floor_plan_clear.PNG', 'alt': 'New floor plan'},
        ],
    },
    'entrance': {
        'label': 'Entrance',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/entrance/entrance_hall_2.JPG', 'alt': 'Entrance hall'},
        ],
    },
    'stairs': {
        'label': 'Stairs into entrance',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/stairs/stairs.jpg', 'alt': 'Stairs into entrance'},
        ],
    },
    'hallway': {
        'label': 'Hallway',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/hallway/hallway.PNG', 'alt': 'Hallway'},
        ],
    },
    'living-room': {
        'label': 'Living Room',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/living_room/living_room.jpg', 'alt': 'Living room'},
        ],
    },
    'kitchen': {
        'label': 'Kitchen',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/kitchen/full_living_room_kitchen.JPG', 'alt': 'Kitchen and living area'},
        ],
    },
    'dining-room': {
        'label': 'Dining Room',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/dining_room/dining_room.jpg', 'alt': 'Dining room'},
        ],
    },
    'master-bedroom': {
        'label': 'Master bedroom',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/main_bedroom/master_bedroom.PNG', 'alt': 'Master bedroom'},
        ],
    },
    'en-suite': {
        'label': 'En suite',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/en_suite/ensuite_idea.PNG', 'alt': 'En suite bathroom'},
        ],
    },
    'nursery': {
        'label': 'Nursery',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/nursery/nursery.jpg', 'alt': 'Nursery'},
        ],
    },
    'study': {
        'label': 'Study',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/study/study_1.jpg', 'alt': 'Study'},
        ],
    },
    'garden': {
        'label': 'Garden',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/garden/garden.PNG', 'alt': 'Garden'},
        ],
    },
    'summer-house': {
        'label': 'Summer house',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/summer_house/summer_house.PNG', 'alt': 'Summer house'},
        ],
    },
}

# Main "All" page excludes exterior (exterior has its own tab only)
SECTIONS_FOR_INDEX = {k: v for k, v in DESIGN_SECTIONS.items() if k != 'exterior'}

# Map design section_id to product room filter (for Products section on that page). None = show all.
SECTION_TO_PRODUCT_ROOM = {
    'kitchen': 'Kitchen',
    'living-room': 'Living Room',
    'dining-room': 'Dining Room',
    'hallway': 'Hallway',
    'stairs': 'Stairways',
    'entrance': 'Entrance',
    'master-bedroom': 'Bedroom',
    'en-suite': 'Bathroom',
    'nursery': 'Nursery',
    'study': 'Study',
    'garden': 'Garden',
    'summer-house': 'Summerhouse',
    'exterior': 'Other',
    'floor-plans': None,
}

# Photo gallery carousel image URLs (Google Photos album)
PHOTO_GALLERY_IMAGES = [
    'https://lh3.googleusercontent.com/pw/AP1GczOaS680Rqz3FFkCFAvoHVOWt9pBt-5VVum6ImwMnUq5pAOg4nd0C3URSoMeOGIcTebrDBBMTDWLlVdXXAX7r86EUI7MHFelVYFleB2ej2kIKPpBDwH1=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczNT33XahF_QttIYcsIqdeTYRyQj8Syja8L4QL2F6h4qoJzq7Ox7ViZNSjc8vmCWgeNPA3QKM2QvZEJ5hLq-MRToOARebPpB1LBkkZRjO8te16g6mU0J=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczN4v63RiKGJ3X9v2U3IrXBJEPenMPEP8ZIyFD2ga0bP4i59ntqpIH0ueMuITtxzom_e7FmwUCmP0RO5Jz09cozEMBAioCTP1lcZsEvFgjqZRRJVZxnP=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczPyGfODvUz0Y0S-cJH7sD0osx2lqZ9cCFk09gP8BRR40DXaUQDnI_D4RE9efF2dtMLV4vP--s44gxN-Ukm2y5PHO-hwL5oaTG-UjtS238RxWiHO_hyi=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczPMf8KKoJEV5yBx68SS87TlTT8y6smz5UgVuuhb_wiXJF3FLy5C1D28oZvGz37wr45rUEliorV8Xm8x6-BiqP3xXImbtzWlYOwSjJaqg1qpBiy4eYbG=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczPUW3klwn3u2QlIB3KUKSWGXqKqwHVCML-5EbvdbCkGIVpvjZJuleVQRqM6A3FRvgVL3HYHqLwuDzYNYJSqwfRYI3w-pVIF30E1xUEJXGPLwd3MgG3V=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczPK0RfNQW5ELsMwczKkdHQ6mFJ3igANZ7AE7W6kIsT1Waemp_LoLy5LQibfmfiuuzet9axod0CegzvbFpQLEFYVUM9nNEPUmL6U5Q8AWSy2x0Bcpgsm=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczM4mI6ykjXP2s_VjOD89aThT4cegBli2uXiLIGvdaE_Txuabgk1BtZrTthPEY7-hBRCCbexOzWvKU--Tnt8i-mK7Oa2xDLhbYxs4tEprpfD0PEGDGfr=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczN16hmix--Jmh507geajjgVajUkMiGWsI2RBWirLKqqUAMGDMzAIPGCTMkDscmnrgYrNL7pITRyrIir8ecVeSmOKgpxgDmXXnnVh1GUVJgK7PFHWVZr=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczMSo50P_s1z8BchGYEqNA5ln-L2U0zLMDgLJOVXzFbL0yk8pktMrTDP94Ost4XhOR0zph6uh2MO2px9za3kOJ3HwnxWv1ZfC3bNhL3wxYGtRfyU7VeR=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczOK6WuKPb9f5YX0oyDfMB8zZ3E1Za2vZjKbvHDHQzIwfDrcil2g2VaSywyDC0tqz4ycQhLntMlx8VNGYnqFBph_Y7RdFuOCiX4sA0EsVnXelCA6zq3u=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczM6bS2Xne34-6tWII2FMtB-SnRJRcQ3JdEZzCUxQhS5OWMT_rto-AdIDXXwQ4II9OM0W5ZYhhVj3JwWbfqQ1p3Wuv4myzCPEz2zFJoT1yAv7bgvyD2c=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczNZqCcmbRYCcUwDxVo2RiTeTxZKzBcqUm4Cte0hxxYr_doQnb99nZdfOtjDemiR5fHROBXW4ZqNbwx6GlbtsoxIh5uHClPbFDSiVJZpvhDrpabt2DqU=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczNlqHj7tWigRYxq9FWJfhUobhqHjw2XHSdtZFzxBMfSpfMEj8hMz-JV609234JlKkJfgAPh79JQFj7GhpLzDBKIcCL3vqHi07BSuCpUQNOb4CJNng1D=w1920-h1080',
    'https://lh3.googleusercontent.com/pw/AP1GczPNHiuCNjVAUU9q7uM-7BoGhdMPC5hXHLD0GdVFNf68hR1NIXYSNqi_x34QNYiFaYYv4Cjqtca4dxzJ2I20EpO4tUer48R_kTKV0eTyx94E3-7lyy6E=w1920-h1080',
]

# Serve favicon
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/')
def index():
    """Render the main page with all design sections (exterior only on its own tab)."""
    return render_template(
        'index.html',
        sections=SECTIONS_FOR_INDEX,
        section_filter=None,
        all_sections=DESIGN_SECTIONS,
        show_photo_gallery=False,
        product_room_filter=None,
    )

@app.route('/categorize/')
def categorize():
    """Categorization page for assigning rooms to design ideas"""
    return render_template(
        'categorize.html',
        all_sections=DESIGN_SECTIONS,
    )

@app.route('/designs/')
def designs_index():
    """Redirect /designs/ to main page (all designs)."""
    return redirect(url_for('index'), code=302)

@app.route('/designs/<section_id>/')
def design_section(section_id):
    """Render the page for a single design section."""
    if section_id not in DESIGN_SECTIONS:
        abort(404)
    sections = {section_id: DESIGN_SECTIONS[section_id]}
    product_room_filter = SECTION_TO_PRODUCT_ROOM.get(section_id)
    return render_template(
        'index.html',
        sections=sections,
        section_filter=section_id,
        all_sections=DESIGN_SECTIONS,
        show_photo_gallery=False,
        product_room_filter=product_room_filter,
    )

@app.route('/photo-gallery/')
def photo_gallery():
    """Photo gallery page with carousel (own tab)."""
    return render_template(
        'index.html',
        sections={},
        section_filter='photo-gallery',
        all_sections=DESIGN_SECTIONS,
        show_photo_gallery=True,
        carousel_images=PHOTO_GALLERY_IMAGES,
        product_room_filter=None,
    )

@app.route('/api/image/<path:image_path>')
def serve_gcp_image(image_path):
    """Serve images from GCP Storage"""
    try:
        if not gcp_storage_client:
            return jsonify({'error': 'GCP Storage not configured'}), 500
        
        # Get the blob from GCP Storage
        # Handle both bucket names - try the configured bucket first, then the designs bucket
        bucket_name = GCP_BUCKET_NAME
        if 'highgate-avenue-designs' in image_path or image_path.startswith('designs/'):
            bucket_name = 'highgate-avenue-designs'
            # Remove 'designs/' prefix if present in path
            if image_path.startswith('designs/'):
                image_path = image_path.replace('designs/', '', 1)
        
        bucket = gcp_storage_client.bucket(bucket_name)
        blob = bucket.blob(image_path)
        
        if not blob.exists():
            return jsonify({'error': 'Image not found'}), 404
        
        # Download the image content
        image_data = blob.download_as_bytes()
        
        # Get content type
        content_type = blob.content_type or 'image/png'
        
        # Return the image with appropriate headers
        from flask import Response
        return Response(
            image_data,
            mimetype=content_type,
            headers={
                'Cache-Control': 'public, max-age=3600',
                'Content-Disposition': f'inline; filename="{blob.name}"'
            }
        )
    except Exception as e:
        app.logger.error(f"Error serving image: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/plans', methods=['GET'])
def get_plans():
    """Get all renovation plans/ideas"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase not configured'}), 500
        
        response = supabase.table('plans').select('*').order('created_at', desc=True).execute()
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/plans', methods=['POST'])
def create_plan():
    """Create a new renovation plan/idea"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase not configured'}), 500
        
        data = request.get_json()
        response = supabase.table('plans').insert(data).execute()
        return jsonify(response.data[0] if response.data else {}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/plans/<int:plan_id>', methods=['PUT'])
def update_plan(plan_id):
    """Update a renovation plan/idea"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase not configured'}), 500
        
        data = request.get_json()
        response = supabase.table('plans').update(data).eq('id', plan_id).execute()
        return jsonify(response.data[0] if response.data else {}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/plans/<int:plan_id>', methods=['DELETE'])
def delete_plan(plan_id):
    """Delete a renovation plan/idea"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase not configured'}), 500
        
        supabase.table('plans').delete().eq('id', plan_id).execute()
        return jsonify({'message': 'Plan deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Products (e.g. Amazon links with image, price, category, room, tags) ---

@app.route('/api/products', methods=['GET'])
def get_products():
    """Get all products, optionally filtered by room or category."""
    try:
        if not supabase:
            return jsonify([]), 200
        room = request.args.get('room', '').strip()
        category = request.args.get('category', '').strip()
        query = supabase.table('ha_products').select('*').order('created_at', desc=True)
        if room:
            query = query.eq('room', room)
        if category:
            query = query.eq('category', category)
        response = query.execute()
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products', methods=['POST'])
def create_product():
    """Add a new product (link, image_url, price, title, category, room, tags)."""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase not configured'}), 500
        data = request.get_json() or {}
        link = (data.get('link') or '').strip()
        if not link:
            return jsonify({'error': 'Link is required'}), 400
        payload = {
            'link': link,
            'image_url': (data.get('image_url') or '').strip() or None,
            'price': (data.get('price') or '').strip() or None,
            'title': (data.get('title') or '').strip() or None,
            'category': (data.get('category') or '').strip() or None,
            'room': (data.get('room') or '').strip() or None,
            'website_name': (data.get('website_name') or '').strip() or None,
            'tags': data.get('tags') if isinstance(data.get('tags'), list) else [],
        }
        response = supabase.table('ha_products').insert(payload).execute()
        return jsonify(response.data[0] if response.data else payload), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/preview')
def product_preview():
    """Fetch og:image and og:title from a URL (e.g. Amazon) for link preview."""
    try:
        url = request.args.get('url', '').strip()
        if not url:
            return jsonify({'error': 'url is required'}), 400
        if not url.startswith(('http://', 'https://')):
            return jsonify({'error': 'Invalid URL'}), 400
        import requests
        from bs4 import BeautifulSoup
        headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        r = requests.get(url, headers=headers, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'html.parser')
        image_url = None
        title = None
        og_image = soup.find('meta', property='og:image')
        if og_image and og_image.get('content'):
            image_url = og_image['content'].strip()
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            title = og_title['content'].strip()
        return jsonify({'image_url': image_url, 'title': title}), 200
    except Exception as e:
        app.logger.warning(f"Product preview failed for {url}: {e}")
        return jsonify({'image_url': None, 'title': None, 'error': str(e)}), 200

@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    """Get all rooms"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase not configured'}), 500
        
        response = supabase.table('rooms').select('*').order('name').execute()
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Design Ideas (ha_design_ideas table) ---

@app.route('/api/design-ideas', methods=['GET'])
def get_design_ideas():
    """Get all design ideas, optionally filtered by room"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase not configured'}), 500
        
        room = request.args.get('room', '').strip()
        uncategorized_only = request.args.get('uncategorized_only', '').lower() == 'true'
        limit = request.args.get('limit', type=int)
        offset = request.args.get('offset', type=int, default=0)
        
        query = supabase.table('ha_design_ideas').select('*').order('created_at', desc=True)
        
        if room:
            query = query.eq('room', room)
            # Apply pagination for room-filtered queries
            if limit:
                query = query.range(offset, offset + limit - 1)
            response = query.execute()
            data = response.data or []
        elif uncategorized_only:
            # For uncategorized items, fetch ALL records first (no pagination on backend)
            # Then filter and paginate client-side
            response = query.execute()
            all_data = response.data or []
            # Filter uncategorized items
            uncategorized_data = [item for item in all_data if not item.get('room') or item.get('room', '').strip() == '']
            total_count = len(uncategorized_data)
            # Apply client-side pagination
            if limit:
                data = uncategorized_data[offset:offset + limit]
            else:
                data = uncategorized_data
        else:
            # Apply pagination for regular queries
            if limit:
                query = query.range(offset, offset + limit - 1)
            response = query.execute()
            data = response.data or []
        
        # Get total count for pagination
        if uncategorized_only:
            # Already calculated above
            pass
        elif room:
            count_query = supabase.table('ha_design_ideas').eq('room', room)
            count_response = count_query.select('id', count='exact').execute()
            total_count = count_response.count if hasattr(count_response, 'count') else len(data)
        else:
            count_response = supabase.table('ha_design_ideas').select('id', count='exact').execute()
            total_count = count_response.count if hasattr(count_response, 'count') else len(data)
        
        return jsonify({
            'data': data,
            'total': total_count,
            'limit': limit,
            'offset': offset
        }), 200
    except Exception as e:
        app.logger.error(f"Error fetching design ideas: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/design-ideas/<idea_id>', methods=['PUT'])
def update_design_idea(idea_id):
    """Update a design idea (room, category, tags, etc.) - accepts UUID or integer ID"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase not configured'}), 500
        
        data = request.get_json() or {}
        app.logger.info(f"Updating design idea {idea_id} with data: {data}")
        
        # Build update payload with only provided fields
        update_data = {}
        if 'room' in data:
            update_data['room'] = data['room'].strip() if data['room'] else None
        if 'category' in data:
            update_data['category'] = data['category'].strip() if data['category'] else None
        if 'tags' in data:
            # Handle both array and comma-separated string
            if isinstance(data['tags'], list):
                update_data['tags'] = data['tags']
            elif isinstance(data['tags'], str):
                update_data['tags'] = [tag.strip() for tag in data['tags'].split(',') if tag.strip()]
            else:
                update_data['tags'] = []
        if 'name' in data:
            update_data['name'] = data['name'].strip() if data['name'] else None
        if 'liked' in data:
            update_data['liked'] = bool(data['liked'])
        if 'bok_likes' in data:
            try:
                bok_likes_val = data['bok_likes']
                if bok_likes_val is None:
                    update_data['bok_likes'] = 0
                else:
                    update_data['bok_likes'] = int(bok_likes_val)
            except (ValueError, TypeError) as e:
                app.logger.warning(f"Invalid bok_likes value: {data.get('bok_likes')}, defaulting to 0")
                update_data['bok_likes'] = 0
        
        if not update_data:
            return jsonify({'error': 'No fields to update'}), 400
        
        update_data['updated_at'] = datetime.utcnow().isoformat()
        
        app.logger.info(f"Update payload: {update_data}")
        
        # Use the idea_id as-is (could be UUID string or integer)
        response = supabase.table('ha_design_ideas').update(update_data).eq('id', idea_id).execute()
        
        if not response.data:
            return jsonify({'error': f'Design idea not found: {idea_id}'}), 404
        
        app.logger.info(f"Successfully updated design idea {idea_id}")
        return jsonify(response.data[0]), 200
    except Exception as e:
        app.logger.error(f"Error updating design idea {idea_id}: {str(e)}")
        import traceback
        app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/design-ideas/upload', methods=['POST'])
def upload_design_idea_image():
    """Upload an image to Supabase Storage and create a design idea entry"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase not configured'}), 500
        
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed. Use: PNG, JPG, JPEG, GIF, or WEBP'}), 400
        
        # Read file content
        file_content = file.read()
        if len(file_content) > MAX_FILE_SIZE:
            return jsonify({'error': 'File too large. Maximum size is 10MB'}), 400
        
        # Generate unique filename
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        
        # Upload to Supabase Storage using S3-compatible API
        bucket_name = 'image_hosting_bucket'
        
        if not SUPABASE_ACCESS_KEY_ID or not SUPABASE_SECRET_ACCESS_KEY:
            return jsonify({'error': 'Supabase storage access keys not configured. Please set SUPABASE_ACCESS_KEY_ID_BUCKET and SUPABASE_ACCESS_KEY_BUCKET in .env'}), 500
        
        # Check if image_path already exists and generate unique filename if needed
        max_attempts = 5
        file_path = None
        for attempt in range(max_attempts):
            unique_filename = f"{uuid.uuid4()}.{file_ext}"
            candidate_path = f"highgate_avenue/design_ideas/{unique_filename}"
            
            # Check if this path already exists in database
            existing = supabase.table('ha_design_ideas').select('id').eq('image_path', candidate_path).execute()
            if not existing.data:
                file_path = candidate_path
                break
        
        if not file_path:
            return jsonify({'error': 'Failed to generate unique filename after multiple attempts'}), 500
        
        try:
            # Upload file to Supabase Storage using S3-compatible API
            content_type = file.content_type or f'image/{file_ext}'
            upload_response = upload_to_supabase_storage_s3(
                file_content,
                file_path,
                content_type,
                bucket_name
            )
            
            app.logger.info(f"Upload successful: {file_path}")
            
            # Get public URL - construct it manually based on Supabase URL structure
            # Format: https://{project_ref}.supabase.co/storage/v1/object/public/{bucket}/{path}
            supabase_project_ref = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
            # URL encode the path segments but keep slashes
            encoded_path = '/'.join([quote(segment, safe='') for segment in file_path.split('/')])
            public_url = f"https://{supabase_project_ref}.supabase.co/storage/v1/object/public/{bucket_name}/{encoded_path}"
            
            app.logger.info(f"Public URL: {public_url}")
            
            # Create design idea entry in database
            idea_data = {
                'name': request.form.get('name', 'Untitled'),
                'room': request.form.get('room', ''),
                'category': request.form.get('category', ''),
                'tags': request.form.get('tags', '').split(',') if request.form.get('tags') else [],
                'image_path': file_path,
                'public_url': public_url,
                'liked': False,
                'bok_likes': 0
            }
            
            app.logger.info(f"Inserting idea_data: {idea_data}")
            
            try:
                # Log what we're trying to insert
                app.logger.info(f"Attempting to insert idea with public_url: {public_url}")
                
                db_response = supabase.table('ha_design_ideas').insert(idea_data).execute()
                
                app.logger.info(f"Database insert successful. Response: {db_response.data}")
                
                # Ensure public_url is in the response
                result_idea = db_response.data[0] if db_response.data else idea_data
                
                # If public_url is missing from database response, add it
                if 'public_url' not in result_idea or not result_idea.get('public_url'):
                    app.logger.warning(f"public_url missing from database response, adding: {public_url}")
                    result_idea['public_url'] = public_url
                    # Try to update the database record with public_url
                    try:
                        supabase.table('ha_design_ideas').update({'public_url': public_url}).eq('id', result_idea['id']).execute()
                        app.logger.info(f"Updated public_url for record {result_idea['id']}")
                    except Exception as update_error:
                        app.logger.error(f"Failed to update public_url: {update_error}")
                
                app.logger.info(f"Returning idea with public_url: {result_idea.get('public_url')}")
                
                return jsonify({
                    'success': True,
                    'idea': result_idea,
                    'public_url': result_idea.get('public_url', public_url)
                }), 201
            except Exception as db_error:
                error_str = str(db_error)
                # Handle duplicate key error
                if '23505' in error_str or 'duplicate key' in error_str.lower() or 'already exists' in error_str.lower():
                    app.logger.warning(f"Duplicate image_path detected: {file_path}. Attempting to fetch existing record.")
                    # Try to fetch the existing record
                    existing = supabase.table('ha_design_ideas').select('*').eq('image_path', file_path).execute()
                    if existing.data:
                        existing_idea = existing.data[0]
                        # Ensure public_url exists, construct if missing
                        if 'public_url' not in existing_idea or not existing_idea.get('public_url'):
                            supabase_project_ref = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
                            encoded_path = '/'.join([quote(segment, safe='') for segment in file_path.split('/')])
                            existing_idea['public_url'] = f"https://{supabase_project_ref}.supabase.co/storage/v1/object/public/{bucket_name}/{encoded_path}"
                            # Update the record with public_url if missing
                            try:
                                supabase.table('ha_design_ideas').update({'public_url': existing_idea['public_url']}).eq('id', existing_idea['id']).execute()
                            except:
                                pass  # Don't fail if update doesn't work
                        return jsonify({
                            'success': True,
                            'idea': existing_idea,
                            'public_url': existing_idea.get('public_url', public_url),
                            'message': 'Image already exists in database'
                        }), 200
                    else:
                        return jsonify({'error': 'Duplicate key error but record not found'}), 500
                else:
                    raise
            
        except Exception as storage_error:
            app.logger.error(f"Supabase Storage error: {str(storage_error)}")
            error_msg = str(storage_error)
            
            # Provide helpful error message about RLS
            if 'row-level security' in error_msg.lower() or 'unauthorized' in error_msg.lower():
                return jsonify({
                    'error': 'Storage upload failed due to permissions. Please either:\n1. Add SUPABASE_SERVICE_ROLE_KEY to your .env file, or\n2. Configure the storage bucket policies to allow public uploads.'
                }), 500
            
            return jsonify({'error': f'Storage upload failed: {error_msg}'}), 500
        
    except Exception as e:
        app.logger.error(f"Upload error: {str(e)}")
        import traceback
        app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/design-ideas/batch-update', methods=['PUT'])
def batch_update_design_ideas():
    """Update multiple design ideas at once"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase not configured'}), 500
        
        data = request.get_json() or {}
        updates = data.get('updates', [])
        
        if not updates:
            return jsonify({'error': 'No updates provided'}), 400
        
        results = []
        for update in updates:
            idea_id = update.get('id')
            if not idea_id:
                continue
            
            update_data = {}
            if 'room' in update:
                update_data['room'] = update['room'].strip() if update['room'] else None
            if 'category' in update:
                update_data['category'] = update['category'].strip() if update['category'] else None
            if 'tags' in update:
                if isinstance(update['tags'], list):
                    update_data['tags'] = update['tags']
                elif isinstance(update['tags'], str):
                    update_data['tags'] = [tag.strip() for tag in update['tags'].split(',') if tag.strip()]
            
            update_data['updated_at'] = datetime.utcnow().isoformat()
            
            response = supabase.table('ha_design_ideas').update(update_data).eq('id', idea_id).execute()
            if response.data:
                results.append(response.data[0])
        
        return jsonify({'updated': len(results), 'results': results}), 200
    except Exception as e:
        app.logger.error(f"Error batch updating design ideas: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_image():
    """Upload an image to GCP Cloud Storage and create a plan entry"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase database not configured'}), 500
        
        if not gcp_bucket:
            return jsonify({'error': 'GCP Storage not configured'}), 500
        
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed. Use: PNG, JPG, JPEG, GIF, or WEBP'}), 400
        
        # Read file content
        file_content = file.read()
        if len(file_content) > MAX_FILE_SIZE:
            return jsonify({'error': 'File too large. Maximum size is 10MB'}), 400
        
        # Generate unique filename
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_ext}"
        file_path = f"images/{unique_filename}"
        
        # Upload to GCP Cloud Storage
        blob = gcp_bucket.blob(file_path)
        blob.content_type = file.content_type or f'image/{file_ext}'
        blob.upload_from_string(file_content, content_type=blob.content_type)
        
        # Make blob publicly readable
        blob.make_public()
        
        # Get public URL
        public_url = blob.public_url
        
        # Get room from form data if provided
        room = request.form.get('room', 'Other')
        title = request.form.get('title', 'New Design Idea')
        
        # Create plan entry in database
        plan_data = {
            'title': title,
            'room': room,
            'image_url': public_url,
            'storage_path': file_path,
            'description': request.form.get('description', ''),
            'tags': request.form.get('tags', '').split(',') if request.form.get('tags') else [],
            'source_url': request.form.get('source_url', '')
        }
        
        db_response = supabase.table('plans').insert(plan_data).execute()
        
        return jsonify({
            'success': True,
            'plan': db_response.data[0] if db_response.data else plan_data,
            'image_url': public_url
        }), 201
        
    except Exception as e:
        app.logger.error(f"Upload error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/plans/<int:plan_id>/image', methods=['POST'])
def update_plan_image(plan_id):
    """Update or add an image to an existing plan"""
    try:
        if not supabase:
            return jsonify({'error': 'Supabase database not configured'}), 500
        
        if not gcp_bucket:
            return jsonify({'error': 'GCP Storage not configured'}), 500
        
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
        
        # Read file content
        file_content = file.read()
        if len(file_content) > MAX_FILE_SIZE:
            return jsonify({'error': 'File too large. Maximum size is 10MB'}), 400
        
        # Get existing plan to delete old image if exists
        existing = supabase.table('plans').select('storage_path').eq('id', plan_id).execute()
        old_path = None
        if existing.data and existing.data[0].get('storage_path'):
            old_path = existing.data[0]['storage_path']
        
        # Generate unique filename
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_ext}"
        file_path = f"images/{unique_filename}"
        
        # Upload to GCP Cloud Storage
        blob = gcp_bucket.blob(file_path)
        blob.content_type = file.content_type or f'image/{file_ext}'
        blob.upload_from_string(file_content, content_type=blob.content_type)
        
        # Make blob publicly readable
        blob.make_public()
        
        # Get public URL
        public_url = blob.public_url
        
        # Delete old image if exists
        if old_path:
            try:
                old_blob = gcp_bucket.blob(old_path)
                if old_blob.exists():
                    old_blob.delete()
            except Exception as e:
                app.logger.warning(f"Could not delete old image: {str(e)}")
        
        # Update plan with new image
        update_data = {
            'image_url': public_url,
            'storage_path': file_path,
            'updated_at': datetime.utcnow().isoformat()
        }
        
        response = supabase.table('plans').update(update_data).eq('id', plan_id).execute()
        
        return jsonify({
            'success': True,
            'plan': response.data[0] if response.data else {},
            'image_url': public_url
        }), 200
        
    except Exception as e:
        app.logger.error(f"Update image error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.getenv('FLASK_ENV') == 'development')
