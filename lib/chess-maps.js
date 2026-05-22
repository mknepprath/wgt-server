function toPos(f, r) { return `${String.fromCharCode(97 + f)}${r + 1}`; }

function buildDumbbellActive() {
  const active = new Set();
  for (let r = 0; r < 4; r++) for (let f = 0; f < 6; f++) active.add(toPos(f, r));
  for (let r = 4; r < 10; r++) for (const f of [2, 3]) active.add(toPos(f, r));
  for (let r = 10; r < 14; r++) for (let f = 0; f < 6; f++) active.add(toPos(f, r));
  return active;
}

function buildSwitchbackActive() {
  const active = new Set();
  const add = (f1, f2, r1, r2) => {
    for (let f = f1; f <= f2; f++)
      for (let r = r1; r <= r2; r++)
        active.add(toPos(f, r));
  };
  add(0, 3, 0, 2);  // White home (a-d, ranks 1-3)
  add(6, 9, 0, 2);  // Green home (g-j, ranks 1-3)
  add(0, 3, 9, 11); // Red home (a-d, ranks 10-12)
  add(6, 9, 9, 11); // Black home (g-j, ranks 10-12)
  add(3, 4, 3, 5);  // White exit right (d-e, ranks 4-6)
  add(5, 6, 3, 4);  // Green exit left (f-g, ranks 4-5)
  add(3, 6, 4, 5);  // Low cross (d-g, ranks 5-6)
  add(2, 3, 5, 8);  // Left path up (c-d, ranks 6-9)
  add(6, 7, 4, 8);  // Right path up (g-h, ranks 5-9)
  add(3, 7, 7, 8);  // High cross (d-h, ranks 8-9)
  add(2, 3, 8, 9);  // Left connects to Red (c-d, ranks 9-10)
  add(6, 7, 8, 9);  // Right connects to Black (g-h, ranks 9-10)
  return active;
}

function buildWishboneActive() {
  const active = new Set();
  const add = (f1, f2, r1, r2) => {
    for (let f = f1; f <= f2; f++)
      for (let r = r1; r <= r2; r++)
        active.add(toPos(f, r));
  };
  add(0, 3, 0, 2);  // White home (a-d, ranks 1-3)
  add(6, 9, 0, 2);  // Green home (g-j, ranks 1-3)
  add(3, 4, 3, 5);  // White exit (d-e, ranks 4-6)
  add(5, 6, 3, 4);  // Green exit (f-g, ranks 4-5)
  add(3, 6, 4, 5);  // Lower crossing (d-g, ranks 5-6)
  add(4, 5, 5, 7);  // Stem (e-f, ranks 6-8)
  add(3, 6, 8, 10); // Red home (d-g, ranks 9-11)
  return active;
}

function buildArchipelagoActive() {
  const active = new Set();
  const add = (f1, f2, r1, r2) => {
    for (let f = f1; f <= f2; f++)
      for (let r = r1; r <= r2; r++)
        active.add(toPos(f, r));
  };
  add(0, 7, 0, 2);  // White home (a-h, ranks 1-3)
  add(0, 7, 7, 9);  // Black home (a-h, ranks 8-10)
  add(3, 4, 3, 6);  // Central crossing (d-e, ranks 4-7)
  add(0, 1, 4, 5);  // Left island (a-b, ranks 5-6) — knight-only access
  add(6, 7, 4, 5);  // Right island (g-h, ranks 5-6) — knight-only access
  return active;
}

function buildRingRoadActive() {
  const active = new Set();
  const add = (f1, f2, r1, r2) => {
    for (let f = f1; f <= f2; f++)
      for (let r = r1; r <= r2; r++)
        active.add(toPos(f, r));
  };
  add(3, 8, 0, 2);  // White home (d-i, ranks 1-3)
  add(2, 3, 2, 8);  // Left corridor (c-d, ranks 3-9)
  add(8, 9, 2, 8);  // Right corridor (i-j, ranks 3-9)
  add(3, 8, 8, 10); // Black home (d-i, ranks 9-11)
  return active;
}

