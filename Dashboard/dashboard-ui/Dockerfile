FROM node:18 as build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build -- --configuration development

FROM nginx:alpine

COPY --from=build /app/dist/dashboard-ui /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY src/assets/config.template.js /usr/share/nginx/html/assets/config.template.js
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
