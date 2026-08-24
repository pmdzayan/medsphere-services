import type { Metadata } from 'next';
import { LoginPageContent } from './login-page-content';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return <LoginPageContent />;
}
