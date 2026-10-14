import { useState, type FormEvent } from "react";
import { api } from "../../../api/client";
import { useToast } from "../../../hooks";
import { Button, FormField, Input, Modal } from "../../../components/ui";

interface CreateStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateStaffModal({ isOpen, onClose, onSuccess }: CreateStaffModalProps) {
  const [newStaffId, setNewStaffId] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPin, setNewPin] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const toast = useToast();

  async function handleCreateStaff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanId = newStaffId.trim().toUpperCase();

    if (!cleanId) {
      toast.error("Staff ID is required.");
      return;
    }
    if (!/^\d{4,12}$/.test(newPin)) {
      toast.error("PIN must be 4 to 12 digits (numeric only).");
      return;
    }
    const cleanPhone = newPhone.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 10) {
      toast.error("WhatsApp contact number is mandatory and must contain at least 10 digits.");
      return;
    }

    setIsCreating(true);
    try {
      await api.createStaff({
        staff_id: cleanId,
        pin: newPin,
        phone: newPhone.trim(),
        full_name: newFullName.trim() || null,
      });
      toast.success(`Staff account ${cleanId} created successfully!`);
      onClose();
      setNewStaffId("");
      setNewFullName("");
      setNewPhone("");
      setNewPin("");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create staff account.");
    } finally {
      setIsCreating(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Staff Account"
      description="Register staff credentials and mandatory WhatsApp contact."
    >
      <form onSubmit={handleCreateStaff} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <FormField id="new-staff-id" label="Staff ID" required hint="e.g. STF005 (uppercase identifier)">
          <Input
            id="new-staff-id"
            value={newStaffId}
            onChange={(e) => setNewStaffId(e.target.value.toUpperCase())}
            placeholder="STF005"
            minLength={3}
            maxLength={30}
            required
            autoFocus
          />
        </FormField>

        <FormField id="new-full-name" label="Full Name (Optional)">
          <Input
            id="new-full-name"
            value={newFullName}
            onChange={(e) => setNewFullName(e.target.value)}
            placeholder="Dr. Anand Verma"
            maxLength={100}
          />
        </FormField>

        <FormField
          id="new-phone"
          label="WhatsApp Contact Number"
          required
          hint="Mandatory. Used for automated absence alerts if absent > 2 days."
        >
          <Input
            id="new-phone"
            type="tel"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="9876543210 (10+ digits)"
            minLength={10}
            maxLength={15}
            required
          />
        </FormField>

        <FormField id="new-pin" label="Initial Account PIN" required hint="4 to 12 digits (numeric only)">
          <Input
            id="new-pin"
            type="password"
            inputMode="numeric"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder="4–12 digit PIN"
            minLength={4}
            maxLength={12}
            pattern="[0-9]{4,12}"
            required
          />
        </FormField>

        <div style={{ marginTop: "var(--space-3)", display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isCreating}>
            Create Staff Account
          </Button>
        </div>
      </form>
    </Modal>
  );
}
