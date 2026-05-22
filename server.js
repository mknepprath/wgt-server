const { createServer } = require('http');
const { Server } = require('socket.io');
const { createGame, joinGame, startGame, placeCard, revealThing, playAgain } = require('./lib/game-server.js');
const chessServer = require('./lib/chess-server.js');

// Game state storage
const games = new Map();
const playerGames = new Map();
const chessGames = new Map();
const chessPlayerGames = new Map();

const ALLOWED_ORIGINS = [
  'https://mknepprath.com',
  'https://www.mknepprath.com',
  'https://wgt-server-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:3001'
];

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      games: games.size,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Who Goes There? Game Server\n');
});

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const gameNamespace = io.of('/who-goes-there');

gameNamespace.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('createGame', (data) => {
    try {
      const result = createGame(data.playerName, socket.id);
      games.set(result.gameCode, result.game);
      playerGames.set(socket.id, result.gameCode);

      socket.join(result.gameCode);
      socket.emit('gameCreated', { gameId: result.gameCode, playerId: socket.id });
      socket.emit('gameStateUpdate', result.game);

      console.log(`Game created: ${result.gameCode} by ${data.playerName}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('joinGame', (data) => {
    try {
      const gameCode = data.gameCode.toUpperCase();
      const game = games.get(gameCode);

      if (!game) {
        throw new Error('Game not found');
      }

      const result = joinGame(game, data.playerName, socket.id);
      playerGames.set(socket.id, gameCode);

      socket.join(gameCode);
      socket.emit('gameJoined', { gameId: gameCode, playerId: socket.id });
      gameNamespace.to(gameCode).emit('gameStateUpdate', result.game);

      console.log(`Player ${data.playerName} joined game ${gameCode}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('startGame', (data) => {
    try {
      const gameCode = data.gameCode;
      const game = games.get(gameCode);

      if (!game) {
        throw new Error('Game not found');
      }

      const queensVariant = data.queensVariant || false;
      const result = startGame(game, socket.id, queensVariant);
      gameNamespace.to(gameCode).emit('gameStateUpdate', result.game);

      console.log(`Game started: ${gameCode} (Queens Variant: ${queensVariant})`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('placeCard', (data) => {
    try {
      const gameCode = data.gameCode;
      const game = games.get(gameCode);

      if (!game) {
        throw new Error('Game not found');
      }

      const result = placeCard(game, socket.id, data.cardIndex, data.position);
      gameNamespace.to(gameCode).emit('gameStateUpdate', result.game);

      console.log(`Card placed in game ${gameCode} at ${data.position}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('revealThing', (data) => {
    try {
      const gameCode = data.gameCode;
      const game = games.get(gameCode);

      if (!game) {
        throw new Error('Game not found');
      }

      const result = revealThing(game, socket.id);
      gameNamespace.to(gameCode).emit('gameStateUpdate', result.game);

      console.log(`Thing revealed in game ${gameCode}: ${result.game.thingSuit}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('playAgain', (data) => {
    try {
      const gameCode = data.gameCode;
      const game = games.get(gameCode);

      if (!game) {
        throw new Error('Game not found');
      }

      const result = playAgain(game, socket.id);
      gameNamespace.to(gameCode).emit('gameStateUpdate', result.game);

      console.log(`New round started in game ${gameCode}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    const gameCode = playerGames.get(socket.id);
    if (gameCode) {
      const game = games.get(gameCode);
      if (game) {
        const player = game.players.find(p => p.id === socket.id);
        if (player) {
          player.connected = false;
          player.lastSeen = Date.now();
          gameNamespace.to(gameCode).emit('gameStateUpdate', game);
        }
      }
      playerGames.delete(socket.id);
    }
  });

  socket.on('heartbeat', () => {
    const gameCode = playerGames.get(socket.id);
    if (gameCode) {
      const game = games.get(gameCode);
      if (game) {
        const player = game.players.find(p => p.id === socket.id);
        if (player) {
          player.connected = true;
          player.lastSeen = Date.now();
        }
      }
    }
  });
});

// Clean up old games every 5 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours

  for (const [gameCode, game] of games.entries()) {
    if (now - game.lastActivity > maxAge) {
      console.log(`Cleaning up old game: ${gameCode}`);
      for (const player of game.players) {
        playerGames.delete(player.id);
      }
      games.delete(gameCode);
    }
  }
}, 5 * 60 * 1000);

// --- Chess namespace ---
const chessNamespace = io.of('/chess');

chessNamespace.on('connection', (socket) => {
  console.log(`Chess player connected: ${socket.id}`);

  socket.on('createGame', (data) => {
    try {
      const result = chessServer.createGame(data.playerName, socket.id, data.mapId);
      chessGames.set(result.gameCode, result.game);
      chessPlayerGames.set(socket.id, result.gameCode);
      socket.join(result.gameCode);
      socket.emit('gameCreated', { gameId: result.gameCode, playerId: socket.id });
      socket.emit('gameStateUpdate', result.game);
    } catch (e) { socket.emit('error', { message: e.message }); }
  });

  socket.on('joinGame', (data) => {
    try {
      const gameCode = data.gameCode.toUpperCase();
      const game = chessGames.get(gameCode);
      if (!game) throw new Error('Game not found');
      const result = chessServer.joinGame(game, data.playerName, socket.id);
      chessPlayerGames.set(socket.id, gameCode);
      socket.join(gameCode);
      socket.emit('gameJoined', { gameId: gameCode, playerId: socket.id });
      chessNamespace.to(gameCode).emit('gameStateUpdate', result.game);
    } catch (e) { socket.emit('error', { message: e.message }); }
  });

  socket.on('startGame', (data) => {
    try {
      const game = chessGames.get(data.gameCode);
      if (!game) throw new Error('Game not found');
      const result = chessServer.startGame(game, socket.id);
      chessNamespace.to(data.gameCode).emit('gameStateUpdate', result.game);
    } catch (e) { socket.emit('error', { message: e.message }); }
  });

  socket.on('fillWithBots', (data) => {
    try {
      const game = chessGames.get(data.gameCode);
      if (!game) throw new Error('Game not found');
      const result = chessServer.startGameWithBots(game, socket.id);
      chessNamespace.to(data.gameCode).emit('gameStateUpdate', result.game);
      chessServer.startBotRealtimeLoop(game, (g) => {
        chessNamespace.to(data.gameCode).emit('gameStateUpdate', g);
      });
    } catch (e) { socket.emit('error', { message: e.message }); }
  });

  socket.on('createSinglePlayerGame', (data) => {
    try {
      const result = chessServer.createSinglePlayerGame(data.playerName, socket.id, data.mapId);
      chessGames.set(result.gameCode, result.game);
      chessPlayerGames.set(socket.id, result.gameCode);
      socket.join(result.gameCode);
      socket.emit('gameCreated', { gameId: result.gameCode, playerId: socket.id });
      socket.emit('gameStateUpdate', result.game);
    } catch (e) { socket.emit('error', { message: e.message }); }
  });

  socket.on('movePiece', (data) => {
    try {
      const game = chessGames.get(data.gameCode);
      if (!game) throw new Error('Game not found');
      const result = chessServer.moveChessPiece(game, socket.id, data.from, data.to);
      chessNamespace.to(data.gameCode).emit('gameStateUpdate', result.game);
      if (game.singlePlayer && !game.gameEnded) {
        game.playerMoveCount++;
        chessServer.scheduleBotTurn(game, (g) => {
          chessNamespace.to(data.gameCode).emit('gameStateUpdate', g);
        });
      }
    } catch (e) { socket.emit('error', { message: e.message }); }
  });

  socket.on('playAgain', (data) => {
    try {
      const game = chessGames.get(data.gameCode);
      if (!game) throw new Error('Game not found');
      if (game.singlePlayer) {
        const result = chessServer.playAgainSinglePlayer(game, socket.id);
        chessNamespace.to(data.gameCode).emit('gameStateUpdate', result.game);
        chessServer.startBotRealtimeLoop(game, (g) => {
          chessNamespace.to(data.gameCode).emit('gameStateUpdate', g);
        });
      } else {
        const result = chessServer.playAgain(game, socket.id);
        chessNamespace.to(data.gameCode).emit('gameStateUpdate', result.game);
      }
    } catch (e) { socket.emit('error', { message: e.message }); }
  });

  socket.on('cursorUpdate', (data) => {
    if (data.gameCode) {
      socket.to(data.gameCode).emit('opponentCursor', { hover: data.hover ?? null, selected: data.selected ?? null });
    }
  });

  socket.on('rejoinGame', (data) => {
    try {
      const gameCode = (data.gameCode || '').toUpperCase();
      const game = chessGames.get(gameCode);
      if (!game) throw new Error('Game not found');
      const player = game.players.find(p => p.id === data.playerId && !p.isBot);
      if (!player) throw new Error('Player not found');
      chessPlayerGames.delete(player.id);
      chessPlayerGames.set(socket.id, gameCode);
      player.id = socket.id;
      player.connected = true;
      player.lastSeen = Date.now();
      socket.join(gameCode);
      if (game.singlePlayer && game.gameStarted && !game.gameEnded && !game.botLoopActive) {
        chessServer.startBotRealtimeLoop(game, (g) => {
          chessNamespace.to(gameCode).emit('gameStateUpdate', g);
        });
      }
      socket.emit('gameStateUpdate', game);
    } catch (e) { socket.emit('error', { message: e.message }); }
  });

  socket.on('disconnect', () => {
    const gameCode = chessPlayerGames.get(socket.id);
    if (gameCode) {
      const game = chessGames.get(gameCode);
      if (game) {
        const player = game.players.find(p => p.id === socket.id);
        if (player) { player.connected = false; player.lastSeen = Date.now(); }
        if (game.singlePlayer) {
          chessServer.stopBot(game);
          // Keep the game alive so the player can rejoin; TTL cleans it up.
        } else {
          chessNamespace.to(gameCode).emit('gameStateUpdate', game);
        }
      }
      chessPlayerGames.delete(socket.id);
    }
  });

  socket.on('heartbeat', () => {
    const gameCode = chessPlayerGames.get(socket.id);
    if (gameCode) {
      const game = chessGames.get(gameCode);
      if (game) {
        const player = game.players.find(p => p.id === socket.id);
        if (player) { player.connected = true; player.lastSeen = Date.now(); }
      }
    }
  });
});

setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;
  for (const [code, game] of chessGames.entries()) {
    if (now - game.lastActivity > maxAge) {
      if (game.singlePlayer) chessServer.stopBot(game);
      for (const p of game.players) chessPlayerGames.delete(p.id);
      chessGames.delete(code);
    }
  }
}, 5 * 60 * 1000);

const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log(`> Game Server ready on port ${port}`);
  console.log(`> Socket.IO namespace: /who-goes-there`);
  console.log(`> Chess Socket.IO ready at ws://localhost:${port}/chess`);
});
