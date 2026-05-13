// api/game.js — Monopoly Game Server Logic
// Vercel Serverless Function handling all game API routes

const { getRoom, setRoom, deleteRoom } = require('../storage/redis');
const { validateTelegramData } = require('../auth/telegram');

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================

function authenticateRequest(req, body) {
  const botToken = process.env.BOT_TOKEN;
  const allowDevMode = process.env.ALLOW_DEV_MODE === 'true';

  // Try to get initData from header or body
  const initData = req.headers['x-telegram-init-data'] || body?.initData || '';

  if (initData && botToken) {
    const user = validateTelegramData(initData, botToken);
    if (user) {
      return {
        valid: true,
        userId: String(user.id),
        userName: user.first_name + (user.last_name ? ' ' + user.last_name : ''),
      };
    }
    // initData provided but invalid
    if (!allowDevMode) {
      return { valid: false, error: 'Invalid Telegram initData signature' };
    }
  }

  // No initData or invalid — check dev mode
  if (allowDevMode) {
    // Fallback to body params for development
    if (body?.playerId) {
      return {
        valid: true,
        userId: body.playerId,
        userName: body.playerName || 'Dev Player',
      };
    }
    return { valid: false, error: 'Missing playerId in dev mode' };
  }

  return { valid: false, error: 'Authentication required. Provide X-Telegram-Init-Data header.' };
}

// ============================================================
// BOARD DEFINITION (Standard Monopoly 40 cells)
// ============================================================

