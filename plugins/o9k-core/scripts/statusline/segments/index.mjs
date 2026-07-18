import { renderModel } from "./model.mjs";
import { renderContext } from "./context.mjs";
import { renderGit } from "./git.mjs";
import { renderLimits } from "./limits.mjs";
import { renderTim } from "./tim.mjs";
import { renderDevice } from "./device.mjs";

const RENDERERS = {
  model: renderModel,
  context: renderContext,
  git: renderGit,
  limits: renderLimits,
  tim: renderTim,
  device: renderDevice,
};

export function renderSegment(key, canonical, opts = {}) {
  const fn = RENDERERS[key];
  if (!fn) return "";
  return fn(canonical, opts);
}
