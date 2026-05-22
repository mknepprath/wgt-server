const { MAPS } = require('./chess-maps.js');
const COOLDOWN_MS = 1500;
const BOT_ID = 'bot';
const BOT_NAME = 'Opponent';

function generateGameCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function fileIndex(file) { return file.charCodeAt(0) - 97; }
function toPos(f, r) { return `${String.fromCharCode(97 + f)}${r + 1}`; }
function fromPos(pos) { return { f: fileIndex(pos[0]), r: parseInt(pos.slice(1)) - 1 }; }

function getMap(mapId) { return MAPS[mapId] || MAPS.standard; }

function initialBoard(map) {
  const board = {};
  for (let f = 0; f < map.files; f++) {
    board[toPos(f, map.whiteBackR)] = { type: map.whiteBackRank[f], color: 'white' };
    board[toPos(f, map.whitePawnR)] = { type: 'pawn', color: 'white' };
    board[toPos(f, map.blackPawnR)] = { type: 'pawn', color: 'black' };
    board[toPos(f, map.blackBackR)] = { type: map.blackBackRank[f], color: 'black' };
  }
  return board;
}

function getLegalMoves(board, from, color, map) {
  if (!map) map = MAPS.standard;
  const piece = board[from];
  if (!piece || piece.color !== color) return [];

  const { f, r } = fromPos(from);
  const moves = [];

  const canLand = (tf, tr) => {
    if (tf < 0 || tf >= map.files || tr < 0 || tr >= map.ranks) return false;
    if (map.active && !map.active.has(toPos(tf, tr))) return false;
    return true;
  };

  const slide = (df, dr) => {
    let tf = f + df, tr = r + dr;
    while (canLand(tf, tr)) {
      const dest = toPos(tf, tr);
      const dp = board[dest];
      if (dp) { if (dp.color !== color) moves.push(dest); break; }
      moves.push(dest);
      tf += df; tr += dr;
    }
  };

  const step = (df, dr) => {
    const tf = f + df, tr = r + dr;
    if (!canLand(tf, tr)) return;
    const dest = toPos(tf, tr);
    if (!board[dest] || board[dest].color !== color) moves.push(dest);
  };

  switch (piece.type) {
    case 'pawn': {
      const dir = color === 'white' ? 1 : -1;
      const startR = color === 'white' ? map.whitePawnStartR : map.blackPawnStartR;
      if (canLand(f, r + dir) && !board[toPos(f, r + dir)]) {
        moves.push(toPos(f, r + dir));
        if (r === startR && canLand(f, r + dir * 2) && !board[toPos(f, r + dir * 2)]) {
          moves.push(toPos(f, r + dir * 2));
        }
      }
      for (const df of [-1, 1]) {
        if (canLand(f + df, r + dir)) {
          const cap = toPos(f + df, r + dir);
          if (board[cap] && board[cap].color !== color) moves.push(cap);
        }
      }
      break;
    }
    case 'knight':
      for (const [df, dr] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
        step(df, dr);
      break;
    case 'bishop':
      for (const [df, dr] of [[-1,-1],[-1,1],[1,-1],[1,1]]) slide(df, dr);
      break;
    case 'rook':
      for (const [df, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) slide(df, dr);
      break;
    case 'queen':
      for (const [df, dr] of [[0,1],[0,-1],[1,0],[-1,0],[-1,-1],[-1,1],[1,-1],[1,1]])
        slide(df, dr);
      break;
    case 'king':
      for (const [df, dr] of [[0,1],[0,-1],[1,0],[-1,0],[-1,-1],[-1,1],[1,-1],[1,1]])
        step(df, dr);
      break;
  }

  return moves;
}

function isInCheck(board, color, map) {
  if (!map) map = MAPS.standard;
  let kingPos = null;
  for (const [pos, piece] of Object.entries(board)) {
    if (piece.type === 'king' && piece.color === color) { kingPos = pos; break; }
  }
  if (!kingPos) return false;
  const opp = color === 'white' ? 'black' : 'white';
  for (const pos of Object.keys(board)) {
    if (board[pos].color === opp && getLegalMoves(board, pos, opp, map).includes(kingPos)) return true;
  }
  return false;
}

function countAttackers(board, square, attackerColor, map) {
  if (!map) map = MAPS.standard;
  let count = 0;
  for (const from of Object.keys(board)) {
    if (board[from].color !== attackerColor) continue;
    if (getLegalMoves(board, from, attackerColor, map).includes(square)) count++;
  }
  return count;
}

// --- Bot logic ---

function pieceValue(type) {
  const v = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };
  return v[type] || 0;
}

function getBotMove(board, color, cooldowns, now, map) {
  if (!map) map = MAPS.standard;
  const opp = color === 'white' ? 'black' : 'white';
  const captures = [], regular = [];
  for (const from of Object.keys(board)) {
    if (board[from].color !== color) continue;
    if (cooldowns && cooldowns[from] && cooldowns[from] > now) continue;
    const moves = getLegalMoves(board, from, color, map);
    for (const to of moves) {
      if (board[to] && board[to].color === opp) {
        if (board[to].type === 'king') {
          if (countAttackers(board, to, color, map) >= 2) {
            captures.push({ from, to, value: pieceValue('king') });
          }
        } else {
          const oppPieceCount = Object.values(board).filter(p => p.color === opp).length;
          const value = oppPieceCount === 2 ? 50 : pieceValue(board[to].type);
          captures.push({ from, to, value });
        }
      } else {
        regular.push({ from, to });
      }
    }
  }
  if (captures.length > 0) {
    captures.sort((a, b) => b.value - a.value);
    return captures[0];
  }
  if (!regular.length) return null;
  return regular[Math.floor(Math.random() * regular.length)];
}

function applyBotMove(game, move) {
  const map = getMap(game.mapId);
  const { from, to } = move;
  const piece = game.board[from];
  if (!piece) return false;
  const now = Date.now();
  const captured = game.board[to];
  if (captured && captured.type === 'king' && countAttackers(game.board, to, 'black', map) < 2) {
    return false;
  }
  const kingCaptured = captured && captured.type === 'king';
  game.board[to] = { ...piece };
  delete game.board[from];
  delete game.cooldowns[from];
  game.cooldowns[to] = now + COOLDOWN_MS;
  if (piece.type === 'pawn') {
    const { r } = fromPos(to);
    const promR = piece.color === 'white' ? map.whitePromoteR : map.blackPromoteR;
    if (r === promR) game.board[to].type = 'queen';
  }
  game.inCheck = { white: isInCheck(game.board, 'white', map), black: isInCheck(game.board, 'black', map) };
  game.lastActivity = now;
  if (kingCaptured) {
    game.gameEnded = true;
    game.winner = BOT_ID;
    game.winnerName = BOT_NAME;
    game.status = 'ended';
    game.botLoopActive = false;
  } else if (captured) {
    const remaining = Object.values(game.board).filter(p => p.color === captured.color);
    if (remaining.length === 1 && remaining[0].type === 'king') {
      game.gameEnded = true;
      game.winner = BOT_ID;
      game.winnerName = BOT_NAME;
      game.status = 'ended';
      game.botLoopActive = false;
    }
  }
  return true;
}

function startBotRealtimeLoop(game, emit) {
  game.botLoopActive = true;
  const gen = game.botGen;
  const map = getMap(game.mapId);
  function tick() {
    if (!game.botLoopActive || game.botGen !== gen || game.gameEnded) return;
    const delay = 2000 + Math.random() * 1000;
    setTimeout(() => {
      if (!game.botLoopActive || game.botGen !== gen || game.gameEnded) return;
      const move = getBotMove(game.board, 'black', game.cooldowns, Date.now(), map);
      if (move) applyBotMove(game, move);
      emit(game);
      tick();
    }, delay);
  }
  tick();
}

function scheduleBotTurn(game, emit) {
  if (!game.singlePlayer || game.gameEnded || game.botScheduled) return;
  if (game.botPhase === 'realtime') return;

  const map = getMap(game.mapId);
  game.botScheduled = true;
  const gen = game.botGen;
  const isRevealMove = game.playerMoveCount === 1;

  setTimeout(() => {
    game.botScheduled = false;
    if (game.botGen !== gen || game.gameEnded) return;

    const move1 = getBotMove(game.board, 'black', game.cooldowns, Date.now(), map);
    if (!move1) {
      if (isRevealMove) { game.botPhase = 'realtime'; startBotRealtimeLoop(game, emit); }
      return;
    }
    applyBotMove(game, move1);
    emit(game);
    if (game.gameEnded) return;

    if (isRevealMove) {
      const gen2 = game.botGen;
      setTimeout(() => {
        if (game.botGen !== gen2 || game.gameEnded) return;
        const move2 = getBotMove(game.board, 'black', game.cooldowns, Date.now(), map);
        if (move2) applyBotMove(game, move2);
        game.botPhase = 'realtime';
        emit(game);
        if (!game.gameEnded) startBotRealtimeLoop(game, emit);
      }, 400 + Math.random() * 400);
    }
  }, 700 + Math.random() * 400);
}

function stopBot(game) {
  game.botLoopActive = false;
  game.botGen = (game.botGen || 0) + 1;
  game.botScheduled = false;
}

// --- Game lifecycle ---

function createGame(playerName, playerId, mapId) {
  if (!playerName || !playerName.trim()) throw new Error('Player name required');
  const gameCode = generateGameCode();
  const game = {
    id: gameCode,
    mapId: mapId || 'standard',
    players: [{ id: playerId, name: playerName.trim(), color: 'white', connected: true, lastSeen: Date.now() }],
    board: {},
    cooldowns: {},
    inCheck: { white: false, black: false },
    gameStarted: false,
    gameEnded: false,
    winner: null,
    winnerName: null,
    status: 'waiting',
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  return { gameCode, game };
}

function joinGame(game, playerName, playerId) {
  if (!playerName || !playerName.trim()) throw new Error('Player name required');
  if (game.gameStarted) throw new Error('Game already started');
  if (game.players.length >= 2) throw new Error('Game is full');
  if (game.players.some(p => p.name.toLowerCase() === playerName.trim().toLowerCase()))
    throw new Error('Name already taken');
  game.players.push({ id: playerId, name: playerName.trim(), color: 'black', connected: true, lastSeen: Date.now() });
  game.lastActivity = Date.now();
  return { game };
}

function startGame(game, playerId) {
  if (!game.players.some(p => p.id === playerId)) throw new Error('Not in this game');
  if (game.players.length < 2) throw new Error('Need 2 players to start');
  if (game.gameStarted) throw new Error('Game already started');
  const map = getMap(game.mapId);
  game.board = initialBoard(map);
  game.cooldowns = {};
  game.inCheck = { white: false, black: false };
  game.gameStarted = true;
  game.gameEnded = false;
  game.winner = null;
  game.winnerName = null;
  game.status = 'playing';
  game.lastActivity = Date.now();
  return { game };
}

function createSinglePlayerGame(playerName, playerId, mapId) {
  if (!playerName || !playerName.trim()) throw new Error('Player name required');
  const gameCode = generateGameCode();
  const map = getMap(mapId);
  const game = {
    id: gameCode,
    mapId: mapId || 'standard',
    singlePlayer: true,
    players: [
      { id: playerId, name: playerName.trim(), color: 'white', connected: true, lastSeen: Date.now() },
      { id: BOT_ID, name: BOT_NAME, color: 'black', connected: true, isBot: true, lastSeen: Date.now() },
    ],
    board: initialBoard(map),
    cooldowns: {},
    inCheck: { white: false, black: false },
    gameStarted: true,
    gameEnded: false,
    winner: null,
    winnerName: null,
    status: 'playing',
    botPhase: 'turnBased',
    botLoopActive: false,
    botScheduled: false,
    botGen: 0,
    playerMoveCount: 0,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  return { gameCode, game };
}

function moveChessPiece(game, playerId, from, to) {
  if (!game.gameStarted || game.gameEnded) throw new Error('Game not in progress');
  const player = game.players.find(p => p.id === playerId);
  if (!player) throw new Error('Not in this game');
  const map = getMap(game.mapId);
  const piece = game.board[from];
  if (!piece) throw new Error('No piece at source');
  if (piece.color !== player.color) throw new Error('Not your piece');
  const now = Date.now();
  if (game.cooldowns[from] && game.cooldowns[from] > now) throw new Error('Piece is on cooldown');
  const legal = getLegalMoves(game.board, from, player.color, map);
  if (!legal.includes(to)) throw new Error('Illegal move');
  const captured = game.board[to];
  if (captured && captured.type === 'king' && countAttackers(game.board, to, player.color, map) < 2) {
    throw new Error('King can only be captured under double check');
  }
  const kingCaptured = captured && captured.type === 'king';
  game.board[to] = { ...piece };
  delete game.board[from];
  delete game.cooldowns[from];
  game.cooldowns[to] = now + COOLDOWN_MS;
  if (piece.type === 'pawn') {
    const { r } = fromPos(to);
    const promR = player.color === 'white' ? map.whitePromoteR : map.blackPromoteR;
    if (r === promR) game.board[to].type = 'queen';
  }
  game.inCheck = {
    white: isInCheck(game.board, 'white', map),
    black: isInCheck(game.board, 'black', map),
  };
  game.lastActivity = now;
  if (kingCaptured) {
    game.gameEnded = true;
    game.winner = playerId;
    game.winnerName = player.name;
    game.status = 'ended';
  } else if (captured) {
    const remaining = Object.values(game.board).filter(p => p.color === captured.color);
    if (remaining.length === 1 && remaining[0].type === 'king') {
      game.gameEnded = true;
      game.winner = playerId;
      game.winnerName = player.name;
      game.status = 'ended';
    }
  }
  return { game };
}

function playAgain(game, playerId) {
  if (!game.players.some(p => p.id === playerId)) throw new Error('Not in this game');
  if (!game.gameEnded) throw new Error('Game is not over');
  const map = getMap(game.mapId);
  game.players.forEach(p => { p.color = p.color === 'white' ? 'black' : 'white'; });
  game.board = initialBoard(map);
  game.cooldowns = {};
  game.inCheck = { white: false, black: false };
  game.gameStarted = true;
  game.gameEnded = false;
  game.winner = null;
  game.winnerName = null;
  game.status = 'playing';
  game.lastActivity = Date.now();
  return { game };
}

function playAgainSinglePlayer(game, playerId) {
  if (!game.players.some(p => p.id === playerId && !p.isBot)) throw new Error('Not in this game');
  if (!game.gameEnded) throw new Error('Game is not over');
  const map = getMap(game.mapId);
  stopBot(game);
  game.board = initialBoard(map);
  game.cooldowns = {};
  game.inCheck = { white: false, black: false };
  game.gameStarted = true;
  game.gameEnded = false;
  game.winner = null;
  game.winnerName = null;
  game.status = 'playing';
  game.botPhase = 'realtime';
  game.botScheduled = false;
  game.playerMoveCount = 0;
  game.lastActivity = Date.now();
  return { game };
}

module.exports = {
  createGame, joinGame, startGame, moveChessPiece, playAgain, getLegalMoves,
  createSinglePlayerGame, playAgainSinglePlayer, scheduleBotTurn, startBotRealtimeLoop, stopBot,
};
