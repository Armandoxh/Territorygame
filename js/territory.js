// Territory grid: Uint8Array where each byte is the owner ID of that tile.
// 0 = unclaimed; 1..N = players. Dirty tiles are tracked for incremental render.
class Territory {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.owners = new Uint8Array(width * height);
    this.dirty = new Set();
  }

  idx(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getOwner(x, y) {
    if (!this.inBounds(x, y)) return -1;
    return this.owners[this.idx(x, y)];
  }

  claim(x, y, owner) {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    if (this.owners[i] === owner) return false;
    this.owners[i] = owner;
    this.dirty.add(i);
    return true;
  }

  countByOwner() {
    const counts = new Array(CONFIG.PLAYER_COLORS.length).fill(0);
    const o = this.owners;
    for (let i = 0; i < o.length; i++) counts[o[i]]++;
    return counts;
  }
}
