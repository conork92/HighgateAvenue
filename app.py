from flask import Flask, render_template, jsonify, request
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

# GCP Storage configuration
GCP_BUCKET_NAME = os.getenv('GCP_BUCKET_NAME', 'highgate-avenue-images')
GCP_PROJECT_ID = os.getenv('GCP_PROJECT_ID')
GCP_CREDENTIALS_JSON = os.getenv('GCP_CREDENTIALS_JSON')  # JSON string or path to file
GCP_CREDENTIALS_PATH = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')  # Path to credentials file

# Initialize Supabase client (for database)
supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

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

@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

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
