import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccountForm } from "@/features/accounts/account-form";
import { AccountSecurity } from "@/features/accounts/account-security";
import { gradeLimits, loadDetails, myHomeroomClasses } from "@/features/accounts/queries";
import { Avatar } from "@/components/ui/misc";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { requireAccess } from "@/lib/auth/guards";

export const metadata: Metadata = { robots: { index: false } };

export default async function MyClassPupilPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireAccess();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const classes = await myHomeroomClasses(access);
  const details = classes.length ? await loadDetails(id) : null;
  // Only pupils of their own class: anybody else is simply not here.
  if (!details || !details.can_edit || !details.student || !classes.some((c) => c.value === details.student!.class_id)) notFound();

  const t = await getTranslations("accounts");
  const limits = await gradeLimits(access.school!.id);
  const name = [details.last_name, details.first_name, details.middle_name].filter(Boolean).join(" ");

  return (
    <>
      <PageHeader title={name} description={`${details.public_id} · ${details.student.class_name ?? ""}`} />
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardBody className="flex items-center gap-4">
            <Avatar name={`${details.first_name} ${details.last_name}`} src={details.avatar_url} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink">{name}</p>
              <p className="truncate text-sm text-ink-muted"><span className="font-mono">{details.public_id}</span>{details.nickname ? ` · @${details.nickname}` : ""}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("sections.security")} />
          <CardBody>
            <AccountSecurity
              userId={details.id}
              name={name}
              mfa={details.mfa}
              canResetPassword
              canResetTwoFactor={false}
              offerTelegram={details.student.parent_managed}
            />
          </CardBody>
        </Card>
      </div>
      <AccountForm
        details={details}
        basePath="/my-class"
        allowedKinds={["student"]}
        classes={classes}
        parentRequiredMaxGrade={limits.required}
        parentManagedMaxGrade={limits.managed}
      />
    </>
  );
}
