/**
 * Simple Observable base class for Yjs providers
 *
 * Provides event emitter functionality similar to Yjs's lib0/observable.
 */

type EventHandler = (...args: unknown[]) => void;

export class Observable {
  private _observers: Map<string, Set<EventHandler>> = new Map();

  on(name: string, handler: EventHandler): void {
    let handlers = this._observers.get(name);
    if (!handlers) {
      handlers = new Set();
      this._observers.set(name, handlers);
    }
    handlers.add(handler);
  }

  off(name: string, handler: EventHandler): void {
    const handlers = this._observers.get(name);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._observers.delete(name);
      }
    }
  }

  once(name: string, handler: EventHandler): void {
    const wrappedHandler = (...args: unknown[]) => {
      this.off(name, wrappedHandler);
      handler(...args);
    };
    this.on(name, wrappedHandler);
  }

  emit(name: string, args: unknown[]): void {
    const handlers = this._observers.get(name);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for "${name}":`, error);
        }
      });
    }
  }

  destroy(): void {
    this._observers.clear();
  }
}
