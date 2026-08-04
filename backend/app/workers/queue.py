import redis
from rq import Queue

from app.core.config import settings

redis_conn = redis.from_url(settings.REDIS_URL)
# A full market-selection search over a 2-year, 200+ location panel with
# several N/effect-size values is expected to genuinely run for hours -
# real compute, not a hung job. Give it real headroom rather than kill a
# run that's legitimately still working.
job_queue = Queue("geolift", connection=redis_conn, default_timeout=21600)
