#!/bin/sh
set -eu
: "${JARVIS_GATEWAY_TOKEN:?JARVIS_GATEWAY_TOKEN must be set}"
envsubst '${JARVIS_GATEWAY_TOKEN}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
