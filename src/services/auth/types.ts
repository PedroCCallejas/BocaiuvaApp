import type {
  GoogleLoginInput,
  LoginInput,
  RegisterInput,
  RepositoryMode,
} from '@/services/repository/types';

export interface AuthSessionUser {
  authId: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface AuthService {
  getMode(): RepositoryMode;
  getCurrentUser(): AuthSessionUser | null;
  restoreSession(): Promise<AuthSessionUser | null>;
  subscribe(listener: (user: AuthSessionUser | null) => void): () => void;
  login(input: LoginInput): Promise<AuthSessionUser>;
  loginWithGoogle(input: GoogleLoginInput): Promise<AuthSessionUser>;
  register(input: RegisterInput): Promise<AuthSessionUser>;
  resetPassword(email: string): Promise<void>;
  logout(): Promise<void>;
}
