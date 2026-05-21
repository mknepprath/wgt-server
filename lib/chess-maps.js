function toPos(f, r) { return `${String.fromCharCode(97 + f)}${r + 1}`; }

function buildDumbbellActive() {
  const active = new Set();
  // Bottom island: ranks 1-4 (r=0-3), all 6 files (a-f)
  for (let r = 0; r < 4; r++) for (let f = 0; f < 6; f++) active.add(toPos(f, r));
  // Bridge: ranks 5-10 (r=4-9), files c-d only (f=2-3)
  for (let r = 4; r < 10; r++) for (const f of [2, 3]) active.add(toPos(f, r));
  // Top island: ranks 11-14 (r=10-13), all 6 files
  for (let r = 10; r < 14; r++) for (let f = 0; f < 6; f++) active.add(toPos(f, r));
  return active;
}

const MAPS = {
  standard: {
    id: 'standard',
    name: 'Standard',
    files: 8,
    ranks: 8,
    active: null,
    whiteBackR: 0, whitePawnR: 1, whitePawnStartR: 1, whitePromoteR: 7,
    blackBackR: 7, blackPawnR: 6, blackPawnStartR: 6, blackPromoteR: 0,
    whiteBackRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'],
    blackBackRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'],
  },
  dumbbell: {
    id: 'dumbbell',
    name: 'The Dumbbell',
    files: 6,
    ranks: 14,
    active: buildDumbbellActive(),
    whiteBackR: 0, whitePawnR: 1, whitePawnStartR: 1, whitePromoteR: 13,
    blackBackR: 13, blackPawnR: 12, blackPawnStartR: 12, blackPromoteR: 0,
    whiteBackRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'rook'],
    blackBackRank: ['rook', 'knight', 'bishop', 'queen', 'king', 'rook'],
  },
};

module.exports = { MAPS };
