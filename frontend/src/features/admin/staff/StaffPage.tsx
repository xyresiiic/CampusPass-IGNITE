import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../../api/client";
import { useCamera, useConfirm, useToast } from "../../../hooks";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui";
import type { StaffAccount } from "../../../types";

export function StaffPage() {
  const [staffList, setStaffList] = useState<StaffAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Create Staff Form State
  const [newStaffId, setNewStaffId] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPin, setNewPin] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Edit Inline Profile State
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Reset PIN Modal State
  const [resetTargetStaffId, setResetTargetStaffId] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState("");
  const [isResettingPin, setIsResettingPin] = useState(false);

  // Face Enrollment Modal State
  const [enrollingStaff, setEnrollingStaff] = useState<StaffAccount | null>(null);
  const { videoRef, isReady, error: cameraError, startCamera, stopCamera, captureFrame } = useCamera({
    autoStart: false,
  });
  const [isEnrollingFace, setIsEnrollingFace] = useState(false);

  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    void loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStaff() {
    setIsLoading(true);
    try {
      const list = await api.getStaffList();
      setStaffList(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load staff accounts.");
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Create Staff Account
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
      setShowCreateModal(false);
      setNewStaffId("");
      setNewFullName("");
      setNewPhone("");
      setNewPin("");
      void loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create staff account.");
    } finally {
      setIsCreating(false);
    }
  }

  // Handle Save Staff Profile Edit
  async function handleSaveProfile(staffId: string) {
    setIsSavingEdit(true);
    try {
      await api.updateStaffProfile(staffId, {
        full_name: editFullName.trim() || null,
        phone: editPhone.trim() || null,
      });
      toast.success(`Profile updated for ${staffId}.`);
      setEditingStaffId(null);
      void loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  // Handle Reset PIN
  async function handleResetPin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetTargetStaffId) return;

    if (!/^\d{4,12}$/.test(resetPinValue)) {
      toast.error("PIN must be 4 to 12 digits (numeric only).");
      return;
    }

    setIsResettingPin(true);
    try {
      await api.resetStaffPin(resetTargetStaffId, resetPinValue);
      toast.success(`PIN reset successfully for ${resetTargetStaffId}!`);
      setResetTargetStaffId(null);
      setResetPinValue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset PIN.");
    } finally {
      setIsResettingPin(false);
    }
  }

  // Handle Activate / Deactivate Toggle
  async function handleToggleStatus(staff: StaffAccount) {
    const nextStatus = !staff.is_active;
    const actionWord = nextStatus ? "activate" : "deactivate";

    const confirmed = await confirm({
      title: `${nextStatus ? "Activate" : "Deactivate"} Account?`,
      message: `Are you sure you want to ${actionWord} staff account ${staff.staff_id}? ${
        !nextStatus ? "They will be temporarily prevented from marking attendance." : ""
      }`,
      confirmText: nextStatus ? "Activate" : "Deactivate",
      isDestructive: !nextStatus,
    });

    if (!confirmed) return;

    try {
      await api.toggleStaffStatus(staff.staff_id, nextStatus);
      toast.success(`${staff.staff_id} is now ${nextStatus ? "active" : "deactivated"}.`);
      void loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status.");
    }
  }

  // Handle Delete Staff with typed confirmation
  async function handleDeleteStaff(staff: StaffAccount) {
    const confirmed = await confirm({
      title: `Permanently Delete ${staff.staff_id}?`,
      message: `This will permanently remove the account profile, attendance logs, and credentials for ${staff.staff_id}. This action cannot be undone.`,
      confirmText: "Delete Account Permanently",
      isDestructive: true,
      requireMatch: staff.staff_id,
      matchPlaceholder: `Type ${staff.staff_id} to confirm`,
    });

    if (!confirmed) return;

    try {
      await api.deleteStaff(staff.staff_id);
      toast.success(`Account ${staff.staff_id} permanently deleted.`);
      void loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete account.");
    }
  }

  // Open & Close Face Enrollment
  function handleOpenEnrollment(staff: StaffAccount) {
    setEnrollingStaff(staff);
    void startCamera();
  }

  function handleCloseEnrollment() {
    stopCamera();
    setEnrollingStaff(null);
  }

  async function handleCaptureAndEnrollFace() {
    if (!enrollingStaff) return;
    setIsEnrollingFace(true);

    try {
      const imageBase64 = captureFrame(0.9);
      await api.enrollStaffFace(enrollingStaff.staff_id, imageBase64);
      toast.success(`Face enrolled successfully for ${enrollingStaff.staff_id}!`);
      handleCloseEnrollment();
      void loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Face enrollment failed.");
    } finally {
      setIsEnrollingFace(false);
    }
  }

  // Filter staff list
  const filteredStaff = staffList.filter((s) => {
    const matchesSearch =
      s.staff_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.full_name && s.full_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.phone && s.phone.includes(searchQuery));

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && s.is_active) ||
      (statusFilter === "inactive" && !s.is_active);

    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Header Bar */}
      <div className="admin-page-header">
        <div>
          <h1>Staff Management</h1>
          <p>Create staff credentials, enroll facial profiles, and manage access.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button variant="outline" size="sm" onClick={() => void loadStaff()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "↻ Refresh"}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            + Add Staff Member
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="admin-filter-bar">
        <div style={{ flex: 1, minWidth: "220px" }}>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, name, or phone..."
            leftIcon="🔍"
          />
        </div>
        <div style={{ width: "160px" }}>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          >
            <option value="all">All Accounts ({staffList.length})</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </Select>
        </div>
      </div>

      {/* Staff Table Card */}
      <Card>
        <CardBody style={{ padding: 0 }}>
          {isLoading && staffList.length === 0 ? (
            <SkeletonTable rows={5} cols={6} />
          ) : filteredStaff.length === 0 ? (
            <EmptyState
              title="No staff members found"
              description={searchQuery ? "No accounts match your search filters." : "No staff accounts registered yet."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>WhatsApp Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Face Enrollment</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((staff) => {
                  const isEditing = editingStaffId === staff.staff_id;
                  return (
                    <TableRow key={staff.staff_id}>
                      <TableCell>
                        <strong style={{ fontFamily: "var(--font-mono)" }}>{staff.staff_id}</strong>
                      </TableCell>

                      {/* Full Name Cell (Inline Editable) */}
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={editFullName}
                            onChange={(e) => setEditFullName(e.target.value)}
                            placeholder="Full Name"
                            style={{ height: "32px", fontSize: "13px" }}
                          />
                        ) : (
                          staff.full_name || <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </TableCell>

                      {/* WhatsApp Phone Cell (Inline Editable) */}
                      <TableCell>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
                            <Input
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value)}
                              placeholder="Phone"
                              style={{ height: "32px", fontSize: "13px", width: "130px" }}
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              isLoading={isSavingEdit}
                              onClick={() => void handleSaveProfile(staff.staff_id)}
                            >
                              ✓
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingStaffId(null)}
                            >
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                            <span style={{ fontSize: "var(--text-xs)" }}>
                              {staff.phone ? `💬 ${staff.phone}` : "Not set"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStaffId(staff.staff_id);
                                setEditFullName(staff.full_name || "");
                                setEditPhone(staff.phone || "");
                              }}
                              style={{ fontSize: "11px", color: "var(--brand-primary)", textDecoration: "underline" }}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </TableCell>

                      {/* Status Badge */}
                      <TableCell>
                        <Badge variant={staff.is_active ? "success" : "danger"} dot>
                          {staff.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>

                      {/* Face Enrollment */}
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!staff.is_active}
                          onClick={() => handleOpenEnrollment(staff)}
                        >
                          📷 Enroll Face
                        </Button>
                      </TableCell>

                      {/* Actions Group */}
                      <TableCell>
                        <div style={{ display: "flex", gap: "var(--space-1-5)", alignItems: "center" }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setResetTargetStaffId(staff.staff_id);
                              setResetPinValue("");
                            }}
                          >
                            Reset PIN
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleToggleStatus(staff)}
                          >
                            {staff.is_active ? "Deactivate" : "Activate"}
                          </Button>

                          <Button
                            variant="danger-outline"
                            size="sm"
                            onClick={() => void handleDeleteStaff(staff)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Create Staff Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
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
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isCreating}>
                Create Staff Account
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reset PIN Modal */}
      {resetTargetStaffId && (
        <Modal
          isOpen={!!resetTargetStaffId}
          onClose={() => setResetTargetStaffId(null)}
          title={`Reset PIN for ${resetTargetStaffId}`}
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
              <Button variant="outline" onClick={() => setResetTargetStaffId(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isResettingPin}>
                Save New PIN
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Face Enrollment Camera Modal */}
      {enrollingStaff && (
        <Modal
          isOpen={!!enrollingStaff}
          onClose={handleCloseEnrollment}
          title={`Enroll Face: ${enrollingStaff.staff_id}`}
          description="Ensure the staff member is in view with good lighting and directly facing the camera."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div className="camera-scanner-card" style={{ maxHeight: "300px" }}>
              {cameraError ? (
                <div className="camera-error-container">
                  <div className="camera-error-icon">!</div>
                  <h4 className="camera-error-title">Camera Unavailable</h4>
                  <p className="camera-error-msg">{cameraError}</p>
                  <Button variant="outline" size="sm" onClick={() => void startCamera()}>
                    Retry Camera
                  </Button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Staff face enrollment preview"
                    className="camera-preview-video"
                  />
                  <div className="camera-guide-overlay">
                    <div className="camera-guide-oval" />
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
              <Button variant="outline" onClick={handleCloseEnrollment} disabled={isEnrollingFace}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!isReady || !!cameraError}
                isLoading={isEnrollingFace}
                onClick={() => void handleCaptureAndEnrollFace()}
              >
                {isEnrollingFace ? "Enrolling Face..." : "Capture & Enroll Profile"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default StaffPage;
