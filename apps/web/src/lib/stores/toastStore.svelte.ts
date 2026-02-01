/**
 * Toast Notification Store
 * Simple global toast notification system
 */

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

let toasts = $state<Toast[]>([]);
let nextId = 0;

/**
 * Show a toast notification
 */
function show(message: string, type: ToastType = 'info', duration = 3000): void {
  const id = `toast-${nextId++}`;
  const toast: Toast = { id, message, type, duration };

  toasts = [...toasts, toast];

  if (duration > 0) {
    setTimeout(() => {
      dismiss(id);
    }, duration);
  }
}

/**
 * Dismiss a toast by ID
 */
function dismiss(id: string): void {
  toasts = toasts.filter(t => t.id !== id);
}

/**
 * Clear all toasts
 */
function clear(): void {
  toasts = [];
}

/**
 * Convenience methods for different toast types
 */
export const toast = {
  info: (message: string, duration?: number) => show(message, 'info', duration),
  success: (message: string, duration?: number) => show(message, 'success', duration),
  warning: (message: string, duration?: number) => show(message, 'warning', duration),
  error: (message: string, duration?: number) => show(message, 'error', duration),
  dismiss,
  clear,
  get all() { return toasts; },
};
