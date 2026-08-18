"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  changeUserRoleAction,
  blockUserAction,
  unblockUserAction,
  graduateUserAction,
  transferClassAction,
  editUserDataAction,
} from "./actions";
import {
  Shield,
  Ban,
  Unlock,
  GraduationCap,
  Edit3,
  ArrowLeftRight,
  Clock,
  History,
} from "lucide-react";

const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  approved: "success",
  active: "default",
  blocked: "destructive",
  graduated: "secondary",
  rejected: "destructive",
};

interface UserData {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  phone: string | null;
  isActive: boolean;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
  graduationYear: number | null;
  graduationDate: string | null;
  yearsInSchool: number | null;
  assignedRoles: Array<{ id: string; slug: string; nameTg: string; isSystem: boolean }>;
  currentClass: { id: string; name: string; academicYear: string } | null;
  approvalDate: string | null;
  enrollmentDate: string | null;
}

interface AvailableRole {
  id: string;
  slug: string;
  nameTg: string;
  level: number;
}

interface AvailableClass {
  id: string;
  name: string;
  gradeLevel: number;
}

interface AvailableYear {
  id: string;
  name: string;
}

interface EnrollmentEntry {
  id: string;
  enrolledAt: string;
  className: string;
  academicYear: string;
  enrolledBy: string;
}

interface StatusHistoryEntry {
  id: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  notes: string | null;
  createdAt: string;
  performedBy: string;
}

