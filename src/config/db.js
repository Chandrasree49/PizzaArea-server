import { MongoClient, ServerApiVersion } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DB_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pizza-area';

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db = null;

export async function connectDB() {
  if (db) return db;
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    console.log('✅ Connected successfully to MongoDB (PizzaHub database)!');
    db = client.db('pizza-area');
    return db;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    throw error;
  }
}

export function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return db;
}

export { client };