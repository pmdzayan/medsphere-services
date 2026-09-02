import { authApiUrl } from './auth-api';
import { isWorkstationSessionState, type WorkstationSessionState } from './auth-contract';

/**
 * Task 0014: server-authoritative workstation state verification.
 *
 * Runs before protected platform UI is rendered. The refresh credential stays
 * server-side and is used only for the dedicated session-state boundary.
 */
export async function readServerWorkstationSessionState(
  refreshToken: string,
): Promise<WorkstationSessionState | null> {
  try {
    const response = await fetch(authApiUrl('/auth/session-state'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-locked-session-refresh': refreshToken,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    return isWorkstationSessionState(payload) ? payload : null;
  } catch {
    return null;
  }
}
