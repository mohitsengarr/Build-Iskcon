# Bhaktigram Synapse image for Railway (and any Docker-PaaS).
#
# Wraps the official Synapse image with an entrypoint that, on first boot,
# generates the base config + signing keys onto the persistent volume, then
# applies our settings (Postgres, federation OFF, E2EE OFF, shared secret, the
# Railway $PORT listener) from environment variables on every start.
FROM matrixdotorg/synapse:latest

USER root
COPY docker-entrypoint.sh /bhaktigram-entrypoint.sh
RUN chmod +x /bhaktigram-entrypoint.sh

# Synapse listens on $PORT (Railway injects it); the platform terminates TLS and
# proxies HTTPS -> $PORT. Default 8008 for local runs.
ENV PORT=8008
ENTRYPOINT ["/bhaktigram-entrypoint.sh"]
