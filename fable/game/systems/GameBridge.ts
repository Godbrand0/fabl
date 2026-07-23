type EventCallback = (data?: any) => void;

class GameBridge {
  private listeners: Record<string, EventCallback[]> = {};
  private lastEmitted: Record<string, any> = {};

  // Register listener. Pass replayLast=true to immediately receive the most
  // recent value if one was already emitted — fixes HUD mounting after Phaser.
  on(event: string, callback: EventCallback, replayLast = false): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    if (replayLast && event in this.lastEmitted) {
      try { callback(this.lastEmitted[event]); } catch (err) { /* ignore */ }
    }

    return () => this.off(event, callback);
  }

  off(event: string, callback: EventCallback): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event: string, data?: any): void {
    this.lastEmitted[event] = data;
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`Error in GameBridge event listener for '${event}':`, err);
      }
    });
  }

  clear(): void {
    this.listeners = {};
    this.lastEmitted = {};
  }
}

export const gameBridge = new GameBridge();
export default gameBridge;
