export class PresenceRegistry {
  private readonly sockets = new Map<string, Set<string>>();

  /** @returns true when this is the user's FIRST live socket (came online). */
  add(userId: string, socketId: string): boolean {
    let set = this.sockets.get(userId);
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socketId);
    return set.size === 1;
  }

  /** @returns true when the user's LAST socket closed (went offline). */
  remove(userId: string, socketId: string): boolean {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.sockets.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return this.sockets.has(userId);
  }

  filterOnline(userIds: string[]): string[] {
    return userIds.filter((id) => this.sockets.has(id));
  }

  onlineUsers(): number {
    return this.sockets.size;
  }
}
