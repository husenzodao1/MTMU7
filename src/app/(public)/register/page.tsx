import { RegisterForm } from "./register-form";
import { getAvailableRoles, getAvailableClasses, getAvailableSubjects } from "./data";

export default async function RegisterPage() {
  const [roles, classes, subjects] = await Promise.all([
    getAvailableRoles(),
    getAvailableClasses(),
    getAvailableSubjects(),
  ]);

  return <RegisterForm roles={roles} classes={classes} subjects={subjects} />;
}
