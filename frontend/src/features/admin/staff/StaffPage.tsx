import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import { useConfirm, useToast } from "../../../hooks";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Input,
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
import { CreateStaffModal } from "./CreateStaffModal";
import { ResetPinModal } from "./ResetPinModal";
import { EnrollFaceModal } from "./EnrollFaceModal";

export function StaffPage() {
  const [staffList, setStaffList] = useState<StaffAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resetTargetStaffId, setResetTargetStaffId] = useState<string | null>(null);
  const [enrollingStaff, setEnrollingStaff] = useState<StaffAccount | null>(null);

  // Edit Inline Profile State
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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
                          onClick={() => setEnrollingStaff(staff)}
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
                            onClick={() => setResetTargetStaffId(staff.staff_id)}
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

      {/* Modals */}
      <CreateStaffModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => void loadStaff()}
      />

      <ResetPinModal
        staffId={resetTargetStaffId}
        onClose={() => setResetTargetStaffId(null)}
        onSuccess={() => void loadStaff()}
      />

      <EnrollFaceModal
        staff={enrollingStaff}
        onClose={() => setEnrollingStaff(null)}
        onSuccess={() => void loadStaff()}
      />
    </div>
  );
}

export default StaffPage;
