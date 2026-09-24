import redis
from rq import Queue

from app.core.config import settings

redis_conn = redis.from_url(settings.REDIS_URL)
# A full market-selection search over a 2-year, 200+ location panel with
# several N/effect-size values is expected to genuinely run for hours -
# real compute, not a hung job. Give it real headroom rather than kill a
# run that's legitimately still working. 6h proved too short (Sept 2026: a 210-DMA x
# 826-day panel with N=[8,10,12] and 3 lookbacks was still running at 6h), so allow 24h.
job_queue = Queue("geolift", connection=redis_conn, default_timeout=86400)
