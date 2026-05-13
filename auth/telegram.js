// auth/telegram.js — Telegram WebApp initData validation
const crypto = require('crypto');

/**
 * Validates Telegram WebApp initData using HMAC-SHA256.
 * Returns the user object if valid, or null if invalid.
 *
 * @param {string} initData - The raw initData string from Telegram.WebApp.initData
 * @param {string} botToken - The bot token from @BotFather
 * @returns {{ id: number, first_name: string, last_name?: string, username?: string } | null}
 */
function validateTelegramData(initData, botToken) {
  if (!initData || !botToken) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${key}=${val}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) return null;

    // Check auth_date freshness (allow 1 hour)
    const authDate = parseInt(params.get('auth_date'), 10);
    if (!authDate) return null;
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 3600) return null;

    // Parse user data
    const userStr = params.get('user');
    if (!userStr) return null;

    const user = JSON.parse(userStr);
    return user;
  } catch (e) {
    return null;
  }
}

module.exports = { validateTelegramData };
