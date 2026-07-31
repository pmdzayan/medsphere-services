import type { Metadata } from 'next';
import { TeamAccessWorkspace } from '@/features/authorization/team-access-workspace';

export const metadata: Metadata = { title: 'Team & access' };

export default function TeamAccessPage() {
  return <TeamAccessWorkspace />;
}
