import type { PersonalProfile } from "@offerflow/domain";

export interface ProfileResponse {
  profile: PersonalProfile;
  revision: number;
}
