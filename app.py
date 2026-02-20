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
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY') or os.getenv('SUPABASE_ANON_KEY')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
SUPABASE_ACCESS_KEY_ID = os.getenv('SUPABASE_ACCESS_KEY_ID_BUCKET')
SUPABASE_SECRET_ACCESS_KEY = os.getenv('SUPABASE_ACCESS_KEY_BUCKET')

# GCP Storage configuration
GCP_BUCKET_NAME = os.getenv('GCP_BUCKET_NAME', 'highgate-avenue-images')
GCP_PROJECT_ID = os.getenv('GCP_PROJECT_ID')
GCP_CREDENTIALS_JSON = os.getenv('GCP_CREDENTIALS_JSON')
GCP_CREDENTIALS_PATH = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')

# Initialize Supabase client
supabase: Client = None
supabase_storage: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        if SUPABASE_SERVICE_ROLE_KEY:
            supabase_storage = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        else:
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
    global gcp_storage_client, gcp_bucket
    try:
        credentials = None
        if GCP_CREDENTIALS_PATH and os.path.exists(GCP_CREDENTIALS_PATH):
            credentials = service_account.Credentials.from_service_account_file(
                GCP_CREDENTIALS_PATH
            )
        elif GCP_CREDENTIALS_JSON:
            try:
                creds_dict = json.loads(GCP_CREDENTIALS_JSON)
                credentials = service_account.Credentials.from_service_account_info(creds_dict)
            except json.JSONDecodeError:
                if os.path.exists(GCP_CREDENTIALS_JSON):
                    credentials = service_account.Credentials.from_service_account_file(
                        GCP_CREDENTIALS_JSON)
        else:
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

init_gcp_storage()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def upload_to_supabase_storage_s3(file_content, file_path, content_type, bucket_name='image_hosting_bucket'):
    if not SUPABASE_ACCESS_KEY_ID or not SUPABASE_SECRET_ACCESS_KEY:
        raise ValueError("Supabase storage access keys not configured")

    project_ref = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
    endpoint_url = f"https://{project_ref}.storage.supabase.co/storage/v1/s3"
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

    file_obj = BytesIO(file_content)
    try:
        s3_client.put_object(
            Bucket=bucket_name,
            Key=file_path,
            Body=file_obj,
            ContentType=content_type
        )
        class MockResponse:
            status_code = 200
            text = "Upload successful"
        return MockResponse()
    except Exception as e:
        error_msg = str(e)
        if hasattr(e, 'response'):
            error_msg = f"{error_msg} - {e.response.get('Error', {}).get('Message', '')}"
        raise Exception(f"Upload failed: {error_msg}")

# ---------- Design Sections ----------

DESIGN_SECTIONS = {
    'entrance': {
        'label': 'Entrance',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/entrance/entrance_hall_2.JPG', 'alt': 'Entrance hall'},
        ],
    },
    'hallway': {
        'label': 'Hallway',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/hallway/hallway.PNG', 'alt': 'Hallway'},
        ],
    },
    'bathroom': {
        'label': 'Bathroom',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/bathroom/IMG_5212.PNG', 'alt': 'Bathroom'},
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
    'living-room': {
        'label': 'Living Room',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/living_room/living_room.jpg', 'alt': 'Living room'},
        ],
    },
    'kitchen': {
        'label': 'Kitchen',
        'layout': 'double',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/kitchen/full_living_room_kitchen.JPG', 'alt': 'Kitchen and living area'},
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/kitchen/kitchen_ha7.png', 'alt': 'Kitchen'},
        ],
    },
    'dining-room': {
        'label': 'Dining Room',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/dining_room/dining_room.jpg', 'alt': 'Dining room'},
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
    'exterior': {
        'label': 'Exterior',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/Outside.png', 'alt': 'Highgate Avenue Exterior'},
        ],
    },
    'stairs': {
        'label': 'Stairs into entrance',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/designs/stairs/stairs.jpg', 'alt': 'Stairs into entrance'},
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
}

DESIGN_SECTIONS_ORDER = [
    'entrance',
    'hallway',
    'bathroom',
    'master-bedroom',
    'en-suite',
    'nursery',
    'study',
    'living-room',
    'kitchen',
    'dining-room',
    'garden',
    'summer-house',
    'exterior',
    'stairs',
    'floor-plans',
]
SECTIONS_FOR_INDEX = {k: v for k, v in DESIGN_SECTIONS.items() if k not in ['exterior', 'bathroom']}

