# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source and config
COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src/
COPY public ./public/ 2>/dev/null || true

# Build args for environment variables baked into the frontend
ARG VITE_API_URL=/api
ARG VITE_ENTRA_CLIENT_ID
ARG VITE_ENTRA_TENANT_ID
ARG VITE_ENTRA_FINANCE_DIRECTOR_GROUP_ID
ARG VITE_ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID
ARG VITE_ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID

# Build the application
RUN npm run build

# Production stage - serve with Nginx
FROM nginx:alpine AS production

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Run as non-root
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
