const express = require("express");
const { Pool } = require("pg");
const Redis = require("ioredis");

const app = express();
const port = 3000;

// Middleware for parsion JSON bodies
app.use(express.json());

// Postgresql connection
const pool = new Pool({
  host: "postgres",
  database: "demo-app",
  user: "postgres",
  password: "pwd",
});

// Redis connection with retry strategy
const redis = new Redis({
  host: "redis",
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

// Initialize PostgreSQL table
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Database initialized");
  } catch (error) {
    console.error("Database initialization error:", error);
  }
};

initDb();

// Cache middleware
const cacheMiddleware = async (req, res, next) => {
  if (req.method === "GET") {
    try {
      const cacheKey = 'item:${req.params.id || "all"}';
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        console.log("Cache hit");
        return res.json(JSON.parse(cachedData));
      }
    } catch (error) {
      console.error("Cache error: ", error);
    }
  }
  next();
};

// CREATE - Create a new item
app.post("/items", async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const result = await pool.query(
      "INSERT INTO items (title, description) VALUES ($1::TEXT, $2::TEXT) RETURNING *",
      [title, description]
    );

    // Invalidate cache for all items
    await redis.del("item:all");

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating item: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// READ - Get all items
app.get("/items", cacheMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM items ORDER BY created_at DESC"
    );

    // Cache the results for 1 minute
    await redis.setex("item:all", 60, JSON.stringify(result.rows));

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching items: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// READ - Get single item
app.get("/items/:id", cacheMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM items WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Cache the result for 1 minute
    await redis.setex("item:${id}", 60, JSON.stringify(result.rows[0]));

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching item: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE - Update item
app.put("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const result = await pool.query(
      "UPDATE items SET title = $1::TEXT, description = $2::TEXT, status = $3 WHERE id = $4 RETURNING *",
      [title, description, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Invalidate related caches
    await Promise.all([redis.del("item:${id}"), redis.del("item:all")]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating item: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE - Delete item
app.delete("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM items WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Invalidate related caches
    await Promise.all([redis.del("item:${id"), redis.del("item:all")]);

    res.json({ message: "Item successfully deleted" });
  } catch (error) {
    console.error("Error deleting item: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error: ", err);
  res.status(500).json({ error: "Something went wrong" });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM. Performing graceful shutdown...");

  try {
    await pool.end();
    await redis.quit();
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown: ", error);
    process.exit(1);
  }
});

app.listen(port, () => {
  console.log("Server running on port ${port}");
});