SECTION_TO_PRODUCT_ROOM = {
    'kitchen': 'Kitchen',
    'living-room': 'Living Room',
    'dining-room': 'Dining Room',
    'hallway': 'Hallway',
    'stairs': 'Stairways',
    'entrance': 'Entrance',
    'master-bedroom': 'Bedroom',
    'bathroom': 'Bathroom',  # Bathroom tab shows all bathroom-related items
    'en-suite': 'Bathroom',  # En suite also shows bathroom items
    'nursery': 'Nursery',
    'study': 'Study',
    'garden': 'Garden',
    'summer-house': 'Summerhouse',
    'exterior': 'Other',
    'floor-plans': None,
}

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

# ---------- MUSWELL HILL DESIGN SECTIONS (Equivalent to DESIGN_SECTIONS) ----------

MUSWELL_HILL_DESIGN_SECTIONS = {
    'front-room': {
        'label': 'Front Room',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/muswell-hill/front_room/Screenshot%202026-02-19%20at%2013.11.10.png', 'alt': 'Front Room 1'},
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/muswell-hill/front_room/Screenshot%202026-02-19%20at%2013.13.56.png', 'alt': 'Front Room 2'},
        ],
    },
    'kitchen': {
        'label': 'Kitchen',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/muswell-hill/kitchen/Screenshot%202026-02-19%20at%2013.12.20.png', 'alt': 'Kitchen Main'}      ],
    },
    'bathroom': {
        'label': 'Bathroom',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/muswell-hill/bathroom/Screenshot%202026-02-19%20at%2013.11.56.png', 'alt': 'Bathroom Main'},
        ],
    },
    'bedroom': {
        'label': 'Bedroom',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/muswell-hill/bedroom/Screenshot%202026-02-19%20at%2013.16.49.png', 'alt': 'Bedroom View 1'},
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/muswell-hill/bedroom/Screenshot%202026-02-19%20at%2013.12.11.png', 'alt': 'Bedroom View 2'},
        ],
    },
    'nursery': {
        'label': 'Nursery',
        'layout': 'single',
        'images': [
            {'url': 'https://storage.googleapis.com/highgate-avenue-designs/muswell-hill/nursery/Screenshot%202026-02-19%20at%2013.17.05.png', 'alt': 'Nursery'},
        ],
    },
}

MUSWELL_HILL_DESIGN_SECTIONS_ORDER = [
    'front-room', 'kitchen', 'bathroom', 'bedroom', 'nursery'
]

# Also keep legacy MUSWELL_HILL_ROOMS for existing GCS routes/API:
MUSWELL_HILL_ROOMS = {
    'front-room': {'label': 'Front Room', 'prefix': 'muswell-hill/front_room'},
    'kitchen': {'label': 'Kitchen', 'prefix': 'muswell-hill/kitchen'},
    'bathroom': {'label': 'Bathroom', 'prefix': 'muswell-hill/bathroom'},
    'bedroom': {'label': 'Bedroom', 'prefix': 'muswell-hill/bedroom'},
    'nursery': {'label': 'Nursery', 'prefix': 'muswell-hill/nursery'},
}
MUSWELL_HILL_BUCKET = 'highgate-avenue-designs'

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
        sections_order=DESIGN_SECTIONS_ORDER,
        show_photo_gallery=False,
        product_room_filter=None,
    )

@app.route('/categorize/')
def categorize():
    return render_template(
        'categorize.html',
        all_sections=DESIGN_SECTIONS,
        sections_order=DESIGN_SECTIONS_ORDER,
    )

@app.route('/jobs/')
def jobs():
    return render_template(
        'jobs.html',
        all_sections=DESIGN_SECTIONS,
        sections_order=DESIGN_SECTIONS_ORDER,
    )


