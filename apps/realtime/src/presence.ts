export class PresenceRegistry {
  private readonly sockets = new Map<string, Set<string>>();

  add(userId: string, socketId: string): boolean {
    let set = this.sockets.get(userId);
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socketId);
    return set.size === 1;
  }

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
