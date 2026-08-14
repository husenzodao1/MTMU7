import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { NewConversationForm } from "./new-conversation-form";

export default async function NewConversationPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl py-8">
      <NewConversationForm />
    </div>
  );
}