const BOARD = [
  { id: 0, type: 'go', name: 'Старт' },
  { id: 1, type: 'property', name: 'Житная ул.', color: 'brown', price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50 },
  { id: 2, type: 'chest', name: 'Общественная казна' },
  { id: 3, type: 'property', name: 'Нагатинская ул.', color: 'brown', price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },
  { id: 4, type: 'tax', name: 'Подоходный налог', amount: 200 },
  { id: 5, type: 'railroad', name: 'Рижская ж/д', price: 200 },
  { id: 6, type: 'property', name: 'Варшавское ш.', color: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { id: 7, type: 'chance', name: 'Шанс' },
  { id: 8, type: 'property', name: 'Огарёва ул.', color: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { id: 9, type: 'property', name: 'Первая Парковая', color: 'lightblue', price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },
  { id: 10, type: 'jail', name: 'Тюрьма / Посещение' },
  { id: 11, type: 'property', name: 'Полянка ул.', color: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { id: 12, type: 'utility', name: 'Электростанция', price: 150 },
  { id: 13, type: 'property', name: 'Сретенка ул.', color: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { id: 14, type: 'property', name: 'Ростовская наб.', color: 'pink', price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },
  { id: 15, type: 'railroad', name: 'Курская ж/д', price: 200 },
  { id: 16, type: 'property', name: 'Рублёвское ш.', color: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { id: 17, type: 'chest', name: 'Общественная казна' },
  { id: 18, type: 'property', name: 'Горьковская ул.', color: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { id: 19, type: 'property', name: 'Пушкинская ул.', color: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },
  { id: 20, type: 'parking', name: 'Бесплатная стоянка' },
  { id: 21, type: 'property', name: 'Маросейка ул.', color: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { id: 22, type: 'chance', name: 'Шанс' },
  { id: 23, type: 'property', name: 'Большая Ордынка', color: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { id: 24, type: 'property', name: 'Тверская ул.', color: 'red', price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150 },
  { id: 25, type: 'railroad', name: 'Казанская ж/д', price: 200 },
  { id: 26, type: 'property', name: 'Якиманка ул.', color: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { id: 27, type: 'property', name: 'Новокузнецкая', color: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { id: 28, type: 'utility', name: 'Водоканал', price: 150 },
  { id: 29, type: 'property', name: 'Кутузовский пр.', color: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },
  { id: 30, type: 'gotojail', name: 'Отправляйтесь в тюрьму' },
  { id: 31, type: 'property', name: 'Малая Бронная', color: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { id: 32, type: 'property', name: 'Арбат ул.', color: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { id: 33, type: 'chest', name: 'Общественная казна' },
  { id: 34, type: 'property', name: 'Грузинская ул.', color: 'green', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },
  { id: 35, type: 'railroad', name: 'Ленинградская ж/д', price: 200 },
  { id: 36, type: 'chance', name: 'Шанс' },
  { id: 37, type: 'property', name: 'Ул. Неглинная', color: 'blue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
  { id: 38, type: 'tax', name: 'Налог на роскошь', amount: 100 },
  { id: 39, type: 'property', name: 'Петровка ул.', color: 'blue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 },
];

const COLOR_GROUPS = {
  brown: [1, 3],
  lightblue: [6, 8, 9],
  pink: [11, 13, 14],
  orange: [16, 18, 19],
  red: [21, 23, 24],
  yellow: [26, 27, 29],
  green: [31, 32, 34],
  blue: [37, 39]
};

const CHANCE_CARDS = [
  { type: 'move', to: 0, text: 'Отправляйтесь на Старт. Получите 200$' },
  { type: 'move', to: 24, text: 'Отправляйтесь на Тверскую улицу' },
  { type: 'move', to: 11, text: 'Отправляйтесь на Полянку' },
  { type: 'money', amount: 150, text: 'Банк выплачивает вам дивиденды 150$' },
  { type: 'money', amount: -15, text: 'Штраф за превышение скорости 15$' },
  { type: 'move', to: 5, text: 'Отправляйтесь на Рижскую ж/д' },
  { type: 'money', amount: 50, text: 'Выигрыш в лотерее 50$' },
  { type: 'jail', text: 'Отправляйтесь в тюрьму' },
  { type: 'money', amount: -100, text: 'Оплата ремонта 100$' },
  { type: 'move', to: 39, text: 'Отправляйтесь на Петровку' },
  { type: 'money', amount: 100, text: 'Наследство 100$' },
  { type: 'jailcard', text: 'Карта освобождения из тюрьмы' },
  { type: 'money', amount: -50, text: 'Оплата штрафа 50$' },
  { type: 'move', to: 10, text: 'Посетите тюрьму (без ареста)' },
  { type: 'money', amount: 200, text: 'Ошибка банка в вашу пользу. Получите 200$' },
];

const CHEST_CARDS = [
  { type: 'move', to: 0, text: 'Отправляйтесь на Старт' },
  { type: 'money', amount: 200, text: 'Ошибка банка. Получите 200$' },
  { type: 'money', amount: -50, text: 'Оплата больничных 50$' },
  { type: 'money', amount: 50, text: 'Продажа акций 50$' },
  { type: 'jailcard', text: 'Карта освобождения из тюрьмы' },
  { type: 'jail', text: 'Отправляйтесь в тюрьму' },
  { type: 'money', amount: 100, text: 'Выиграли конкурс красоты. Получите 100$' },
  { type: 'money', amount: -100, text: 'Оплата страхования 100$' },
  { type: 'money', amount: 25, text: 'Возврат переплаты 25$' },
  { type: 'money', amount: -150, text: 'Оплата обучения 150$' },
  { type: 'money', amount: 10, text: 'Получите 10$' },
  { type: 'money', amount: 20, text: 'Получите 20$' },
];

// ============================================================
// GAME LOGIC HELPERS
// ============================================================

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createRoom(hostId, hostName, settings = {}) {
  const roomId = generateRoomId();
  const room = {
    id: roomId,
    hostId,
    settings: {
      startingMoney: settings.startingMoney || 1500,
      auctionTimer: settings.auctionTimer || 10,
      requireFullGroup: settings.requireFullGroup !== false,
    },
    state: 'lobby',
    players: [{
      id: hostId,
      name: hostName,
      balance: settings.startingMoney || 1500,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      doublesCount: 0,
      color: '#e74c3c'
    }],
    properties: {},
    currentPlayerIndex: 0,
    lastDice: [0, 0],
    turnPhase: 'roll',
    auction: null,
    agreements: [],
    monopolyDeals: [],
    trades: [],
    notifications: [],
    debtInfo: null,
    lastUpdate: Date.now(),
    chanceIndex: 0,
    chestIndex: 0,
    bankruptAuctionQueue: null,
  };
  return room;
}

function getPlayerById(room, playerId) {
  return room.players.find(p => p.id === playerId);
}

function getActivePlayer(room) {
  return room.players[room.currentPlayerIndex];
}

function getActivePlayers(room) {
  return room.players.filter(p => !p.bankrupt);
}

function nextTurn(room) {
  const activePlayers = getActivePlayers(room);
  if (activePlayers.length <= 1) {
    room.state = 'finished';
    room.winner = activePlayers[0]?.id;
    room.turnPhase = 'finished';
    return;
  }
  let next = (room.currentPlayerIndex + 1) % room.players.length;
  while (room.players[next].bankrupt) {
    next = (next + 1) % room.players.length;
  }
  room.currentPlayerIndex = next;
  room.turnPhase = 'roll';
  room.players[next].doublesCount = 0;
}

function addNotification(room, text) {
  room.notifications.push({ text, time: Date.now() });
  if (room.notifications.length > 50) room.notifications.shift();
}

function rollDice() {
  return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
}

function calculateRent(room, cellId, diceSum) {
  const cell = BOARD[cellId];
  const prop = room.properties[cellId];
  if (!prop || prop.mortgaged) return 0;

  if (cell.type === 'railroad') {
    const ownerRailroads = Object.entries(room.properties)
      .filter(([id, p]) => p.ownerId === prop.ownerId && BOARD[parseInt(id)].type === 'railroad')
      .length;
    return [25, 50, 100, 200][ownerRailroads - 1] || 25;
  }

  if (cell.type === 'utility') {
    const ownerUtils = Object.entries(room.properties)
      .filter(([id, p]) => p.ownerId === prop.ownerId && BOARD[parseInt(id)].type === 'utility')
      .length;
    return diceSum * (ownerUtils >= 2 ? 10 : 4);
  }

  if (cell.type === 'property') {
    if (prop.houses > 0) {
      return cell.rent[prop.houses];
    }
    const group = COLOR_GROUPS[cell.color];
    const ownerHasFullGroup = group.every(cid => {
      const p = room.properties[cid];
      return p && (p.ownerId === prop.ownerId || isInMonopolyDeal(room, cid, prop.ownerId));
    });
    return ownerHasFullGroup ? cell.rent[0] * 2 : cell.rent[0];
  }
  return 0;
}

function isInMonopolyDeal(room, cellId, playerId) {
  const cell = BOARD[cellId];
  if (cell.type !== 'property') return false;
  return room.monopolyDeals.some(deal =>
    deal.color === cell.color &&
    deal.members.includes(playerId)
  );
}

function hasFullGroup(room, color, playerId) {
  const group = COLOR_GROUPS[color];
  return group.every(cid => {
    const p = room.properties[cid];
    if (!p) return false;
    if (p.ownerId === playerId) return true;
    return room.monopolyDeals.some(deal =>
      deal.color === color &&
      deal.members.includes(playerId) &&
      deal.members.includes(p.ownerId)
    );
  });
}

function isExemptFromRent(room, guestId, ownerId, cellId) {
  return room.agreements.some(a =>
    a.ownerId === ownerId &&
    a.guestId === guestId &&
    (a.allProperties || a.properties.includes(cellId))
  );
}

function getMonopolyDealForCell(room, cellId) {
  const cell = BOARD[cellId];
  if (cell.type !== 'property') return null;
  return room.monopolyDeals.find(deal => deal.color === cell.color) || null;
}

function distributeRent(room, cellId, rentAmount, payerId) {
  const deal = getMonopolyDealForCell(room, cellId);
  const prop = room.properties[cellId];

  // BUG-08 fix: Only distribute through deal if the owner is a member of the deal
  if (deal && !deal.members.includes(payerId) && deal.members.includes(prop.ownerId)) {
    if (deal.splitType === 'equal') {
      const share = Math.floor(rentAmount / deal.members.length);
      const remainder = rentAmount - share * deal.members.length;
      deal.members.forEach((memberId, i) => {
        const player = getPlayerById(room, memberId);
        if (player) player.balance += share + (i === 0 ? remainder : 0);
      });
    } else {
      const totalInvestment = deal.investments ? Object.values(deal.investments).reduce((s, v) => s + v, 0) : 1;
      deal.members.forEach(memberId => {
        const inv = (deal.investments && deal.investments[memberId]) || 0;
        const share = totalInvestment > 0 ? Math.floor(rentAmount * inv / totalInvestment) : Math.floor(rentAmount / deal.members.length);
        const player = getPlayerById(room, memberId);
        if (player) player.balance += share;
      });
    }
  } else {
    // Normal: all goes to owner (also fallback if owner not in deal)
    const owner = getPlayerById(room, prop.ownerId);
    if (owner) owner.balance += rentAmount;
  }
}

function processCardEffect(room, player, card) {
  switch (card.type) {
    case 'money':
      player.balance += card.amount;
      addNotification(room, `${player.name}: ${card.text}`);
      break;
    case 'move':
      if (card.to < player.position && card.to !== 10) {
        player.balance += 200;
      }
      player.position = card.to;
      addNotification(room, `${player.name}: ${card.text}`);
      break;
    case 'jail':
      player.position = 10;
      player.inJail = true;
      player.jailTurns = 0;
      player.doublesCount = 0; // BUG-03 fix
      addNotification(room, `${player.name} отправляется в тюрьму!`);
      break;
    case 'jailcard':
      player.jailCards = (player.jailCards || 0) + 1;
      addNotification(room, `${player.name} получил карту освобождения из тюрьмы`);
      break;
  }
}

function checkPostMove(room, player, diceSum, depth) {
  if (typeof depth === 'undefined') depth = 0;
  if (depth > 5) {
    room.turnPhase = 'endturn';
    return;
  }

  const cell = BOARD[player.position];

  if (cell.type === 'gotojail') {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    player.doublesCount = 0; // BUG-03 fix
    addNotification(room, `${player.name} отправляется в тюрьму!`);
    room.turnPhase = 'endturn';
    return;
  }

  if (cell.type === 'tax') {
    player.balance -= cell.amount;
    addNotification(room, `${player.name} заплатил ${cell.amount}$ налогов`);
    if (player.balance < 0) {
      room.turnPhase = 'manage';
      room.debtInfo = { type: 'bank', amount: -player.balance };
    } else {
      room.turnPhase = 'endturn';
    }
    return;
  }

  if (cell.type === 'chance') {
    const card = CHANCE_CARDS[room.chanceIndex % CHANCE_CARDS.length];
    room.chanceIndex++;
    processCardEffect(room, player, card);
    if (player.inJail) { room.turnPhase = 'endturn'; return; }
    if (card.type === 'move') {
      checkPostMove(room, player, diceSum, depth + 1);
      return;
    }
    if (player.balance < 0) {
      room.turnPhase = 'manage';
      room.debtInfo = { type: 'bank', amount: -player.balance };
    } else {
      room.turnPhase = 'endturn';
    }
    return;
  }

  if (cell.type === 'chest') {
    const card = CHEST_CARDS[room.chestIndex % CHEST_CARDS.length];
    room.chestIndex++;
    processCardEffect(room, player, card);
    if (player.inJail) { room.turnPhase = 'endturn'; return; }
    if (card.type === 'move') {
      checkPostMove(room, player, diceSum, depth + 1);
      return;
    }
    if (player.balance < 0) {
      room.turnPhase = 'manage';
      room.debtInfo = { type: 'bank', amount: -player.balance };
    } else {
      room.turnPhase = 'endturn';
    }
    return;
  }

  if ((cell.type === 'property' || cell.type === 'railroad' || cell.type === 'utility') && room.properties[cell.id]) {
    const prop = room.properties[cell.id];
    if (prop.ownerId !== player.id && !prop.mortgaged) {
      if (isExemptFromRent(room, player.id, prop.ownerId, cell.id)) {
        addNotification(room, `${player.name} освобождён от аренды на ${cell.name}`);
        room.turnPhase = 'endturn';
        return;
      }
      const deal = getMonopolyDealForCell(room, cell.id);
      if (deal && deal.members.includes(player.id)) {
        room.turnPhase = 'endturn';
        return;
      }
      const rent = calculateRent(room, cell.id, diceSum);
      player.balance -= rent;
      distributeRent(room, cell.id, rent, player.id);
      addNotification(room, `${player.name} заплатил ${rent}$ за аренду ${cell.name}`);
      if (player.balance < 0) {
        room.turnPhase = 'manage';
        room.debtInfo = { type: 'player', creditorId: prop.ownerId, amount: -player.balance };
      } else {
        room.turnPhase = 'endturn';
      }
    } else {
      room.turnPhase = 'endturn';
    }
    return;
  }

  if ((cell.type === 'property' || cell.type === 'railroad' || cell.type === 'utility') && !room.properties[cell.id]) {
    room.turnPhase = 'buy';
    return;
  }

  room.turnPhase = 'endturn';
}

/**
 * Server-side check: can a player recover from negative balance
 * by selling houses and mortgaging properties?
 */
function canPlayerRecoverServer(room, player) {
  let potential = player.balance;
  Object.entries(room.properties).forEach(([cellId, prop]) => {
    if (prop.ownerId === player.id) {
      if (prop.houses > 0) {
        const cell = BOARD[parseInt(cellId)];
        potential += prop.houses * Math.floor(cell.houseCost / 2);
      }
      if (!prop.mortgaged) {
        const cell = BOARD[parseInt(cellId)];
        potential += Math.floor(cell.price / 2);
      }
    }
  });
  return potential >= 0;
}

/**
 * Calculate the residual value of a player's properties (for bankruptcy transfer)
 */
function calculateResidualValue(room, playerId) {
  let value = 0;
  Object.entries(room.properties).forEach(([cellId, prop]) => {
    if (prop.ownerId === playerId) {
      const cell = BOARD[parseInt(cellId)];
      if (prop.mortgaged) {
        // Buyer must pay unmortgage cost
        value += Math.floor(cell.price / 2 * 1.1);
      } else {
        value += Math.floor(cell.price / 2);
      }
      if (prop.houses > 0) {
        value += prop.houses * Math.floor(cell.houseCost / 2);
      }
    }
  });
  return value;
}

/**
 * Check and auto-complete auction if timer expired.
 * Called on every state request and auction_check to ensure auctions don't hang.
 */
function checkAuctionExpiry(room) {
  if (room.turnPhase !== 'auction' || !room.auction) return false;

  const elapsed = Date.now() - room.auction.lastBidTime;
  if (elapsed >= room.auction.timerDuration) {
    if (room.auction.currentBidderId) {
      const winner = getPlayerById(room, room.auction.currentBidderId);
      if (winner) {
        winner.balance -= room.auction.currentBid;
        room.properties[room.auction.cellId] = { ownerId: winner.id, houses: 0, mortgaged: false };
        addNotification(room, `Аукцион завершён! ${winner.name} купил ${BOARD[room.auction.cellId].name} за ${room.auction.currentBid}$`);
      }
    } else {
      addNotification(room, `Аукцион завершён. Никто не сделал ставку. ${BOARD[room.auction.cellId].name} остаётся свободной.`);
    }
    room.auction = null;

    // Check if there are more bankrupt auction items queued
    if (room.bankruptAuctionQueue && room.bankruptAuctionQueue.length > 0) {
      startNextBankruptAuction(room);
    } else {
      room.bankruptAuctionQueue = null;
      room.turnPhase = 'endturn';
    }

    room.lastUpdate = Date.now();
    return true;
  }
  return false;
}

/**
 * Start the next bankruptcy auction from the queue
 */
function startNextBankruptAuction(room) {
  if (!room.bankruptAuctionQueue || room.bankruptAuctionQueue.length === 0) {
    room.bankruptAuctionQueue = null;
    room.turnPhase = 'endturn';
    return;
  }

  const cellId = room.bankruptAuctionQueue.shift();
  const cell = BOARD[cellId];

  // Remove houses before auction
  if (room.properties[cellId]) {
    room.properties[cellId].houses = 0;
    room.properties[cellId].mortgaged = false;
    // Clear ownership so it can be auctioned as free
    delete room.properties[cellId];
  }

  room.auction = {
    cellId: cellId,
    currentBid: 0,
    currentBidderId: null,
    initiatorId: '__bankrupt__', // No one is excluded from bidding
    lastBidTime: Date.now(),
    timerDuration: room.settings.auctionTimer * 1000,
  };
  room.turnPhase = 'auction';
  addNotification(room, `Аукцион банкротства: ${cell.name}`);
}

// ============================================================
// API HANDLER
// ============================================================

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace('/api/', '');
  const params = Object.fromEntries(url.searchParams);

  let body = {};
  if (req.method === 'POST') {
    body = req.body || {};
  }

  // Authenticate for all requests
  const auth = authenticateRequest(req, body);

  // For GET requests that only need roomId (state, auction_check), allow without full auth
  // but still validate if initData is provided
  const isReadOnly = (path === 'state' || path === 'auction_check');

  if (!isReadOnly && !auth.valid) {
    return res.status(401).json({ error: auth.error || 'Unauthorized' });
  }

  // For authenticated requests, override playerId/playerName with verified data
  const playerId = auth.valid ? auth.userId : (body.playerId || params.playerId);
  const playerName = auth.valid ? auth.userName : (body.playerName || 'Игрок');

  try {
    switch (path) {
      case 'create': {
        if (!playerId || !playerName) return res.status(400).json({ error: 'Missing playerId/playerName' });
        const room = createRoom(playerId, playerName, body.settings || {});
        await setRoom(room.id, room);
        return res.json({ success: true, room });
      }

      case 'join': {
        const { roomId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (room.state !== 'lobby') return res.status(400).json({ error: 'Game already started' });
        if (room.players.find(p => p.id === playerId)) {
          return res.json({ success: true, room });
        }
        if (room.players.length >= 6) return res.status(400).json({ error: 'Room is full' });
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];
        room.players.push({
          id: playerId,
          name: playerName,
          balance: room.settings.startingMoney,
          position: 0,
          inJail: false,
          jailTurns: 0,
          jailCards: 0,
          bankrupt: false,
          doublesCount: 0,
          color: colors[room.players.length % colors.length]
        });
        room.lastUpdate = Date.now();
        addNotification(room, `${playerName} присоединился к игре`);
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'start': {
        const { roomId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (room.hostId !== playerId) return res.status(403).json({ error: 'Only host can start' });
        if (room.players.length < 2) return res.status(400).json({ error: 'Need at least 2 players' });
        room.state = 'playing';
        room.currentPlayerIndex = 0;
        room.turnPhase = 'roll';
        room.chanceIndex = Math.floor(Math.random() * CHANCE_CARDS.length);
        room.chestIndex = Math.floor(Math.random() * CHEST_CARDS.length);
        addNotification(room, 'Игра началась!');
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'state': {
        const roomId = params.roomId;
        const clientLastUpdate = parseInt(params.lastUpdate, 10) || 0;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        // Check and auto-complete expired auction (BUG-02 fix)
        const auctionCompleted = checkAuctionExpiry(room);
        if (auctionCompleted) {
          await setRoom(roomId, room);
        }

        // Version check: if client is up to date, return lightweight response
        if (clientLastUpdate && clientLastUpdate >= room.lastUpdate && !auctionCompleted) {
          return res.json({ success: true, notModified: true });
        }

        return res.json({ success: true, room });
      }

      case 'roll': {
        const { roomId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (room.state !== 'playing') return res.status(400).json({ error: 'Game not active' });
        const currentPlayer = getActivePlayer(room);
        if (currentPlayer.id !== playerId) return res.status(403).json({ error: 'Not your turn' });
        if (room.turnPhase !== 'roll') return res.status(400).json({ error: 'Cannot roll now' });

        const dice = rollDice();
        room.lastDice = dice;
        const diceSum = dice[0] + dice[1];
        const isDoubles = dice[0] === dice[1];

        if (currentPlayer.inJail) {
          if (isDoubles) {
            currentPlayer.inJail = false;
            currentPlayer.jailTurns = 0;
            currentPlayer.doublesCount = 0; // Reset after jail exit
            currentPlayer.position = (currentPlayer.position + diceSum) % 40;
            addNotification(room, `${currentPlayer.name} выбросил дубль и вышел из тюрьмы!`);
            checkPostMove(room, currentPlayer, diceSum);
          } else {
            currentPlayer.jailTurns++;
            if (currentPlayer.jailTurns >= 3) {
              currentPlayer.balance -= 50;
              currentPlayer.inJail = false;
              currentPlayer.jailTurns = 0;
              currentPlayer.position = (currentPlayer.position + diceSum) % 40;
              addNotification(room, `${currentPlayer.name} оплатил 50$ и вышел из тюрьмы`);
              if (currentPlayer.balance < 0) {
                room.turnPhase = 'manage';
                room.debtInfo = { type: 'bank', amount: -currentPlayer.balance };
              } else {
                checkPostMove(room, currentPlayer, diceSum);
              }
            } else {
              addNotification(room, `${currentPlayer.name} не выбросил дубль. Ход ${currentPlayer.jailTurns}/3`);
              room.turnPhase = 'endturn';
            }
          }
        } else {
          if (isDoubles) {
            currentPlayer.doublesCount++;
            if (currentPlayer.doublesCount >= 3) {
              currentPlayer.position = 10;
              currentPlayer.inJail = true;
              currentPlayer.jailTurns = 0;
              currentPlayer.doublesCount = 0; // BUG-03 fix: reset on jail entry
              addNotification(room, `${currentPlayer.name} выбросил 3 дубля подряд и идёт в тюрьму!`);
              room.turnPhase = 'endturn';
            } else {
              const oldPos = currentPlayer.position;
              currentPlayer.position = (currentPlayer.position + diceSum) % 40;
              if (currentPlayer.position < oldPos) {
                currentPlayer.balance += 200;
                addNotification(room, `${currentPlayer.name} прошёл через Старт (+200$)`);
              }
              addNotification(room, `${currentPlayer.name} бросил ${dice[0]}+${dice[1]} (дубль!)`);
              checkPostMove(room, currentPlayer, diceSum);
            }
          } else {
            currentPlayer.doublesCount = 0;
            const oldPos = currentPlayer.position;
            currentPlayer.position = (currentPlayer.position + diceSum) % 40;
            if (currentPlayer.position < oldPos) {
              currentPlayer.balance += 200;
              addNotification(room, `${currentPlayer.name} прошёл через Старт (+200$)`);
            }
            addNotification(room, `${currentPlayer.name} бросил ${dice[0]}+${dice[1]}`);
            checkPostMove(room, currentPlayer, diceSum);
          }
        }

        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'payjail': {
        const { roomId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const currentPlayer = getActivePlayer(room);
        if (currentPlayer.id !== playerId) return res.status(403).json({ error: 'Not your turn' });
        if (!currentPlayer.inJail) return res.status(400).json({ error: 'Not in jail' });
        if (room.turnPhase !== 'roll') return res.status(400).json({ error: 'Cannot act now' });

        currentPlayer.balance -= 50;
        currentPlayer.inJail = false;
        currentPlayer.jailTurns = 0;
        addNotification(room, `${currentPlayer.name} заплатил 50$ и вышел из тюрьмы`);
        if (currentPlayer.balance < 0) {
          room.turnPhase = 'manage';
          room.debtInfo = { type: 'bank', amount: -currentPlayer.balance };
        }
        // If balance >= 0, turnPhase remains 'roll' — player can now roll normally
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'usejailcard': {
        const { roomId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const currentPlayer = getActivePlayer(room);
        if (currentPlayer.id !== playerId) return res.status(403).json({ error: 'Not your turn' });
        if (!currentPlayer.inJail || !currentPlayer.jailCards) return res.status(400).json({ error: 'Cannot use card' });

        currentPlayer.jailCards--;
        currentPlayer.inJail = false;
        currentPlayer.jailTurns = 0;
        addNotification(room, `${currentPlayer.name} использовал карту освобождения`);
        // turnPhase remains 'roll' — player rolls normally
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'buy': {
        const { roomId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const currentPlayer = getActivePlayer(room);
        if (currentPlayer.id !== playerId) return res.status(403).json({ error: 'Not your turn' });
        if (room.turnPhase !== 'buy') return res.status(400).json({ error: 'Cannot buy now' });

        const cell = BOARD[currentPlayer.position];
        if (currentPlayer.balance < cell.price) return res.status(400).json({ error: 'Not enough money' });

        currentPlayer.balance -= cell.price;
        room.properties[cell.id] = { ownerId: playerId, houses: 0, mortgaged: false };
        addNotification(room, `${currentPlayer.name} купил ${cell.name} за ${cell.price}$`);
        room.turnPhase = 'endturn';
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'auction_start': {
        const { roomId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const currentPlayer = getActivePlayer(room);
        if (currentPlayer.id !== playerId) return res.status(403).json({ error: 'Not your turn' });
        if (room.turnPhase !== 'buy') return res.status(400).json({ error: 'Cannot start auction now' });

        const cell = BOARD[currentPlayer.position];
        room.auction = {
          cellId: cell.id,
          currentBid: 0,
          currentBidderId: null,
          initiatorId: playerId,
          lastBidTime: Date.now(),
          timerDuration: room.settings.auctionTimer * 1000,
        };
        room.turnPhase = 'auction';
        addNotification(room, `${currentPlayer.name} выставил ${cell.name} на аукцион!`);
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'auction_bid': {
        const { roomId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (room.turnPhase !== 'auction' || !room.auction) return res.status(400).json({ error: 'No auction active' });
        if (playerId === room.auction.initiatorId) return res.status(403).json({ error: 'Initiator cannot bid' });

        // SEC-03 fix: Validate bid amount
        const amount = Math.floor(Number(body.amount));
        if (!Number.isFinite(amount) || amount < 1) {
          return res.status(400).json({ error: 'Invalid bid amount' });
        }

        const bidder = getPlayerById(room, playerId);
        if (!bidder || bidder.bankrupt) return res.status(400).json({ error: 'Cannot bid' });
        if (amount <= room.auction.currentBid) return res.status(400).json({ error: 'Bid too low' });
        if (amount > bidder.balance) return res.status(400).json({ error: 'Not enough money' });

        room.auction.currentBid = amount;
        room.auction.currentBidderId = playerId;
        room.auction.lastBidTime = Date.now();
        addNotification(room, `${bidder.name} ставит ${amount}$`);
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'auction_check': {
        const roomId = params.roomId;
        const room = await getRoom(roomId);
        if (!room || room.turnPhase !== 'auction' || !room.auction) {
          return res.json({ success: true, expired: false });
        }

        const expired = checkAuctionExpiry(room);
        if (expired) {
          await setRoom(roomId, room);
          return res.json({ success: true, expired: true, room });
        }

        const elapsed = Date.now() - room.auction.lastBidTime;
        return res.json({ success: true, expired: false, remaining: room.auction.timerDuration - elapsed });
      }

      case 'endturn': {
        const { roomId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const currentPlayer = getActivePlayer(room);
        if (currentPlayer.id !== playerId) return res.status(403).json({ error: 'Not your turn' });
        if (room.turnPhase !== 'endturn') return res.status(400).json({ error: 'Cannot end turn' });

        // Check if doubles -> roll again
        if (room.lastDice[0] === room.lastDice[1] && !currentPlayer.inJail && currentPlayer.doublesCount > 0) {
          room.turnPhase = 'roll';
          addNotification(room, `${currentPlayer.name} бросает снова (дубль)`);
        } else {
          nextTurn(room);
        }
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'build': {
        const { roomId, cellId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const player = getPlayerById(room, playerId);
        if (!player) return res.status(400).json({ error: 'Player not found' });

        const cell = BOARD[cellId];
        if (!cell || cell.type !== 'property') return res.status(400).json({ error: 'Not a property' });

        const prop = room.properties[cellId];
        if (!prop) return res.status(400).json({ error: 'Not owned' });

        const isOwner = prop.ownerId === playerId;
        const deal = getMonopolyDealForCell(room, cellId);
        const isInDeal = deal && deal.members.includes(playerId) && deal.members.includes(prop.ownerId);

        if (!isOwner && !isInDeal) return res.status(403).json({ error: 'Not authorized to build here' });

        if (room.settings.requireFullGroup && !hasFullGroup(room, cell.color, playerId)) {
          return res.status(400).json({ error: 'Need full color group' });
        }

        if (prop.houses >= 5) return res.status(400).json({ error: 'Max houses reached' });
        if (prop.mortgaged) return res.status(400).json({ error: 'Property is mortgaged' });

        // Check even building rule
        const group = COLOR_GROUPS[cell.color];
        const minHouses = Math.min(...group.map(cid => (room.properties[cid]?.houses || 0)));
        if (prop.houses > minHouses) return res.status(400).json({ error: 'Must build evenly' });

        if (player.balance < cell.houseCost) return res.status(400).json({ error: 'Not enough money' });

        player.balance -= cell.houseCost;
        prop.houses++;

        if (deal && deal.splitType === 'investment') {
          if (!deal.investments) deal.investments = {};
          deal.investments[playerId] = (deal.investments[playerId] || 0) + cell.houseCost;
        }

        addNotification(room, `${player.name} построил ${prop.houses === 5 ? 'отель' : 'дом'} на ${cell.name}`);
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'mortgage': {
        const { roomId, cellId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const prop = room.properties[cellId];
        if (!prop || prop.ownerId !== playerId) return res.status(403).json({ error: 'Not your property' });
        if (prop.mortgaged) return res.status(400).json({ error: 'Already mortgaged' });
        if (prop.houses > 0) return res.status(400).json({ error: 'Sell houses first' });

        // BUG-13 fix: Check if any property in the same color group has houses
        const cell = BOARD[cellId];
        if (cell.color) {
          const group = COLOR_GROUPS[cell.color];
          if (group) {
            const hasHousesInGroup = group.some(cid => {
              const p = room.properties[cid];
              return p && p.ownerId === playerId && p.houses > 0;
            });
            if (hasHousesInGroup) {
              return res.status(400).json({ error: 'Sell all houses in color group first' });
            }
          }
        }

        const mortgageValue = Math.floor(cell.price / 2);
        const player = getPlayerById(room, playerId);
        player.balance += mortgageValue;
        prop.mortgaged = true;
        addNotification(room, `${player.name} заложил ${cell.name} (+${mortgageValue}$)`);

        if (room.turnPhase === 'manage' && player.balance >= 0) {
          room.turnPhase = 'endturn';
          room.debtInfo = null;
        }

        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'unmortgage': {
        const { roomId, cellId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const prop = room.properties[cellId];
        if (!prop || prop.ownerId !== playerId) return res.status(403).json({ error: 'Not your property' });
        if (!prop.mortgaged) return res.status(400).json({ error: 'Not mortgaged' });

        const cell = BOARD[cellId];
        const cost = Math.floor(cell.price / 2 * 1.1);
        const player = getPlayerById(room, playerId);
        if (player.balance < cost) return res.status(400).json({ error: 'Not enough money' });

        player.balance -= cost;
        prop.mortgaged = false;
        addNotification(room, `${player.name} выкупил ${cell.name} из залога`);
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'sellhouse': {
        const { roomId, cellId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const prop = room.properties[cellId];
        if (!prop || prop.ownerId !== playerId) return res.status(403).json({ error: 'Not your property' });
        if (prop.houses <= 0) return res.status(400).json({ error: 'No houses to sell' });

        const cell = BOARD[cellId];
        // Check even selling
        const group = COLOR_GROUPS[cell.color];
        const maxHouses = Math.max(...group.map(cid => (room.properties[cid]?.houses || 0)));
        if (prop.houses < maxHouses) return res.status(400).json({ error: 'Must sell evenly' });

        const sellPrice = Math.floor(cell.houseCost / 2);
        const player = getPlayerById(room, playerId);
        player.balance += sellPrice;
        prop.houses--;
        addNotification(room, `${player.name} продал дом на ${cell.name} (+${sellPrice}$)`);

        if (room.turnPhase === 'manage' && player.balance >= 0) {
          room.turnPhase = 'endturn';
          room.debtInfo = null;
        }

        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'bankrupt': {
        const { roomId, method, targetPlayerId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const player = getPlayerById(room, playerId);
        if (!player) return res.status(400).json({ error: 'Player not found' });

        // BUG-06 fix: Check if player can still recover
        if (canPlayerRecoverServer(room, player)) {
          return res.status(400).json({ error: 'You can still cover the debt by selling houses or mortgaging properties' });
        }

        const ownedProps = Object.entries(room.properties).filter(([, p]) => p.ownerId === playerId);

        if (method === 'bank') {
          ownedProps.forEach(([cellId]) => {
            delete room.properties[cellId];
          });
          addNotification(room, `${player.name} банкрот! Имущество возвращено в банк.`);
        } else if (method === 'transfer' && targetPlayerId) {
          // BUG-17 fix: Target must pay residual value
          const target = getPlayerById(room, targetPlayerId);
          if (!target || target.bankrupt) return res.status(400).json({ error: 'Invalid target' });

          const residualValue = calculateResidualValue(room, playerId);
          if (target.balance < residualValue) {
            return res.status(400).json({ error: `Target cannot afford transfer cost (${residualValue}$)` });
          }

          target.balance -= residualValue;
          ownedProps.forEach(([cellId, prop]) => {
            prop.ownerId = targetPlayerId;
          });
          addNotification(room, `${player.name} банкрот! Имущество передано ${target.name} за ${residualValue}$.`);
        } else if (method === 'auction') {
          // BUG-16 fix: Create sequential auction for bankrupt's properties
          const cellIds = ownedProps.map(([cellId]) => parseInt(cellId));

          if (cellIds.length > 0) {
            player.bankrupt = true;
            player.balance = 0;

            // Remove from monopoly deals
            room.monopolyDeals = room.monopolyDeals.filter(deal => {
              deal.members = deal.members.filter(m => m !== playerId);
              return deal.members.length >= 2;
            });
            room.agreements = room.agreements.filter(a => a.ownerId !== playerId && a.guestId !== playerId);

            // Set up bankruptcy auction queue
            room.bankruptAuctionQueue = cellIds;
            addNotification(room, `${player.name} банкрот! Имущество выставляется на аукцион.`);

            // Start first auction
            startNextBankruptAuction(room);

            // Check win condition
            const active = getActivePlayers(room);
            if (active.length <= 1) {
              room.state = 'finished';
              room.winner = active[0]?.id;
              room.turnPhase = 'finished';
              room.bankruptAuctionQueue = null;
              room.auction = null;
              addNotification(room, `Игра окончена! Победитель: ${active[0]?.name}`);
            }

            room.lastUpdate = Date.now();
            await setRoom(roomId, room);
            return res.json({ success: true, room });
          } else {
            addNotification(room, `${player.name} банкрот! Нет имущества для аукциона.`);
          }
        } else {
          return res.status(400).json({ error: 'Invalid bankruptcy method' });
        }

        player.bankrupt = true;
        player.balance = 0;

        // Remove from monopoly deals
        room.monopolyDeals = room.monopolyDeals.filter(deal => {
          deal.members = deal.members.filter(m => m !== playerId);
          return deal.members.length >= 2;
        });
        room.agreements = room.agreements.filter(a => a.ownerId !== playerId && a.guestId !== playerId);

        // Check win condition
        const active = getActivePlayers(room);
        if (active.length <= 1) {
          room.state = 'finished';
          room.winner = active[0]?.id;
          room.turnPhase = 'finished';
          addNotification(room, `Игра окончена! Победитель: ${active[0]?.name}`);
        } else {
          // BUG-18 fix: If bankrupt player was current, advance turn properly
          if (getActivePlayer(room).id === playerId) {
            nextTurn(room);
          } else {
            // If it wasn't the bankrupt's turn and we're not in finished state
            // Ensure turnPhase is appropriate
            if (room.turnPhase === 'manage') {
              room.turnPhase = 'endturn';
              room.debtInfo = null;
            }
          }
        }

        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'agreement_create': {
        const { roomId, guestId, properties, allProperties } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const owner = getPlayerById(room, playerId);
        if (!owner) return res.status(400).json({ error: 'Invalid player' });

        room.agreements.push({
          id: Date.now().toString(),
          ownerId: playerId,
          guestId,
          properties: properties || [],
          allProperties: !!allProperties,
        });

        const guest = getPlayerById(room, guestId);
        addNotification(room, `${owner.name} освободил ${guest.name} от аренды`);
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'agreement_revoke': {
        const { roomId, agreementId } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const idx = room.agreements.findIndex(a => a.id === agreementId && a.ownerId === playerId);
        if (idx === -1) return res.status(404).json({ error: 'Agreement not found' });

        room.agreements.splice(idx, 1);
        addNotification(room, `Соглашение об освобождении отозвано`);
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'monopoly_create': {
        const { roomId, color, members, splitType } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const group = COLOR_GROUPS[color];
        if (!group) return res.status(400).json({ error: 'Invalid color' });

        const allMembers = members || [playerId];
        const ownedByMembers = group.filter(cid => {
          const p = room.properties[cid];
          return p && allMembers.includes(p.ownerId);
        });

        if (ownedByMembers.length !== group.length) {
          return res.status(400).json({ error: 'Members must collectively own all properties in the group' });
        }

        const investments = {};
        allMembers.forEach(mid => {
          const owned = group.filter(cid => room.properties[cid]?.ownerId === mid);
          let inv = 0;
          owned.forEach(cid => {
            inv += BOARD[cid].price;
            inv += (room.properties[cid]?.houses || 0) * BOARD[cid].houseCost;
          });
          investments[mid] = inv;
        });

        const existingIdx = room.monopolyDeals.findIndex(d => d.color === color);
        if (existingIdx >= 0) {
          room.monopolyDeals.splice(existingIdx, 1);
        }

        room.monopolyDeals.push({
          id: Date.now().toString(),
          color,
          members: allMembers,
          splitType: splitType || 'equal',
          investments,
        });

        const memberNames = allMembers.map(id => getPlayerById(room, id)?.name).join(', ');
        addNotification(room, `Договор о монополии (${color}): ${memberNames}`);
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'monopoly_exit': {
        const { roomId, dealId, buyerId, price } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const deal = room.monopolyDeals.find(d => d.id === dealId);
        if (!deal) return res.status(404).json({ error: 'Deal not found' });
        if (!deal.members.includes(playerId)) return res.status(403).json({ error: 'Not a member' });

        const buyer = getPlayerById(room, buyerId);
        const seller = getPlayerById(room, playerId);
        if (!buyer || buyer.balance < price) return res.status(400).json({ error: 'Buyer cannot afford' });

        const group = COLOR_GROUPS[deal.color];
        group.forEach(cid => {
          const prop = room.properties[cid];
          if (prop && prop.ownerId === playerId) {
            prop.ownerId = buyerId;
          }
        });

        buyer.balance -= price;
        seller.balance += price;

        deal.members = deal.members.filter(m => m !== playerId);
        if (deal.members.length < 2) {
          room.monopolyDeals = room.monopolyDeals.filter(d => d.id !== dealId);
        }

        addNotification(room, `${seller.name} вышел из договора (${deal.color}). ${buyer.name} выкупил долю за ${price}$`);
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'trade_propose': {
        const { roomId, targetId, offerProperties, requestProperties, offerMoney, requestMoney } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        room.trades.push({
          id: Date.now().toString(),
          fromId: playerId,
          toId: targetId,
          offerProperties: offerProperties || [],
          requestProperties: requestProperties || [],
          offerMoney: offerMoney || 0,
          requestMoney: requestMoney || 0,
          status: 'pending',
        });

        const from = getPlayerById(room, playerId);
        const to = getPlayerById(room, targetId);
        addNotification(room, `${from.name} предложил сделку ${to.name}`);
        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'trade_respond': {
        const { roomId, tradeId, accept } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const trade = room.trades.find(t => t.id === tradeId && t.toId === playerId && t.status === 'pending');
        if (!trade) return res.status(404).json({ error: 'Trade not found' });

        if (accept) {
          const from = getPlayerById(room, trade.fromId);
          const to = getPlayerById(room, trade.toId);

          trade.offerProperties.forEach(cellId => {
            const prop = room.properties[cellId];
            if (prop && prop.ownerId === trade.fromId) prop.ownerId = trade.toId;
          });
          trade.requestProperties.forEach(cellId => {
            const prop = room.properties[cellId];
            if (prop && prop.ownerId === trade.toId) prop.ownerId = trade.fromId;
          });

          from.balance -= (trade.offerMoney || 0);
          from.balance += (trade.requestMoney || 0);
          to.balance += (trade.offerMoney || 0);
          to.balance -= (trade.requestMoney || 0);

          trade.status = 'accepted';
          addNotification(room, `Сделка принята: ${from.name} ↔ ${to.name}`);
        } else {
          trade.status = 'rejected';
          addNotification(room, `Сделка отклонена`);
        }

        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      case 'settings_update': {
        const { roomId, settings } = body;
        const room = await getRoom(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (room.hostId !== playerId) return res.status(403).json({ error: 'Only host' });
        if (room.state !== 'lobby') return res.status(400).json({ error: 'Game already started' });

        if (settings.startingMoney) room.settings.startingMoney = settings.startingMoney;
        if (settings.auctionTimer) room.settings.auctionTimer = settings.auctionTimer;
        if (settings.requireFullGroup !== undefined) room.settings.requireFullGroup = settings.requireFullGroup;

        room.players.forEach(p => { p.balance = room.settings.startingMoney; });

        room.lastUpdate = Date.now();
        await setRoom(roomId, room);
        return res.json({ success: true, room });
      }

      default:
        return res.status(404).json({ error: 'Unknown endpoint' });
    }
  } catch (err) {
    console.error('Game API error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};
