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

const ROOM_TTL = 172800; // 2 суток

async function getRoom(roomId) {
  const client = getRedisClient();
  const data = await client.get(`room:${roomId}`);
  if (!data) return null;
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

/**
 * Оптимистичная блокировка комнаты через SET NX EX.
 * Возвращает true, если блокировка успешно получена, иначе false.
 * Используется для предотвращения гонок при одновременных запросах.
 *
 * @param {string} roomId — идентификатор комнаты
 * @param {number} ttl — время жизни блокировки в миллисекундах (по умолчанию 5000)
 * @returns {Promise<boolean>}
 */
async function acquireLock(roomId, ttl = 5000) {
  const client = getRedisClient();
  const lockKey = `lock:room:${roomId}`;
  // PX — миллисекунды, NX — только если ключа ещё нет
  const result = await client.set(lockKey, Date.now().toString(), { nx: true, px: ttl });
  return result === 'OK' || result === true;
}

/**
 * Освобождение блокировки комнаты.
 *
 * @param {string} roomId — идентификатор комнаты
 * @returns {Promise<void>}
 */
async function releaseLock(roomId) {
  const client = getRedisClient();
  const lockKey = `lock:room:${roomId}`;
  await client.del(lockKey);
}

module.exports = { getRoom, setRoom, deleteRoom, acquireLock, releaseLock };
