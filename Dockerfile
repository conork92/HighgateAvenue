# syntax=docker/dockerfile:1
# Use BuildKit for faster builds: DOCKER_BUILDKIT=1 (default in recent Docker)
FROM python:3.11-slim

WORKDIR /app

# Install dependencies. Cache mount speeds up repeated installs when requirements change.
# If installs still feel slow: use `make start` (not `make rebuild`) so the pip layer is reused when only app code changes.
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --timeout 120 -r requirements.txt

# Copy application code
COPY . .

# Cloud Run sets PORT (e.g. 8080); default 5000 for local/Docker
EXPOSE 5000

# Run the application (use PORT env so Cloud Run can inject 8080)
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 2 --threads 2 --timeout 120 app:app"]
