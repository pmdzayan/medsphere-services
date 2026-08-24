import type { Metadata } from 'next';
import { RegisterPageContent } from './register-page-content';

export const metadata: Metadata = { title: 'Request access' };

export default function RegisterPage() {
  return <RegisterPageContent />;
}
