import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Input } from "./Input";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  requireMatch?: string;
  matchPlaceholder?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  requireMatch,
  matchPlaceholder,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [matchInput, setMatchInput] = useState("");

  const isMatchValid = !requireMatch || matchInput.trim() === requireMatch.trim();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            variant={isDestructive ? "danger" : "primary"}
            disabled={!isMatchValid}
            onClick={() => {
              if (isMatchValid) {
                onConfirm();
              }
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {message}
        </p>

        {requireMatch && (
          <div
            style={{
              padding: "var(--space-3)",
              background: "var(--surface-card-subtle)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            <label
              htmlFor="confirm-match-input"
              style={{
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              To confirm this action, please type{" "}
              <strong style={{ color: "var(--color-danger)", fontFamily: "var(--font-mono)" }}>
                {requireMatch}
              </strong>{" "}
              below:
            </label>
            <Input
              id="confirm-match-input"
              value={matchInput}
              onChange={(e) => setMatchInput(e.target.value)}
              placeholder={matchPlaceholder || `Type "${requireMatch}"`}
              autoFocus
              autoComplete="off"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
