import { openWebWorkspace } from "../workspace/openWebWorkspace";
import type { StoredResume } from "@/infrastructure/storage/storage";
import type { TailorContext } from "./types";

/** Web resume creation starts with cloud templates, never local form data. */
export async function openWebTailorWorkspace(
  _context: TailorContext, _sourceResume: StoredResume, _applicationId?: string
): Promise<void> {
  openWebWorkspace("/app/resumes");
}
