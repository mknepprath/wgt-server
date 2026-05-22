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

function getTeamAllies(color, map) {
  if (!map.teams) return [];
  const team = map.teams.find(t => t.includes(color));
  return team ? team.filter(c => c !== color) : [];
}

function getPawnConfig(color, map) {
  if (map.playerSlots) {
    const slot = map.playerSlots.find(s => s.color === color);
    if (slot) return { dir: slot.dir, startR: slot.pawnStartR, promoteR: slot.promoteR };
  }
  if (color === 'white') return { dir: 1, startR: map.whitePawnStartR, promoteR: map.whitePromoteR };
  return { dir: -1, startR: map.blackPawnStartR, promoteR: map.blackPromoteR };
}

function initialBoard(map) {
  const board = {};
  if (map.playerSlots) {
    for (const slot of map.playerSlots) {
      for (let i = 0; i < slot.homeFiles.length; i++) {
        const f = slot.homeFiles[i];
        board[toPos(f, slot.backR)] = { type: slot.backRank[i], color: slot.color };
        board[toPos(f, slot.pawnR)] = { type: 'pawn', color: slot.color };
      }
    }
  } else {
    for (let f = 0; f < map.files; f++) {
      board[toPos(f, map.whiteBackR)] = { type: map.whiteBackRank[f], color: 'white' };
      board[toPos(f, map.whitePawnR)] = { type: 'pawn', color: 'white' };
      board[toPos(f, map.blackPawnR)] = { type: 'pawn', color: 'black' };
      board[toPos(f, map.blackBackR)] = { type: map.blackBackRank[f], color: 'black' };
    }
  }
  return board;
}

