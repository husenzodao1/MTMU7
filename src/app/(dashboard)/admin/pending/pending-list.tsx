"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { approveUserAction, rejectUserAction } from "./actions";
import { Check, X, UserPlus, Clock } from "lucide-react";

interface PendingRequest {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  avatarUrl: string | null;
  requestedRoleId: string;
  requestedRoleName: string;
  requestedClassName: string | null;
  requestedClassId: string | null;
  enrollmentYear: number | null;
  createdAt: string;
}

interface AvailableRole {
  id: string;
  nameTg: string;
  slug: string;
}

interface AvailableClass {
  id: string;
  name: string;
}

export function PendingList({
  requests,
  roles,
  classes,
}: {
  requests: PendingRequest[];
  roles: AvailableRole[];
  classes: AvailableClass[];
}) {
  const t = useTranslations("admin");
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [approveState, approveAction, isApproving] = useActionState(approveUserAction, {
    error: null,
    success: false,
  });
  const [rejectState, rejectAction, isRejecting] = useActionState(rejectUserAction, {
    error: null,
    success: false,
  });

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<UserPlus className="h-12 w-12" />}
        title={t("noPendingUsers")}
        description={t("noPendingUsersDesc")}
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {requests.map((req) => (
          <Card key={req.id}>
            <CardContent className="p-4">
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100">
                  {req.avatarUrl ? (
                    <img src={req.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-primary-700">
                      {req.firstName[0]}{req.lastName[0]}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-neutral-900">
                    {req.firstName} {req.lastName}
                    {req.middleName ? ` ${req.middleName}` : ""}
                  </p>
                  <p className="truncate text-xs text-neutral-500">{req.email}</p>
                </div>
              </div>

              <div className="mb-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t("requestedRole")}</span>
                  <Badge variant="secondary">{req.requestedRoleName}</Badge>
                </div>
                {req.requestedClassName && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t("requestedClass")}</span>
                    <span className="text-neutral-700">{req.requestedClassName}</span>
                  </div>
                )}
                {req.enrollmentYear && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t("enrollmentYear")}</span>
                    <span className="text-neutral-700">{req.enrollmentYear}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t("registrationDate")}</span>
                  <span className="text-neutral-700">
                    {new Date(req.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <form action={approveAction} className="flex-1">
                  <input type="hidden" name="requestId" value={req.id} />
                  <input type="hidden" name="roleId" value={req.requestedRoleId} />
                  {req.requestedClassId && (
                    <input type="hidden" name="classId" value={req.requestedClassId} />
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    className="w-full"
                    loading={isApproving}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    {t("approveUser")}
                  </Button>
                </form>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setRejectDialogId(req.id)}
                >
                  <X className="mr-1 h-3 w-3" />
                  {t("rejectUser")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialogId} onOpenChange={() => setRejectDialogId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectUser")}</DialogTitle>
          </DialogHeader>
          <form action={rejectAction} className="space-y-4">
            <input type="hidden" name="requestId" value={rejectDialogId ?? ""} />
            <div className="space-y-2">
              <label htmlFor="reason" className="text-sm font-medium text-neutral-700">
                {t("rejectionReason")}
              </label>
              <textarea
                id="reason"
                name="reason"
                required
                rows={3}
                placeholder={t("rejectionReasonPlaceholder")}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            {rejectState.error && (
              <p className="text-sm text-error-600">{rejectState.error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRejectDialogId(null)}>
                {t("cancel" as never) ?? "Cancel"}
              </Button>
              <Button type="submit" variant="destructive" loading={isRejecting}>
                {t("rejectUser")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
