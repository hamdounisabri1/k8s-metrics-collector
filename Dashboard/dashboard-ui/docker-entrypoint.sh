#!/bin/sh

envsubst < /usr/share/nginx/html/assets/config.template.js > /usr/share/nginx/html/assets/config.js

nginx -g "daemon off;"
