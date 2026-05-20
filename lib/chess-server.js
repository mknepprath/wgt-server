const COOLDOWN_MS = 1500;
const BOT_ID = 'bot';
const BOT_NAME = 'Opponent';

function generateGameCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function fileIndex(file) { return file.charCodeAt(0) - 97; }
function toPos(f, r) { return `${String.fromCharCode(97 + f)}${r + 1}`; }
function fromPos(pos) { return { f: fileIndex(pos[0]), r: parseInt(pos[1]) - 1 }; }

function initialBoard() {
  const board = {};
  const backRank = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  for (let f = 0; f < 8; f++) {
    board[toPos(f, 0)] = { type: backRank[f], color: 'white' };
    board[toPos(f, 1)] = { type: 'pawn', color: 'white' };
    board[toPos(f, 6)] = { type: 'pawn', color: 'black' };
    board[toPos(f, 7)] = { type: backRank[f], color: 'black' };
  }
  return board;
}

function getLegalMoves(board, from, color) {
  const piece = board[from];
  if (!piece || piece.color !== color) return [];

  const { f, r } = fromPos(from);
  const moves = [];

  const slide = (df, dr) => {
    let tf = f + df, tr = r + dr;
    while (tf >= 0 && tf <= 7 && tr >= 0 && tr <= 7) {
      const dest = toPos(tf, tr);
      const dp = board[dest];
      if (dp) {
        if (dp.color !== color) moves.push(dest);
        break;
      }
      moves.push(dest);
      tf += df; tr += dr;
    }
  };

  const step = (df, dr) => {
    const tf = f + df, tr = r + dr;
    if (tf < 0 || tf > 7 || tr < 0 || tr > 7) return;
    const dest = toPos(tf, tr);
    if (!board[dest] || board[dest].color !== color) moves.push(dest);
  };

  switch (piece.type) {
    case 'pawn': {
      const dir = color === 'white' ? 1 : -1;
      const startR = color === 'white' ? 1 : 6;
      const fwd = toPos(f, r + dir);
      if (r + dir >= 0 && r + dir <= 7 && !board[fwd]) {
        moves.push(fwd);
        if (r === startR) {
          const fwd2 = toPos(f, r + dir * 2);
          if (!board[fwd2]) moves.push(fwd2);
        }
      }
      for (const df of [-1, 1]) {
        const tf = f + df, tr = r + dir;
        if (tf >= 0 && tf <= 7 && tr >= 0 && tr <= 7) {
          const cap = toPos(tf, tr);
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

function isInCheck(board, color) {
  let kingPos = null;
  for (const [pos, piece] of Object.entries(board)) {
    if (piece.type === 'king' && piece.color === color) { kingPos = pos; break; }
  }
  if (!kingPos) return false;
  const opp = color === 'white' ? 'black' : 'white';
  for (const pos of Object.keys(board)) {
    if (board[pos].color === opp) {
      if (getLegalMoves(board, pos, opp).includes(kingPos)) return true;
    }
  }
  return false;
}

// --- Bot logic ---

function pieceValue(type) {
  const v = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };
  return v[type] || 0;
}

function getBotMove(board, color, cooldowns, now) {
  const opp = color === 'white' ? 'black' : 'white';
  const captures = [], regular = [];
  for (const from of Object.keys(board)) {
    if (board[from].color !== color) continue;
    if (cooldowns && cooldowns[from] && cooldowns[from] > now) continue;
    const moves = getLegalMoves(board, from, color);
    for (const to of moves) {
      if (board[to] && board[to].color === opp) {
        captures.push({ from, to, value: pieceValue(board[to].type) });
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
  const { from, to } = move;
  const piece = game.board[from];
  if (!piece) return false;
  const now = Date.now();
  const captured = game.board[to];
  const kingCaptured = captured && captured.type === 'king';
  game.board[to] = { ...piece };
  delete game.board[from];
  delete game.cooldowns[from];
  game.cooldowns[to] = now + COOLDOWN_MS;
  if (piece.type === 'pawn') {
    const { r } = fromPos(to);
    if ((piece.color === 'white' && r === 7) || (piece.color === 'black' && r === 0)) {
      game.board[to].type = 'queen';
    }
  }
  game.inCheck = { white: isInCheck(game.board, 'white'), black: isInCheck(game.board, 'black') };
  game.lastActivity = now;
  if (kingCaptured) {
    game.gameEnded = true;
    game.winner = BOT_ID;
    game.winnerName = BOT_NAME;
    game.status = 'ended';
    game.botLoopActive = false;
  }
  return true;
}

function startBotRealtimeLoop(game, emit) {
  game.botLoopActive = true;
  const gen = game.botGen;
  function tick() {
    if (!game.botLoopActive || game.botGen !== gen || game.gameEnded) return;
    const delay = 2000 + Math.random() * 1000; // 2–3s
    setTimeout(() => {
      if (!game.botLoopActive || game.botGen !== gen || game.gameEnded) return;
      const move = getBotMove(game.board, 'black', game.cooldowns, Date.now());
      if (move) applyBotMove(game, move);
      emit(game);
      tick();
    }, delay);
  }
  tick();
}

// Schedules the bot's response in turn-based phase.
// On the player's first move: respond normally, then immediately make a second
// move to reveal that the game is real-time, then start the real-time loop.
// A botScheduled flag prevents double-scheduling if the player moves quickly.
function scheduleBotTurn(game, emit) {
  if (!game.singlePlayer || game.gameEnded || game.botScheduled) return;
  if (game.botPhase === 'realtime') return;

  game.botScheduled = true;
  const gen = game.botGen;
  const isRevealMove = game.playerMoveCount === 1;

  setTimeout(() => {
    game.botScheduled = false;
    if (game.botGen !== gen || game.gameEnded) return;

    const move1 = getBotMove(game.board, 'black', game.cooldowns, Date.now());
    if (!move1) {
      if (isRevealMove) { game.botPhase = 'realtime'; startBotRealtimeLoop(game, emit); }
      return;
    }
    applyBotMove(game, move1);
    emit(game);
    if (game.gameEnded) return;

    if (isRevealMove) {
      // Second move quickly — the reveal
      const gen2 = game.botGen;
      setTimeout(() => {
        if (game.botGen !== gen2 || game.gameEnded) return;
        const move2 = getBotMove(game.board, 'black', game.cooldowns, Date.now());
        if (move2) applyBotMove(game, move2);
        game.botPhase = 'realtime';
        emit(game);
        if (!game.gameEnded) startBotRealtimeLoop(game, emit);
      }, 400 + Math.random() * 400); // 400–800ms after first response
    }
  }, 700 + Math.random() * 400); // 700–1100ms — feels like thinking
}

function stopBot(game) {
  game.botLoopActive = false;
  game.botGen = (game.botGen || 0) + 1; // invalidate all pending callbacks
  game.botScheduled = false;
}

// --- Game lifecycle ---

function createGame(playerName, playerId) {
  if (!playerName || !playerName.trim()) throw new Error('Player name required');
  const gameCode = generateGameCode();
  const game = {
    id: gameCode,
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
  game.board = initialBoard();
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

function createSinglePlayerGame(playerName, playerId) {
  if (!playerName || !playerName.trim()) throw new Error('Player name required');
  const gameCode = generateGameCode();
  const game = {
    id: gameCode,
    singlePlayer: true,
    players: [
      { id: playerId, name: playerName.trim(), color: 'white', connected: true, lastSeen: Date.now() },
      { id: BOT_ID, name: BOT_NAME, color: 'black', connected: true, isBot: true, lastSeen: Date.now() },
    ],
    board: initialBoard(),
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
  const piece = game.board[from];
  if (!piece) throw new Error('No piece at source');
  if (piece.color !== player.color) throw new Error('Not your piece');
  const now = Date.now();
  if (game.cooldowns[from] && game.cooldowns[from] > now) throw new Error('Piece is on cooldown');
  const legal = getLegalMoves(game.board, from, player.color);
  if (!legal.includes(to)) throw new Error('Illegal move');
  const captured = game.board[to];
  const kingCaptured = captured && captured.type === 'king';
  game.board[to] = { ...piece };
  delete game.board[from];
  delete game.cooldowns[from];
  game.cooldowns[to] = now + COOLDOWN_MS;
  if (piece.type === 'pawn') {
    const { r } = fromPos(to);
    if ((player.color === 'white' && r === 7) || (player.color === 'black' && r === 0)) {
      game.board[to].type = 'queen';
    }
  }
  game.inCheck = {
    white: isInCheck(game.board, 'white'),
    black: isInCheck(game.board, 'black'),
  };
  game.lastActivity = now;
  if (kingCaptured) {
    game.gameEnded = true;
    game.winner = playerId;
    game.winnerName = player.name;
    game.status = 'ended';
  }
  return { game };
}

function playAgain(game, playerId) {
  if (!game.players.some(p => p.id === playerId)) throw new Error('Not in this game');
  if (!game.gameEnded) throw new Error('Game is not over');
  game.players.forEach(p => { p.color = p.color === 'white' ? 'black' : 'white'; });
  game.board = initialBoard();
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
  stopBot(game);
  game.board = initialBoard();
  game.cooldowns = {};
  game.inCheck = { white: false, black: false };
  game.gameStarted = true;
  game.gameEnded = false;
  game.winner = null;
  game.winnerName = null;
  game.status = 'playing';
  game.botPhase = 'realtime'; // skip the onboarding trick on replays
  game.botScheduled = false;
  game.playerMoveCount = 0;
  game.lastActivity = Date.now();
  return { game };
}

module.exports = {
  createGame, joinGame, startGame, moveChessPiece, playAgain, getLegalMoves,
  createSinglePlayerGame, playAgainSinglePlayer, scheduleBotTurn, startBotRealtimeLoop, stopBot,
};
