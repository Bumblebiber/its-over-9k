import assert from "node:assert/strict";
import { slugify } from "./slugify.mjs";

assert.equal(slugify("Hello World"), "hello-world");
assert.equal(slugify("  Leading and trailing  "), "leading-and-trailing");
assert.equal(slugify("Multiple---separators___here"), "multiple-separators-here");
assert.equal(slugify("Already-a-slug"), "already-a-slug");
assert.equal(slugify("Ends with punctuation!"), "ends-with-punctuation");
console.log("ok");
