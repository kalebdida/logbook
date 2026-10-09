# The Logbook server in one image: API + the web app. For any host that runs
# containers (Fly.io, Railway, a VPS, your own machine).
#   docker build -t logbook .
#   docker run -p 8000:8000 -e LOGBOOK_PASSWORD=... -v logbook-data:/data logbook
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    LOGBOOK_DATABASE_URL=sqlite:////data/logbook.db \
    LOGBOOK_SECRET_FILE=/data/.logbook-secret \
    LOGBOOK_ENVIRONMENT=production

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend
COPY index.html manifest.webmanifest sw.js ./
COPY css css
COPY js js
COPY assets assets
RUN mkdir -p /data && useradd --create-home logbook && chown logbook /data
USER logbook
VOLUME /data

WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
