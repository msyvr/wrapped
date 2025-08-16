## What is this?

- web dev (node.js + express) backend
- redis caching and postgres db
- docker packaging for fully self-contained deploy

### Details

The app stack is a Node.js + express web application backend service with a PostgreSQL database for persistent data storage and a Redis cache for session management and caching.

Core app features:

- CRUD operations
- Redis caching with periodic invalidation
- Input validation
- Error handling
- Database initialization
- Health check endpoint

Queries are parametrized to protect against SQL injection. The app implements caching for GET requests and cache invalidation on updates/deletes. It also includes error handling and validation as well as graceful shutdown.

## Use

Prerequisite: Docker

- [colima](https://github.com/abiosoft/colima) is a great option for a container runtime on macOS and Linux

Clone the project:

```bash
gh repo clone https://github.com/msyvr/wrapped
```

Run in development mode:

```bash
docker-compose up -d
```

### Example CLI database transactions

Post items to the database:

```bash
curl -X POST http://localhost:3000/items \
  -H "Content-Type: application/json" \
  -d '{"title": "E1", "description": "Entry 1"}'

curl -X POST http://localhost:3000/items \
  -H "Content-Type: application/json" \
  -d '{"title": "E2", "description": "Entry 2"}'
```

Update an entry:

```bash
curl -X PUT http://localhost:3000/items/2 \
  -H "Content-Type: application/json" \
  -d '{"title": "E2U", "description": "Entry 2 updated"}'
```

Retrieve all items:

```bash
curl http://localhost:3000/items
```

Retrieve a specific entry:

```bash
curl http://localhost:3000/items/1
```

## Docker

### Dockerfile

- Multi-stage builds mean smaller images.
- By copying in package files separately from the app code, future rebuilds where only app code changes can reuse the package layer. Efficient layer caching can speed up development considerably.
- Non-root user is good security practice.
- Using CMD ["node", "index.js"] means the process is run directly, not started from a shell process.

### Docker compose

- Health checks for each service.
- Dependency order.
- Volumes for data persistence.
- Environment variables for configuration.

## Scaling services

Scale (see [Minutiae](#Minutiae)) specific services

```bash
docker-compose up -d --scale web=3
```

## Interrogating container performance

For debugging, logs for individual services from `docker-compose.yml` can be viewed with:

```bash
docker-compose logs service-name
```

Find the name of docker services running with:

```bash
docker ps
```

View logs with timestamps

```bash
docker-compose logs -f --timestamps
```

Check resource usage

```bash
docker stats
```

## Minutiae

- the postgres server will guess at uncast types; to guarantee alignment with the database column types, cast them using the `::` notation - eg:

```javascript
pool.query(
  "INSERT INTO items (title, description) VALUES ($1::TEXT, $2::TEXT) RETURNING *",
  [title, description]
);
```

- if scaling specific services, sufficient ports need to be assigned - eg, the following could scale up to 10 `web` apps:

```yml
services:
  web:
    build: .
    ports:
      - "3000-3009:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: development
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3000"]
      interval: 10s
      timeout: 5s
      retries: 3
```

- nb! need to make sure the `listen` port of the app matches the assigned port at deploy

## Considerations for production deploy

When moving from development to production, consider:

Maintain the service and the database:

- Set up backups
- Manage updates and patches
- Monitoring and alerting setup

Adapt for scalability:

- Add a load balancer
- Use appropriate caching strategies
- Database indexing for efficient queries

Improve security:

- Use secrets management, not environment variables
- Add monitoring
- Set appropriate network policies
