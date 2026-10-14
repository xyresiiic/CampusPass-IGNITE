import { useState, type FormEvent } from "react";
import { api } from "../../../api/client";
import { useToast } from "../../../hooks";
import { Button, FormField, Input, Modal } from "../../../components/ui";

interface ResetPinModalProps {
  staffId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResetPinModal({ staffId, onClose, onSuccess }: ResetPinModalProps) {
  const [resetPinValue, setResetPinValue] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const toast = useToast();

  async function handleResetPin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!staffId) return;

    if (!/^\d{4,12}$/.test(resetPinValue)) {
      toast.error("PIN must be 4 to 12 digits (numeric only).");
      return;
    }

    setIsResetting(true);
    try {
      await api.resetStaffPin(staffId, resetPinValue);
      toast.success(`PIN reset successfully for ${staffId}!`);
      onClose();
      setResetPinValue("");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset PIN.");
    } finally {
      setIsResetting(false);
    }
  }

  if (!staffId) return null;

  return (
    <Modal
      isOpen={!!staffId}
      onClose={onClose}
      title={`Reset PIN for ${staffId}`}
      description="Set a new numeric access PIN for this account."
    >
      <form onSubmit={handleResetPin} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <FormField id="reset-pin" label="New Account PIN" required hint="4 to 12 digits (numeric only)">
          <Input
            id="reset-pin"
            type="password"
            inputMode="numeric"
            value={resetPinValue}
            onChange={(e) => setResetPinValue(e.target.value)}
            placeholder="Enter new 4–12 digit PIN"
            minLength={4}
            maxLength={12}
            pattern="[0-9]{4,12}"
            autoFocus
            required
          />
        </FormField>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isResetting}>
            Save New PIN
          </Button>
        </div>
      </form>
    </Modal>
  );
}
