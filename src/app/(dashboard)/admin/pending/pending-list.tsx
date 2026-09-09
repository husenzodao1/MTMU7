"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { approveUserAction, rejectUserAction } from "./actions";
import { Check, X, UserPlus } from "lucide-react";

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
}: {
  requests: PendingRequest[];
  roles?: AvailableRole[];
  classes?: AvailableClass[];
}) {
  const t = useTranslations("admin");
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [, approveAction, isApproving] = useActionState(approveUserAction, {
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
          <Card key={req.id} className="overflow-hidden rounded-[24px] border border-neutral-200/70 bg-white/95 shadow-card transition-all hover:shadow-md">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 text-neutral-800 font-bold shadow-2xs">
                  {req.avatarUrl ? (
                    <img src={req.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span>
                      {req.firstName[0]}{req.lastName[0]}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-sm text-neutral-900 tracking-tight">
                    {req.firstName} {req.lastName}
                    {req.middleName ? ` ${req.middleName}` : ""}
                  </p>
                  <p className="truncate text-xs font-medium text-neutral-400">{req.email}</p>
                </div>
              </div>

              <div className="mb-4 space-y-2 rounded-xl bg-[#F8FAFD]/80 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-500">{t("requestedRole")}</span>
                  <Badge variant="pill" className="text-[10px] font-bold">{req.requestedRoleName}</Badge>
                </div>
                {req.requestedClassName && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-neutral-500">{t("requestedClass")}</span>
                    <span className="font-bold text-neutral-800">{req.requestedClassName}</span>
                  </div>
                )}
                {req.enrollmentYear && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-neutral-500">{t("enrollmentYear")}</span>
                    <span className="font-bold text-neutral-800">{req.enrollmentYear}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-neutral-100 pt-1.5">
                  <span className="font-medium text-neutral-400">{t("registrationDate")}</span>
                  <span className="font-medium text-neutral-600">
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
                    variant="default"
                    className="w-full font-bold"
                    loading={isApproving}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    {t("approveUser")}
                  </Button>
                </form>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setRejectDialogId(req.id)}
                  className="font-bold"
                >
                  <X className="mr-1 h-3.5 w-3.5" />
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