export function UserDetail({
  user,
  availableRoles,
  availableClasses,
  availableYears,
  enrollmentHistory,
  statusHistory,
  isSuperAdmin,
}: {
  user: UserData;
  availableRoles: AvailableRole[];
  availableClasses: AvailableClass[];
  availableYears: AvailableYear[];
  enrollmentHistory: EnrollmentEntry[];
  statusHistory: StatusHistoryEntry[];
  isSuperAdmin: boolean;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showGraduateDialog, setShowGraduateDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState(user.firstName);
  const [editLastName, setEditLastName] = useState(user.lastName);
  const [editMiddleName, setEditMiddleName] = useState(user.middleName ?? "");

  const [selectedRoleId, setSelectedRoleId] = useState(
    user.assignedRoles[0]?.id ?? ""
  );
  const [selectedClassId, setSelectedClassId] = useState(
    user.currentClass?.id ?? ""
  );

  const handleChangeRole = () => {
    if (!selectedRoleId) return;
    startTransition(async () => {
      await changeUserRoleAction(user.id, selectedRoleId);
      router.refresh();
    });
  };

  const handleBlock = () => {
    startTransition(async () => {
      await blockUserAction(user.id);
      router.refresh();
    });
  };

  const handleUnblock = () => {
    startTransition(async () => {
      await unblockUserAction(user.id);
      router.refresh();
    });
  };

  const handleGraduate = () => {
    startTransition(async () => {
      await graduateUserAction(user.id);
      router.refresh();
    });
  };

  const handleTransferClass = () => {
    if (!selectedClassId) return;
    startTransition(async () => {
      await transferClassAction(user.id, selectedClassId);
      router.refresh();
    });
  };

  const handleSaveEdit = () => {
    startTransition(async () => {
      await editUserDataAction(user.id, {
        firstName: editFirstName,
        lastName: editLastName,
        middleName: editMiddleName,
      });
      setIsEditing(false);
      router.refresh();
    });
  };

  const isStudent = user.assignedRoles.some((r) => r.slug === "student");

  return (
    <div className="space-y-6">
      {/* User Info + Dates */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("userDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-semibold text-primary-700">
                    {user.firstName[0]}{user.lastName[0]}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      placeholder={t("firstName" as never) ?? "First name"}
                    />
                    <Input
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      placeholder={t("lastName" as never) ?? "Last name"}
                    />
                    <Input
                      value={editMiddleName}
                      onChange={(e) => setEditMiddleName(e.target.value)}
                      placeholder={t("middleName" as never) ?? "Middle name"}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit} loading={isPending}>
                        {t("save" as never) ?? "Save"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                        {t("cancel" as never) ?? "Cancel"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-neutral-900">
                      {user.lastName} {user.firstName} {user.middleName ?? ""}
                    </p>
                    <p className="text-sm text-neutral-500">{user.email}</p>
                    <p className="font-mono text-xs text-neutral-400">{user.publicId}</p>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">{t("userStatus")}</span>
                <Badge variant={STATUS_VARIANTS[user.status] ?? "default"}>
                  {t(`userStatus_${user.status}`)}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">{t("roles")}</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {user.assignedRoles.map((role) => (
                    <Badge key={role.id} variant="secondary">{role.nameTg}</Badge>
                  ))}
                </div>
              </div>
              {user.currentClass && (
                <>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t("requestedClass")}</span>
                    <span className="text-neutral-700">{user.currentClass.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t("academicYear" as never) ?? "Academic year"}</span>
                    <span className="text-neutral-700">{user.currentClass.academicYear}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Dates Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t("dates" as never) ?? "Dates"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("registrationDate")}</span>
              <span className="text-neutral-700">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
            {user.approvalDate && (
              <div className="flex justify-between">
                <span className="text-neutral-500">{t("approvalDate")}</span>
                <span className="text-neutral-700">
                  {new Date(user.approvalDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {user.enrollmentDate && (
              <div className="flex justify-between">
                <span className="text-neutral-500">{t("enrollmentDate")}</span>
                <span className="text-neutral-700">
                  {new Date(user.enrollmentDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {user.graduationDate && (
              <div className="flex justify-between">
                <span className="text-neutral-500">{t("graduationDate" as never) ?? "Graduation date"}</span>
                <span className="text-neutral-700">
                  {new Date(user.graduationDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {user.graduationYear && (
              <div className="flex justify-between">
                <span className="text-neutral-500">{t("graduationYear" as never) ?? "Graduation year"}</span>
                <span className="text-neutral-700">{user.graduationYear}</span>
              </div>
            )}
            {user.yearsInSchool && (
              <div className="flex justify-between">
                <span className="text-neutral-500">{t("yearsInSchool" as never) ?? "Years in school"}</span>
                <span className="text-neutral-700">{user.yearsInSchool}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Super Admin Actions */}
      {isSuperAdmin && user.status !== "graduated" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {t("superAdminActions" as never) ?? "Management Actions"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {/* Edit Data */}
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit3 className="mr-1 h-3 w-3" />
                  {t("editData")}
                </Button>
              )}

              {/* Block / Unblock */}
              {user.status === "blocked" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnblock}
                  loading={isPending}
                >
                  <Unlock className="mr-1 h-3 w-3" />
                  {t("unblockUser")}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowBlockDialog(true)}
                >
                  <Ban className="mr-1 h-3 w-3" />
                  {t("blockUser")}
                </Button>
              )}

              {/* Graduate (students only, active status) */}
              {isStudent && user.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGraduateDialog(true)}
                >
                  <GraduationCap className="mr-1 h-3 w-3" />
                  {t("graduateUser" as never) ?? "Graduate"}
                </Button>
              )}
            </div>

            {/* Change Role */}
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium text-neutral-700">
                  {t("changeRole" as never) ?? "Change role"}
                </label>
                <select
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                >
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.id}>{r.nameTg}</option>
                  ))}
                </select>
              </div>
              <Button size="sm" onClick={handleChangeRole} loading={isPending}>
                <ArrowLeftRight className="mr-1 h-3 w-3" />
                {t("changeRole" as never) ?? "Change"}
              </Button>
            </div>

            {/* Transfer Class (students) */}
            {isStudent && availableClasses.length > 0 && (
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-sm font-medium text-neutral-700">
                    {t("changeClass" as never) ?? "Change class"}
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">{t("selectClass" as never) ?? "Select class"}</option>
                    {availableClasses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <Button size="sm" onClick={handleTransferClass} loading={isPending}>
                  <ArrowLeftRight className="mr-1 h-3 w-3" />
                  {t("changeClass" as never) ?? "Transfer"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enrollment History */}
      {enrollmentHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              {t("enrollmentHistory")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {enrollmentHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-100 p-3"
                >
                  <div>
                    <p className="font-medium text-neutral-800">{entry.className}</p>
                    <p className="text-xs text-neutral-500">{entry.academicYear}</p>
                  </div>
                  <div className="text-right text-xs text-neutral-500">
                    <p>{new Date(entry.enrolledAt).toLocaleDateString()}</p>
                    {entry.enrolledBy && <p>{entry.enrolledBy}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status History */}
      {statusHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              {t("changeHistory")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statusHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-neutral-100 p-3"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{entry.action}</Badge>
                    <span className="text-xs text-neutral-500">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {(entry.oldValue || entry.newValue) && (
                    <p className="mt-1 text-sm text-neutral-600">
                      {entry.oldValue && <span className="text-neutral-400">{entry.oldValue}</span>}
                      {entry.oldValue && entry.newValue && " → "}
                      {entry.newValue && <span className="font-medium">{entry.newValue}</span>}
                    </p>
                  )}
                  {entry.notes && (
                    <p className="mt-1 text-xs text-neutral-500">{entry.notes}</p>
                  )}
                  {entry.performedBy && (
                    <p className="mt-1 text-xs text-neutral-400">{entry.performedBy}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={showBlockDialog}
        onOpenChange={setShowBlockDialog}
        title={t("confirmBlock")}
        description={t("confirmBlockMessage", { name: `${user.firstName} ${user.lastName}` } as never) ?? `Are you sure you want to block ${user.firstName} ${user.lastName}?`}
        confirmLabel={t("blockUser")}
        variant="destructive"
        onConfirm={handleBlock}
      />

      <ConfirmDialog
        open={showGraduateDialog}
        onOpenChange={setShowGraduateDialog}
        title={t("confirmGraduate")}
        description={t("confirmGraduateMessage", { name: `${user.firstName} ${user.lastName}` } as never) ?? `Are you sure you want to graduate ${user.firstName} ${user.lastName}?`}
        confirmLabel={t("graduateUser" as never) ?? "Graduate"}
        variant="destructive"
        onConfirm={handleGraduate}
      />
    </div>
  );
}