const MAPS = {
  standard: {
    id: 'standard',
    name: 'Standard',
    files: 8, ranks: 8,
    active: null,
    maxPlayers: 2,
    whiteBackR: 0, whitePawnR: 1, whitePawnStartR: 1, whitePromoteR: 7,
    blackBackR: 7, blackPawnR: 6, blackPawnStartR: 6, blackPromoteR: 0,
    whiteBackRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'],
    blackBackRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'],
  },
  dumbbell: {
    id: 'dumbbell',
    name: 'The Dumbbell',
    files: 6, ranks: 14,
    active: buildDumbbellActive(),
    maxPlayers: 2,
    whiteBackR: 0, whitePawnR: 1, whitePawnStartR: 1, whitePromoteR: 13,
    blackBackR: 13, blackPawnR: 12, blackPawnStartR: 12, blackPromoteR: 0,
    whiteBackRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'rook'],
    blackBackRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'rook'],
  },
  switchback: {
    id: 'switchback',
    name: 'The Switchback',
    files: 10, ranks: 12,
    active: buildSwitchbackActive(),
    maxPlayers: 4,
    // playerSlots defines piece placement and pawn rules for each color
    playerSlots: [
      {
        color: 'white',
        homeFiles: [0, 1, 2, 3], backR: 0, pawnR: 1, pawnStartR: 1, promoteR: 11, dir: 1,
        backRank: ['rook', 'bishop', 'queen', 'king'],
      },
      {
        color: 'green',
        homeFiles: [6, 7, 8, 9], backR: 0, pawnR: 1, pawnStartR: 1, promoteR: 11, dir: 1,
        backRank: ['king', 'queen', 'bishop', 'rook'],
      },
      {
        color: 'red',
        homeFiles: [0, 1, 2, 3], backR: 11, pawnR: 10, pawnStartR: 10, promoteR: 0, dir: -1,
        backRank: ['rook', 'bishop', 'queen', 'king'],
      },
      {
        color: 'black',
        homeFiles: [6, 7, 8, 9], backR: 11, pawnR: 10, pawnStartR: 10, promoteR: 0, dir: -1,
        backRank: ['king', 'queen', 'bishop', 'rook'],
      },
    ],
  },
  archipelago: {
    id: 'archipelago',
    name: 'The Archipelago',
    files: 8, ranks: 10,
    active: buildArchipelagoActive(),
    maxPlayers: 2,
    whiteBackR: 0, whitePawnR: 1, whitePawnStartR: 1, whitePromoteR: 9,
    blackBackR: 9, blackPawnR: 8, blackPawnStartR: 8, blackPromoteR: 0,
    whiteBackRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'],
    blackBackRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'],
  },
  ringRoad: {
    id: 'ringRoad',
    name: 'The Ring Road',
    files: 12, ranks: 11,
    active: buildRingRoadActive(),
    maxPlayers: 2,
    playerSlots: [
      {
        color: 'white',
        homeFiles: [3, 4, 5, 6, 7, 8], backR: 0, pawnR: 1, pawnStartR: 1, promoteR: 10, dir: 1,
        backRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'rook'],
      },
      {
        color: 'black',
        homeFiles: [3, 4, 5, 6, 7, 8], backR: 10, pawnR: 9, pawnStartR: 9, promoteR: 0, dir: -1,
        backRank: ['rook', 'king', 'queen', 'bishop', 'knight', 'rook'],
      },
    ],
  },
  wishbone: {
    id: 'wishbone',
    name: 'The Wishbone',
    files: 10, ranks: 11,
    active: buildWishboneActive(),
    maxPlayers: 3,
    playerSlots: [
      {
        color: 'white',
        homeFiles: [0, 1, 2, 3], backR: 0, pawnR: 1, pawnStartR: 1, promoteR: 10, dir: 1,
        backRank: ['rook', 'bishop', 'queen', 'king'],
      },
      {
        color: 'green',
        homeFiles: [6, 7, 8, 9], backR: 0, pawnR: 1, pawnStartR: 1, promoteR: 10, dir: 1,
        backRank: ['king', 'queen', 'bishop', 'rook'],
      },
      {
        color: 'red',
        homeFiles: [3, 4, 5, 6], backR: 10, pawnR: 9, pawnStartR: 9, promoteR: 0, dir: -1,
        backRank: ['rook', 'bishop', 'queen', 'king'],
      },
    ],
  },
};

module.exports = { MAPS };
