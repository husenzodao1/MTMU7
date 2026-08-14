import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ step?: string }>;
}) {
  const searchParams = await props.searchParams;
  const initialStep = searchParams.step === "update" ? ("new-password" as const) : ("email" as const);

  return <ResetForm initialStep={initialStep} />;
}
