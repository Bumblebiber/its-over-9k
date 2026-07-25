import { teamUpModuleUrl } from "./team-up-adapter.mjs";

/** Load a team-up engine ESM module (requires TEAM_UP_BIN or TEAM_UP_ROOT). */
export async function importTeamUp(rel, env = process.env) {
  return import(teamUpModuleUrl(rel, env));
}
