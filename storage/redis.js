// storage/redis.js — Upstash Redis storage layer for game rooms
const { Redis } = require('@upstash/redis');

let redis = null;

function getRedisClient() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables');
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

const ROOM_TTL = 86400; // 24 hours in seconds

async function getRoom(roomId) {
  const client = getRedisClient();
  const data = await client.get(`room:${roomId}`);
  if (!data) return null;
  // @upstash/redis automatically deserializes JSON
  return typeof data === 'string' ? JSON.parse(data) : data;
}

async function setRoom(roomId, data) {
  const client = getRedisClient();
  await client.set(`room:${roomId}`, JSON.stringify(data), { ex: ROOM_TTL });
}

async function deleteRoom(roomId) {
  const client = getRedisClient();
  await client.del(`room:${roomId}`);
}

module.exports = { getRoom, setRoom, deleteRoom };
