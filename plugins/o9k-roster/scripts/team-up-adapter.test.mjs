import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamUpArgv,
  missingTeamUpMessage,
  runTeamUpCli,
} from "./team-up-adapter.mjs";

test("buildTeamUpArgv maps roster pick", () => {
  const fakeBin = "/tmp/fake-team-up";
  assert.deepEqual(
    buildTeamUpArgv("roster", ["pick", "--role", "reviewer"], { TEAM_UP_BIN: fakeBin }),
    [fakeBin, "pick", "--role", "reviewer"]
  );
});

test("buildTeamUpArgv maps runs wait", () => {
  const fakeBin = "/tmp/fake-team-up";
  assert.deepEqual(
    buildTeamUpArgv("runs", ["wait", "run-1"], { TEAM_UP_BIN: fakeBin }),
    [fakeBin, "runs", "wait", "run-1"]
  );
});

test("missing binary prints actionable error and exits nonzero", () => {
  const lines = [];
  const code = runTeamUpCli("roster", ["pick", "--role", "x"], {
    env: { TEAM_UP_BIN: "/no/such/team-up-bin-xyz", PATH: "" },
    spawn: () => ({ status: 0 }),
    stdio: "pipe",
  });
  // assertTeamUpAvailable fails before spawn when file missing
  assert.equal(code, 1);
  assert.match(missingTeamUpMessage(), /TEAM_UP_BIN/);
});

test("resolveTeamUpBin prefers TEAM_UP_BIN then TEAM_UP_ROOT then PATH", async () => {
  const { resolveTeamUpBin, resolveTeamUpRoot } = await import("./team-up-adapter.mjs");
  assert.equal(
    resolveTeamUpBin({ TEAM_UP_BIN: "/explicit/bin/team-up.mjs", TEAM_UP_ROOT: "/other" }),
    "/explicit/bin/team-up.mjs"
  );
  const root = "/home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up";
  assert.equal(
    resolveTeamUpBin({ TEAM_UP_ROOT: root, PATH: "" }),
    `${root}/bin/team-up.mjs`
  );
  assert.equal(resolveTeamUpBin({ PATH: "" }), "team-up");
  assert.equal(
    resolveTeamUpRoot({ TEAM_UP_BIN: `${root}/bin/team-up.mjs` }),
    root
  );
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("./team-up-adapter.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /task-team-up-mvp/);
});
