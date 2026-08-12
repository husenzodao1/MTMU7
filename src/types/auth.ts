export interface UserProfile {
  id: string;
  schoolId: string;
  publicId: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface UserRole {
  id: string;
  slug: string;
  nameTg: string;
  nameRu: string | null;
  level: number;
  isSystem: boolean;
}

export interface UserWithRole extends UserProfile {
  roles: UserRole[];
}

export interface Permission {
  id: string;
  slug: string;
  module: string;
  action: string;
  nameTg: string;
  nameRu: string | null;
}
