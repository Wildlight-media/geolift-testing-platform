import redis
from rq import Queue

from app.core.config import settings

redis_conn = redis.from_url(settings.REDIS_URL)
# Confidence-interval computation on a large panel (e.g. a national,
# 190+ DMA dataset) can take close to 30 minutes on its own - give real
# headroom rather than risk a completed-except-for-the-deadline failure.
job_queue = Queue("geolift", connection=redis_conn, default_timeout=3600)
