import { reactive } from "vue";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

interface ToastHostState {
  toasts: Toast[];
}

/**
 * Estado a nivel de módulo (no un store de Pinia): un toast es pura
 * mecánica de UI efímera, sin nada que valga la pena inspeccionar en
 * devtools ni persistir. `reactive` alcanza y sobra.
 */
const state: ToastHostState = reactive({ toasts: [] });

let nextId = 0;
const DEFAULT_DURATION_MS = 3500;

export function useToast() {
  function show(text: string, tone: Toast["tone"] = "info", durationMs = DEFAULT_DURATION_MS): void {
    const id = nextId++;
    state.toasts.push({ id, text, tone });
    setTimeout(() => {
      const index = state.toasts.findIndex((toast) => toast.id === id);
      if (index !== -1) state.toasts.splice(index, 1);
    }, durationMs);
  }

  return {
    toasts: state.toasts,
    show,
    info: (text: string) => show(text, "info"),
    error: (text: string) => show(text, "error"),
  };
}
