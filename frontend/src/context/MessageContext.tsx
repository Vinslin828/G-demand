import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ConfirmPayload = {
  title: string;
  message: string;
};

type MessageState =
  | { kind: "none" }
  | { kind: "message"; text: string }
  | { kind: "confirm"; payload: ConfirmPayload; resolve: (value: boolean) => void };

type MessageContextValue = {
  showMessage: (text: string) => void;
  showConfirm: (payload: ConfirmPayload) => Promise<boolean>;
};

const MessageContext = createContext<MessageContextValue | undefined>(undefined);

export function MessageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MessageState>({ kind: "none" });

  const showMessage = useCallback((text: string) => {
    setState({ kind: "message", text });
  }, []);

  const showConfirm = useCallback((payload: ConfirmPayload) => {
    return new Promise<boolean>((resolve) => {
      setState({ kind: "confirm", payload, resolve });
    });
  }, []);

  const closeMessage = useCallback(() => {
    setState({ kind: "none" });
  }, []);

  const confirm = useCallback((ok: boolean) => {
    setState((current) => {
      if (current.kind === "confirm") {
        current.resolve(ok);
      }
      return { kind: "none" };
    });
  }, []);

  const value = useMemo<MessageContextValue>(
    () => ({
      showMessage,
      showConfirm
    }),
    [showMessage, showConfirm]
  );

  return (
    <MessageContext.Provider value={value}>
      {children}
      {state.kind === "message" && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="alertdialog" aria-modal="true">
            <h3>Notice</h3>
            <p>{state.text}</p>
            <button className="btn btn-primary" onClick={closeMessage} type="button">
              OK
            </button>
          </div>
        </div>
      )}
      {state.kind === "confirm" && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="alertdialog" aria-modal="true">
            <h3>{state.payload.title}</h3>
            <p>{state.payload.message}</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => confirm(false)} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => confirm(true)} type="button">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </MessageContext.Provider>
  );
}

export function useMessageContext() {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error("useMessageContext must be used within MessageProvider");
  }
  return context;
}