function getLegalMoves(board, from, color, map, allies = []) {
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
      if (dp) { if (dp.color !== color && !allies.includes(dp.color)) moves.push(dest); break; }
      moves.push(dest);
      tf += df; tr += dr;
    }
  };

  const step = (df, dr) => {
    const tf = f + df, tr = r + dr;
    if (!canLand(tf, tr)) return;
    const dest = toPos(tf, tr);
    if (!board[dest] || (board[dest].color !== color && !allies.includes(board[dest].color))) moves.push(dest);
  };

  switch (piece.type) {
    case 'pawn': {
      const { dir, startR } = getPawnConfig(color, map);
      if (canLand(f, r + dir) && !board[toPos(f, r + dir)]) {
        moves.push(toPos(f, r + dir));
        if (r === startR && canLand(f, r + dir * 2) && !board[toPos(f, r + dir * 2)]) {
          moves.push(toPos(f, r + dir * 2));
        }
      }
      for (const df of [-1, 1]) {
        if (canLand(f + df, r + dir)) {
          const cap = toPos(f + df, r + dir);
          if (board[cap] && board[cap].color !== color && !allies.includes(board[cap].color)) moves.push(cap);
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

function isInCheck(board, color, map, allies = []) {
  if (!map) map = MAPS.standard;
  let kingPos = null;
  for (const [pos, piece] of Object.entries(board)) {
    if (piece.type === 'king' && piece.color === color) { kingPos = pos; break; }
  }
  if (!kingPos) return false;
  for (const pos of Object.keys(board)) {
    const p = board[pos];
    if (p.color === color || allies.includes(p.color)) continue;
    const pAllies = getTeamAllies(p.color, map);
    if (getLegalMoves(board, pos, p.color, map, pAllies).includes(kingPos)) return true;
  }
  return false;
}

function countAttackers(board, square, attackerColor, map, allies = []) {
  if (!map) map = MAPS.standard;
  const allColors = [attackerColor, ...allies];
  let count = 0;
  for (const from of Object.keys(board)) {
    if (!allColors.includes(board[from].color)) continue;
    const fromAllies = getTeamAllies(board[from].color, map);
    if (getLegalMoves(board, from, board[from].color, map, fromAllies).includes(square)) count++;
  }
  return count;
}

function updateInCheck(game, map) {
  const activeColors = [...new Set(Object.values(game.board).map(p => p.color))];
  game.inCheck = {};
  for (const c of activeColors) {
    const allies = getTeamAllies(c, map);
    game.inCheck[c] = isInCheck(game.board, c, map, allies);
  }
}

function eliminateColor(game, color) {
  for (const pos of Object.keys(game.board)) {
    if (game.board[pos] && game.board[pos].color === color) {
      delete game.board[pos];
      delete game.cooldowns[pos];
    }
  }
}

function checkWin(game, actingPlayerId, actingPlayerName) {
  const map = getMap(game.mapId);
  const survivingColors = new Set(Object.values(game.board).map(p => p.color));

  if (map.teams) {
    const survivingTeams = map.teams.filter(team => team.some(c => survivingColors.has(c)));
    if (survivingTeams.length <= 1) {
      game.gameEnded = true;
      game.winnerTeam = survivingTeams[0] || null;
      game.winner = actingPlayerId;
      game.winnerName = actingPlayerName;
      game.status = 'ended';
      return true;
    }
    return false;
  }

  const surviving = game.players.filter(p => survivingColors.has(p.color));
  if (surviving.length <= 1) {
    const winner = surviving[0] || { id: actingPlayerId, name: actingPlayerName };
    game.gameEnded = true;
    game.winner = winner.id;
    game.winnerName = winner.name;
    game.status = 'ended';
    return true;
  }
  return false;
}

// --- Bot logic ---

function pieceValue(type) {
  const v = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };
  return v[type] || 0;
}

function getBotMove(board, color, cooldowns, now, map) {
  if (!map) map = MAPS.standard;
  const allies = getTeamAllies(color, map);
  const captures = [], regular = [];
  for (const from of Object.keys(board)) {
    if (board[from].color !== color) continue;
    if (cooldowns && cooldowns[from] && cooldowns[from] > now) continue;
    const moves = getLegalMoves(board, from, color, map, allies);
    for (const to of moves) {
      const target = board[to];
      if (target && target.color !== color) {
        if (target.type === 'king') {
          if (countAttackers(board, to, color, map, allies) >= 2) {
            captures.push({ from, to, value: pieceValue('king') });
          }
        } else {
          const oppPieceCount = Object.values(board).filter(p => p.color === target.color).length;
          captures.push({ from, to, value: oppPieceCount === 2 ? 50 : pieceValue(target.type) });
        }
      } else if (!target) {
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

function applyBotMove(game, move, color) {
  const map = getMap(game.mapId);
  const { from, to } = move;
  const piece = game.board[from];
  if (!piece) return false;
  const now = Date.now();
  const captured = game.board[to];
  const allies = getTeamAllies(color, map);
  if (captured && captured.type === 'king' && countAttackers(game.board, to, color, map, allies) < 2) {
    return false;
  }
  const kingCaptured = captured && captured.type === 'king';
  game.board[to] = { ...piece };
  delete game.board[from];
  delete game.cooldowns[from];
  game.cooldowns[to] = now + COOLDOWN_MS;
  if (piece.type === 'pawn') {
    const { r } = fromPos(to);
    const { promoteR } = getPawnConfig(piece.color, map);
    if (r === promoteR) game.board[to].type = 'queen';
  }
  game.lastActivity = now;
  let playerEliminated = false;
  if (kingCaptured) {
    eliminateColor(game, captured.color);
    playerEliminated = true;
  } else if (captured) {
    const remaining = Object.values(game.board).filter(p => p.color === captured.color);
    if (remaining.length === 1 && remaining[0].type === 'king') {
      eliminateColor(game, captured.color);
      playerEliminated = true;
    }
  }
  updateInCheck(game, map);
  if (playerEliminated) {
    const actingBot = game.players.find(p => p.color === color && p.isBot);
    checkWin(game, actingBot?.id || BOT_ID, actingBot?.name || BOT_NAME);
    if (game.gameEnded) game.botLoopActive = false;
  }
  return true;
}

function startBotRealtimeLoop(game, emit) {
  game.botLoopActive = true;
  const gen = game.botGen;
  const map = getMap(game.mapId);
  const botColors = game.botColors || ['black'];

  // Each bot color gets its own independent loop
  for (const botColor of botColors) {
    (function loop(color) {
      function tick() {
        if (!game.botLoopActive || game.botGen !== gen || game.gameEnded) return;
        const alive = Object.values(game.board).some(p => p.color === color);
        if (!alive) return; // eliminated — stop this bot's loop
        setTimeout(() => {
          if (!game.botLoopActive || game.botGen !== gen || game.gameEnded) return;
          if (Object.values(game.board).some(p => p.color === color)) {
            const move = getBotMove(game.board, color, game.cooldowns, Date.now(), map);
            if (move) applyBotMove(game, move, color);
          }
          emit(game);
          tick();
        }, 1500 + Math.random() * 1000);
      }
      tick();
    })(botColor);
  }
}

function scheduleBotTurn(game, emit) {
  if (!game.singlePlayer || game.gameEnded || game.botScheduled) return;
  if (game.botPhase === 'realtime') {
    if (!game.botLoopActive) startBotRealtimeLoop(game, emit);
    return;
  }

  const map = getMap(game.mapId);
  const botColor = (game.botColors && game.botColors[0]) || 'black';
  game.botScheduled = true;
  const gen = game.botGen;
  const isRevealMove = game.playerMoveCount === 1;

  setTimeout(() => {
    game.botScheduled = false;
    if (game.botGen !== gen || game.gameEnded) return;
    const move1 = getBotMove(game.board, botColor, game.cooldowns, Date.now(), map);
    if (!move1) {
      if (isRevealMove) { game.botPhase = 'realtime'; startBotRealtimeLoop(game, emit); }
      return;
    }
    applyBotMove(game, move1, botColor);
    emit(game);
    if (game.gameEnded) return;
    if (isRevealMove) {
      const gen2 = game.botGen;
      setTimeout(() => {
        if (game.botGen !== gen2 || game.gameEnded) return;
        const move2 = getBotMove(game.board, botColor, game.cooldowns, Date.now(), map);
        if (move2) applyBotMove(game, move2, botColor);
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
  const map = getMap(mapId);
  const firstColor = map.playerSlots ? map.playerSlots[0].color : 'white';
  const gameCode = generateGameCode();
  const game = {
    id: gameCode,
    mapId: mapId || 'standard',
    players: [{ id: playerId, name: playerName.trim(), color: firstColor, connected: true, lastSeen: Date.now() }],
    board: {},
    cooldowns: {},
    inCheck: {},
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
  const map = getMap(game.mapId);
  const maxPlayers = map.maxPlayers || 2;
  if (game.players.length >= maxPlayers) throw new Error('Game is full');
  if (game.players.some(p => p.name.toLowerCase() === playerName.trim().toLowerCase()))
    throw new Error('Name already taken');
  const colors = map.playerSlots ? map.playerSlots.map(s => s.color) : ['white', 'black'];
  const usedColors = new Set(game.players.map(p => p.color));
  const nextColor = colors.find(c => !usedColors.has(c));
  if (!nextColor) throw new Error('Game is full');
  game.players.push({ id: playerId, name: playerName.trim(), color: nextColor, connected: true, lastSeen: Date.now() });
  game.lastActivity = Date.now();
  return { game };
}

function startGame(game, playerId) {
  if (!game.players.some(p => p.id === playerId)) throw new Error('Not in this game');
  const map = getMap(game.mapId);
  const maxPlayers = map.maxPlayers || 2;
  if (game.players.length < maxPlayers) throw new Error(`Need ${maxPlayers} players to start`);
  if (game.gameStarted) throw new Error('Game already started');
  game.board = initialBoard(map);
  game.cooldowns = {};
  game.inCheck = {};
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
  const map = getMap(mapId);
  const allColors = map.playerSlots ? map.playerSlots.map(s => s.color) : ['white', 'black'];
  const humanColor = allColors[0];
  const botColors = allColors.slice(1);

  const botPlayers = botColors.map((color, i) => ({
    id: `${BOT_ID}_${color}`,
    name: botColors.length === 1 ? BOT_NAME : `Bot ${i + 1}`,
    color,
    connected: true,
    isBot: true,
    lastSeen: Date.now(),
  }));

  const gameCode = generateGameCode();
  const game = {
    id: gameCode,
    mapId: mapId || 'standard',
    singlePlayer: true,
    players: [
      { id: playerId, name: playerName.trim(), color: humanColor, connected: true, lastSeen: Date.now() },
      ...botPlayers,
    ],
    board: initialBoard(map),
    cooldowns: {},
    inCheck: {},
    gameStarted: true,
    gameEnded: false,
    winner: null,
    winnerName: null,
    status: 'playing',
    botColors,
    // Multi-player bots go straight to realtime; 2-player uses the reveal phase
    botPhase: botColors.length > 1 ? 'realtime' : 'turnBased',
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
  const allies = getTeamAllies(player.color, map);
  const legal = getLegalMoves(game.board, from, player.color, map, allies);
  if (!legal.includes(to)) throw new Error('Illegal move');
  const captured = game.board[to];
  if (captured && captured.type === 'king' && countAttackers(game.board, to, player.color, map, allies) < 2) {
    throw new Error('King can only be captured under double check');
  }
  const kingCaptured = captured && captured.type === 'king';
  game.board[to] = { ...piece };
  delete game.board[from];
  delete game.cooldowns[from];
  game.cooldowns[to] = now + COOLDOWN_MS;
  if (piece.type === 'pawn') {
    const { r } = fromPos(to);
    const { promoteR } = getPawnConfig(player.color, map);
    if (r === promoteR) game.board[to].type = 'queen';
  }
  game.lastActivity = now;
  let playerEliminated = false;
  if (kingCaptured) {
    eliminateColor(game, captured.color);
    playerEliminated = true;
  } else if (captured) {
    const remaining = Object.values(game.board).filter(p => p.color === captured.color);
    if (remaining.length === 1 && remaining[0].type === 'king') {
      eliminateColor(game, captured.color);
      playerEliminated = true;
    }
  }
  updateInCheck(game, map);
  if (playerEliminated) checkWin(game, playerId, player.name);
  return { game };
}

function playAgain(game, playerId) {
  if (!game.players.some(p => p.id === playerId)) throw new Error('Not in this game');
  if (!game.gameEnded) throw new Error('Game is not over');
  const map = getMap(game.mapId);
  if ((map.maxPlayers || 2) > 2) throw new Error('Play again is not available for multi-player maps');
  game.players.forEach(p => { p.color = p.color === 'white' ? 'black' : 'white'; });
  game.board = initialBoard(map);
  game.cooldowns = {};
  game.inCheck = {};
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
  game.inCheck = {};
  game.gameStarted = true;
  game.gameEnded = false;
  game.winner = null;
  game.winnerName = null;
  game.winnerTeam = null;
  game.status = 'playing';
  game.botPhase = (game.botColors || []).length > 1 ? 'realtime' : 'turnBased';
  game.botScheduled = false;
  game.playerMoveCount = 0;
  game.lastActivity = Date.now();
  return { game };
}

function startGameWithBots(game, playerId) {
  if (!game.players.some(p => p.id === playerId)) throw new Error('Not in this game');
  if (game.gameStarted) throw new Error('Game already started');
  const map = getMap(game.mapId);
  const allColors = map.playerSlots ? map.playerSlots.map(s => s.color) : ['white', 'black'];
  const existingColors = new Set(game.players.map(p => p.color));
  const missingColors = allColors.filter(c => !existingColors.has(c));
  if (!missingColors.length) throw new Error('Game is already full');
  const botPlayers = missingColors.map((color, i) => ({
    id: `${BOT_ID}_${color}`,
    name: `Bot ${i + 1}`,
    color,
    connected: true,
    isBot: true,
    lastSeen: Date.now(),
  }));
  game.players.push(...botPlayers);
  game.singlePlayer = true;
  game.botColors = missingColors;
  game.botPhase = 'realtime';
  game.botLoopActive = false;
  game.botScheduled = false;
  game.botGen = game.botGen || 0;
  game.playerMoveCount = 0;
  game.board = initialBoard(map);
  game.cooldowns = {};
  game.inCheck = {};
  game.gameStarted = true;
  game.gameEnded = false;
  game.winner = null;
  game.winnerName = null;
  game.winnerTeam = null;
  game.status = 'playing';
  game.lastActivity = Date.now();
  return { game };
}

module.exports = {
  createGame, joinGame, startGame, moveChessPiece, playAgain, getLegalMoves,
  createSinglePlayerGame, playAgainSinglePlayer, scheduleBotTurn, startBotRealtimeLoop, stopBot,
  startGameWithBots,
};
