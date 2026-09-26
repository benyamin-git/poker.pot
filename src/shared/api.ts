import type { Session } from "../domain";

export interface SetupStatus {
  configured: boolean;
  dataDir: string | null;
}

export interface SessionSummary {
  id: string;
  name: string;
  status: Session["status"];
  createdAt: string;
  updatedAt: string;
  matchCount: number;
  balances: Record<string, number>;
}

export interface ApiError {
  error: string;
  code: string;
}

export interface SetupRequest {
  dataDir: string;
}
