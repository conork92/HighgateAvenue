# Highgate Avenue - Renovation Ideas & Designs

A modern, lightweight web application for showcasing renovation ideas and design inspiration for a 3 bedroom, 2 bathroom flat. Built with Flask, Supabase, and Dockerized for easy deployment to Koyeb.

## Features

- 🏠 Display renovation plans and design ideas by room
- 🎨 Modern, responsive UI with gradient design
- 🔍 Filter plans by room type
- 📱 Mobile-friendly interface
- 🐳 Dockerized for easy deployment
- ☁️ Ready for Koyeb deployment

## Tech Stack

- **Backend**: Flask (Python)
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Deployment**: Docker, Koyeb-ready

## Prerequisites

- Python 3.11+
- Docker and Docker Compose (for containerized deployment)
- Supabase account and project
- Koyeb account (for deployment)

## Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd HighgateAvenue
```

### 2. Set Up Supabase

1. Create a new project in [Supabase](https://supabase.com)
2. Go to the SQL Editor in your Supabase dashboard
3. Run the SQL script from `supabase_schema.sql` to create the necessary tables
4. Note your Supabase URL and anon key from Settings > API

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
FLASK_ENV=production
PORT=5000
```

### 4. Local Development

#### Quick Start (Recommended)

```bash
# Start the application with Docker
make start

# Or run in development mode (local Python)
make dev
```

The app will be available at `http://localhost:8000`

#### Available Make Commands

```bash
make start      # Start the application using Docker Compose
make stop       # Stop the application
make restart    # Restart the application
make build      # Build the Docker image
make logs       # View application logs
make dev        # Run in development mode (local Python)
make install    # Install dependencies locally
make clean      # Clean up Docker containers and images
make help       # Show all available commands
```

#### Manual Setup Options

**Option A: Using Python directly**

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

**Option B: Using Docker**

```bash
# Build and run with Docker Compose
docker-compose up --build

# Or using Docker directly
docker build -t highgate-avenue .
docker run -p 8000:5000 --env-file .env highgate-avenue
```

## Database Schema

The application uses two main tables:

### `plans` table
- `id`: Primary key
- `title`: Plan/idea title
- `description`: Detailed description
- `room`: Room name (e.g., "Living Room", "Kitchen")
- `image_url`: URL to inspiration image
- `source_url`: Link to source/website
- `tags`: Array of tags for categorization
- `created_at`: Timestamp
- `updated_at`: Timestamp

### `rooms` table
- Reference table with predefined room names

## Adding Plans/Ideas

You can add renovation plans through the Supabase dashboard or by using the API:

```bash
# Example: Add a new plan via API
curl -X POST http://localhost:5000/api/plans \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Modern Kitchen Design",
    "description": "Open plan kitchen with island",
    "room": "Kitchen",
    "image_url": "https://example.com/image.jpg",
    "tags": ["modern", "open-plan", "island"]
  }'
```

## Deployment to Koyeb

### Method 1: Deploy from Git Repository

1. Push your code to GitHub/GitLab
2. Go to [Koyeb Dashboard](https://app.koyeb.com)
3. Click "Create App" > "GitHub" (or your Git provider)
4. Select your repository
5. Configure build settings:
   - **Build Command**: (leave empty, Docker will handle it)
   - **Run Command**: (leave empty, Dockerfile CMD will handle it)
6. Add environment variables:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_KEY`: Your Supabase anon key
   - `FLASK_ENV`: `production`
   - `PORT`: `5000`
7. Click "Deploy"

### Method 2: Deploy from Docker Image

1. Build and push to Docker Hub:
```bash
docker build -t yourusername/highgate-avenue .
docker push yourusername/highgate-avenue
```

2. In Koyeb:
   - Create App > Docker
   - Enter image name: `yourusername/highgate-avenue`
   - Add environment variables (same as above)
   - Deploy

### Method 3: Deploy via Koyeb CLI

```bash
# Install Koyeb CLI
curl -fsSL https://cli.koyeb.com/install.sh | sh

# Login
koyeb login

# Deploy
koyeb app create highgate-avenue
koyeb service create \
  --app highgate-avenue \
  --dockerfile Dockerfile \
  --env SUPABASE_URL=your-url \
  --env SUPABASE_KEY=your-key
```

## API Endpoints

- `GET /api/plans` - Get all renovation plans
- `POST /api/plans` - Create a new plan
- `PUT /api/plans/<id>` - Update a plan
- `DELETE /api/plans/<id>` - Delete a plan
- `GET /api/rooms` - Get all rooms

## Project Structure

```
HighgateAvenue/
├── app.py                 # Flask application
├── requirements.txt       # Python dependencies
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose config
├── supabase_schema.sql   # Database schema
├── .env.example          # Environment variables template
├── templates/
│   └── index.html        # Main HTML template
└── static/
    ├── css/
    │   └── style.css     # Styles
    └── js/
        └── app.js        # Frontend JavaScript
```

## Development

### Running in Development Mode

Set `FLASK_ENV=development` in your `.env` file for debug mode.

### Adding New Features

- Frontend: Edit files in `static/` directory
- Backend: Modify `app.py` for new API endpoints
- Styling: Update `static/css/style.css`

## License

This project is for personal use.

## Support

For issues or questions, please check the Supabase and Koyeb documentation.
