FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app files
COPY server.js indexer.js ./
COPY public/ ./public/

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 3000

# Default environment
ENV PORT=3000 \
    SERVER=0.0.0.0 \
    DATA_DIR=/data

# Start server
CMD ["node", "server.js", "--port", "3000", "--server", "0.0.0.0", "--data", "/data"]
