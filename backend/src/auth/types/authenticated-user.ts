export interface AuthenticatedRequestUser {
  sub: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}
