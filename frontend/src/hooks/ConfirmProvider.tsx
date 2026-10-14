import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ConfirmContext, type ConfirmContextType, type ConfirmOptions } from "./confirmContext";

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
  }>({
    isOpen: false,
    options: { title: "", message: "" },
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialogState({ isOpen: true, options });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleCancel = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const value = useMemo<ConfirmContextType>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {dialogState.isOpen && (
        <ConfirmDialog
          isOpen={dialogState.isOpen}
          title={dialogState.options.title}
          message={dialogState.options.message}
          confirmText={dialogState.options.confirmText}
          cancelText={dialogState.options.cancelText}
          isDestructive={dialogState.options.isDestructive}
          requireMatch={dialogState.options.requireMatch}
          matchPlaceholder={dialogState.options.matchPlaceholder}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}
