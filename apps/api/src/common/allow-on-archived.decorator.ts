import { SetMetadata } from "@nestjs/common";

export const ALLOW_ON_ARCHIVED_KEY = "allowOnArchived";

/** Opts a route out of the archived-project write block (rename, restore, member admin). */
export const AllowOnArchived = () => SetMetadata(ALLOW_ON_ARCHIVED_KEY, true);