@app.route('/api/jobs', methods=['GET'], strict_slashes=False)
def get_jobs():
    """List all jobs from ha_jobs_list."""
    if not supabase:
        return jsonify([]), 200
    try:
        r = supabase.table('ha_jobs_list').select('*').execute()
        data = r.data or []
        # Sort by created_at descending (newest first)
        data.sort(key=lambda row: (row.get('created_at') or ''), reverse=True)
        return jsonify(data), 200
    except Exception as e:
        app.logger.error(f"Error fetching jobs: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/jobs', methods=['POST'], strict_slashes=False)
def create_job():
    """Create a new job."""
    if not supabase:
        return jsonify({'error': 'Database not available'}), 503
    try:
        data = request.get_json() or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'Name is required'}), 400
        payload = {
            'name': name,
            'assigned': (data.get('assigned') or '').strip() or None,
            'date_due': data.get('date_due') or None,
            'done': bool(data.get('done', False)),
            'country': (data.get('country') or '').strip() or None,
            'tags': data.get('tags') if isinstance(data.get('tags'), list) else [],
            'notes': (data.get('notes') or '').strip() or None,
        }
        r = supabase.table('ha_jobs_list').insert(payload).execute()
        rows = r.data or []
        return jsonify(rows[0] if rows else payload), 201
    except Exception as e:
        app.logger.error(f"Error creating job: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/jobs/<int:job_id>', methods=['PUT'])
def update_job(job_id):
    """Update a job by id."""
    if not supabase:
        return jsonify({'error': 'Database not available'}), 503
    try:
        data = request.get_json() or {}
        update_data = {}
        if 'name' in data:
            name = (data.get('name') or '').strip()
            if not name:
                return jsonify({'error': 'Name cannot be empty'}), 400
            update_data['name'] = name
        if 'assigned' in data:
            update_data['assigned'] = (data.get('assigned') or '').strip() or None
        if 'date_due' in data:
            update_data['date_due'] = data.get('date_due') or None
        if 'done' in data:
            update_data['done'] = bool(data.get('done', False))
        if 'country' in data:
            update_data['country'] = (data.get('country') or '').strip() or None
        if 'tags' in data:
            if isinstance(data['tags'], list):
                update_data['tags'] = data['tags']
            elif isinstance(data['tags'], str):
                update_data['tags'] = [t.strip() for t in data['tags'].split(',') if t.strip()]
            else:
                update_data['tags'] = []
        if 'notes' in data:
            update_data['notes'] = (data.get('notes') or '').strip() or None
        if not update_data:
            return jsonify({'error': 'No fields to update'}), 400
        update_data['updated_at'] = datetime.utcnow().isoformat()
        r = supabase.table('ha_jobs_list').update(update_data).eq('id', job_id).execute()
        rows = r.data or []
        return jsonify(rows[0] if rows else {}), 200
    except Exception as e:
        app.logger.error(f"Error updating job: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/jobs/<int:job_id>', methods=['DELETE'])
def delete_job(job_id):
    """Delete a job by id."""
    if not supabase:
        return jsonify({'error': 'Database not available'}), 503
    try:
        supabase.table('ha_jobs_list').delete().eq('id', job_id).execute()
        return '', 204
    except Exception as e:
        app.logger.error(f"Error deleting job: {e}")
        return jsonify({'error': str(e)}), 500


# --------- NEW: MUSWELL HILL "DESIGN SECTION" PAGES/EQUIVALENT ---------

@app.route('/muswell-hill/designs/')
def muswell_hill_designs_index():
    """Main Muswell Hill summary page - shows all rooms in MUSWELL_HILL_DESIGN_SECTIONS."""
    return render_template(
        'muswell_hill_index.html',
        muswell_sections=MUSWELL_HILL_DESIGN_SECTIONS,
        muswell_sections_order=MUSWELL_HILL_DESIGN_SECTIONS_ORDER,
    )

@app.route('/muswell-hill/designs/<room_slug>/')
def muswell_hill_design_section(room_slug):
    """Single Muswell Hill design section (room) page, with images copied in definition."""
    if room_slug not in MUSWELL_HILL_DESIGN_SECTIONS:
        abort(404)
    return render_template(
        'muswell_hill_design_section.html',
        room_slug=room_slug,
        section=MUSWELL_HILL_DESIGN_SECTIONS[room_slug],
        muswell_sections=MUSWELL_HILL_DESIGN_SECTIONS,
        muswell_sections_order=MUSWELL_HILL_DESIGN_SECTIONS_ORDER,
    )

# --------- END Muswell Hill design sections equivalent ---------

@app.route('/muswell-hill/products/')
def muswell_hill_products():
    """Muswell Hill products page: msw tag, appliances, baby (tag or category)."""
    return render_template(
        'muswell_hill_products.html',
        muswell_room='products',
        all_sections=DESIGN_SECTIONS,
        sections_order=DESIGN_SECTIONS_ORDER,
    )


@app.route('/muswell-hill/<room_slug>/')
def muswell_hill_room(room_slug):
    if room_slug not in MUSWELL_HILL_ROOMS:
        abort(404)
    room_info = MUSWELL_HILL_ROOMS[room_slug]
    # Fallback images from design sections when bucket listing returns none
    fallback_images = []
    if room_slug in MUSWELL_HILL_DESIGN_SECTIONS:
        for img in MUSWELL_HILL_DESIGN_SECTIONS[room_slug].get('images', []):
            fallback_images.append({'url': img['url'], 'name': img.get('alt', '')})
    return render_template(
        'muswell_hill_room.html',
        room_slug=room_slug,
        room_label=room_info['label'],
        bucket_prefix=room_info['prefix'],
        muswell_room=room_slug,
        fallback_images=fallback_images,
        all_sections=DESIGN_SECTIONS,
        sections_order=DESIGN_SECTIONS_ORDER,
    )

@app.route('/designs/')
def designs_index():
    return redirect(url_for('index'), code=302)

@app.route('/designs/<section_id>/')
def design_section(section_id):
    if section_id not in DESIGN_SECTIONS:
        abort(404)
    sections = {section_id: DESIGN_SECTIONS[section_id]}
    product_room_filter = SECTION_TO_PRODUCT_ROOM.get(section_id)
    return render_template(
        'index.html',
        sections=sections,
        section_filter=section_id,
        all_sections=DESIGN_SECTIONS,
        sections_order=DESIGN_SECTIONS_ORDER,
        show_photo_gallery=False,
        product_room_filter=product_room_filter,
    )

@app.route('/photo-gallery/')
def photo_gallery():
    return render_template(
        'index.html',
        sections={},
        section_filter='photo-gallery',
        all_sections=DESIGN_SECTIONS,
        sections_order=DESIGN_SECTIONS_ORDER,
        show_photo_gallery=True,
        carousel_images=PHOTO_GALLERY_IMAGES,
        product_room_filter=None,
    )

@app.route('/api/products')
def get_products():
    """List products from ha_products. Optional query: room=, tag=."""
    if not supabase:
        return jsonify([]), 200
    try:
        query = supabase.table('ha_products').select('*').order('created_at', desc=True)
        room = request.args.get('room', '').strip()
        if room:
            query = query.eq('room', room)
        tag = request.args.get('tag', '').strip().lower()
        if tag:
            query = query.overlaps('tags', [tag])
        r = query.execute()
        return jsonify(r.data or []), 200
    except Exception as e:
        app.logger.error(f"Error fetching products: {e}")
        return jsonify([]), 200


@app.route('/api/products', methods=['POST'])
def create_product():
    """Create a new product in ha_products."""
    if not supabase:
        return jsonify({'error': 'Database not available'}), 503
    try:
        data = request.get_json() or {}
        link = (data.get('link') or '').strip()
        if not link:
            return jsonify({'error': 'Link is required'}), 400
        tags = data.get('tags')
        if isinstance(tags, list):
            tags = [str(t).strip() for t in tags if str(t).strip()]
        elif isinstance(tags, str):
            tags = [t.strip() for t in tags.split(',') if t.strip()]
        else:
            tags = []
        tag_set_lower = { str(t).strip().lower() for t in tags }
        is_mwh = data.get('is_mwh')
        if is_mwh is None:
            is_mwh = 'mwh' in tag_set_lower
        else:
            is_mwh = bool(is_mwh)
        payload = {
            'link': link,
            'title': (data.get('title') or '').strip() or None,
            'image_url': (data.get('image_url') or '').strip() or None,
            'price': (data.get('price') or '').strip() or None,
            'category': (data.get('category') or '').strip() or None,
            'room': (data.get('room') or '').strip() or None,
            'website_name': (data.get('website_name') or '').strip() or None,
            'tags': tags,
            'is_mwh': is_mwh,
        }
        r = supabase.table('ha_products').insert(payload).execute()
        rows = r.data or []
        return jsonify(rows[0] if rows else payload), 201
    except Exception as e:
        app.logger.error(f"Error creating product: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/products/<int:product_id>', methods=['PATCH'])
def update_product(product_id):
    """Update a product (e.g. bok_likes, x_remove for Muswell Hill)."""
    if not supabase:
        return jsonify({'error': 'Database not available'}), 503
    try:
        data = request.get_json() or {}
        update_data = {}
        if 'bok_likes' in data:
            update_data['bok_likes'] = bool(data['bok_likes'])
        if 'x_remove' in data:
            update_data['x_remove'] = bool(data['x_remove'])
        if 'is_mwh' in data:
            update_data['is_mwh'] = bool(data['is_mwh'])
        if not update_data:
            return jsonify({'error': 'No fields to update'}), 400
        r = supabase.table('ha_products').update(update_data).eq('id', product_id).execute()
        rows = r.data or []
        return jsonify(rows[0] if rows else update_data), 200
    except Exception as e:
        app.logger.error(f"Error updating product: {e}")
        return jsonify({'error': str(e)}), 500


def _muswell_hill_product_match(row):
    """True if row is MWH only: is_mwh true or tags contains mwh."""
    if row.get('is_mwh') is True:
        return True
    tags = row.get('tags')
    if isinstance(tags, list):
        tag_set = { str(t).strip().lower() for t in tags }
        if 'mwh' in tag_set:
            return True
    elif tags and 'mwh' in str(tags).lower():
        return True
    return False


@app.route('/api/muswell-hill-products')
def get_muswell_hill_products():
    """Products for Muswell Hill: MWH only (is_mwh true or tag mwh). Display grouped by category on the page."""
    if not supabase:
        return jsonify([]), 200
    try:
        # 1) Try RPC that runs the exact SQL (run tables/get_muswell_hill_products.sql in Supabase once)
        try:
            r = supabase.rpc('get_muswell_hill_products').execute()
            if r and getattr(r, 'data', None) is not None:
                out = list(r.data) if isinstance(r.data, list) else []
                return jsonify(out), 200
        except Exception as e:
            app.logger.info(f"Muswell Hill RPC not available: {e}, using fetch-all filter")
        # 2) Fallback: fetch all products, filter in Python (same logic as your SQL)
        r = supabase.table('ha_products').select('*').execute()
        all_rows = (r.data or []) if (r and hasattr(r, 'data')) else []
        if not isinstance(all_rows, list):
            all_rows = []
        out = [row for row in all_rows if _muswell_hill_product_match(row)]
        out.sort(key=lambda row: (row.get('created_at') or ''), reverse=True)
        return jsonify(out), 200
    except Exception as e:
        app.logger.error(f"Error fetching Muswell Hill products: {e}")
        return jsonify([]), 200


@app.route('/api/muswell-hill-images/<room_slug>')
def get_muswell_hill_images(room_slug):
    if room_slug not in MUSWELL_HILL_ROOMS:
        return jsonify([]), 200
    try:
        if not gcp_storage_client:
            return jsonify([]), 200
        prefix = MUSWELL_HILL_ROOMS[room_slug]['prefix']
        bucket = gcp_storage_client.bucket(MUSWELL_HILL_BUCKET)
        blobs = list(bucket.list_blobs(prefix=prefix))
        base_url = f"https://storage.googleapis.com/{MUSWELL_HILL_BUCKET}"
        images = []
        for b in blobs:
            if b.name.endswith('/'):
                continue
            name = b.name.split('/')[-1]
            images.append({'name': name, 'url': f"{base_url}/{b.name}"})
        return jsonify(images), 200
    except Exception as e:
        app.logger.error(f"Error listing Muswell Hill images: {e}")
        return jsonify([]), 200

@app.route('/api/image/<path:image_path>')
def serve_gcp_image(image_path):
    try:
        if not gcp_storage_client:
            return jsonify({'error': 'GCP Storage not configured'}), 500
        bucket_name = GCP_BUCKET_NAME
        if 'highgate-avenue-designs' in image_path or image_path.startswith('designs/'):
            bucket_name = 'highgate-avenue-designs'
            if image_path.startswith('designs/'):
                image_path = image_path.replace('designs/', '', 1)
        bucket = gcp_storage_client.bucket(bucket_name)
        blob = bucket.blob(image_path)
        if not blob.exists():
            return jsonify({'error': 'Image not found'}), 404
        image_data = blob.download_as_bytes()
        content_type = blob.content_type or 'image/png'
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


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.getenv('FLASK_ENV') == 'development')
