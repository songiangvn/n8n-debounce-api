import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv(); // tự lấy từ biến môi trường

const DEBOUNCE_TIME_MS = 2000;

let timeouts = {};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { senderId, message, recipientId, webhookUrl } = req.body;

  if (!senderId || !message || !webhookUrl || !recipientId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const key = `chat:${senderId}`;

  // Push message to Redis list
  await redis.rpush(key, JSON.stringify({ body: message }));

  // Clear existing timeout
  if (timeouts[senderId]) clearTimeout(timeouts[senderId]);

  // Set debounce timer
  timeouts[senderId] = setTimeout(async () => {
    const messages = await redis.lrange(key, 0, -1);
    await redis.del(key);

    const payload = {
      id: senderId,
      recipientId,
      messages: messages.map(msg => JSON.parse(msg))
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log('Webhook sent:', await response.text());
    } catch (err) {
      console.error('Failed to send to webhook:', err.message);
    }
  }, DEBOUNCE_TIME_MS);

  return res.json({ success: true, message: 'Message received and debounced' });
}
