FROM node:16-alpine

# Set up a non-root user.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Leverage the Docker cache: copy package files first.
COPY app/package*.json ./

RUN npm install --production
COPY app .
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
CMD ["node", "index.js"]
