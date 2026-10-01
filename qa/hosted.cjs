"use strict";
/* Verify the real published URL with the same current-data and interaction core.
   An HTTP/access failure is saved explicitly and is never reported as deploy success. */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { runQA, launchChromium, VIEWPORTS } = require("./run.cjs");
const base = process.env.HOSTED_QA_URL || "https://dinkyjunior.github.io/project-dollers/";
const outputDir = path.join(__dirname, "hosted");
(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await launchChromium();
  try {
    await runQA({ base, outputDir, browser, viewports: VIEWPORTS.slice(0,2), mode: `Actual hosted website ${base}; external runtime requests blocked` });
    console.log(`HOSTED PASS: ${base} loaded the committed current dataset; both mobile sizes and all interactions verified.`);
  } catch (error) {
    // Standard same-URL HTTP request records the environment's transport response;
    // it does not bypass the proxy or turn an inaccessible website into a pass.
    const probe = spawnSync("curl", ["-sS", "-I", "--connect-timeout", "10", "--max-time", "15", base], { encoding: "utf8", timeout: 20000 });
    const transportProbe = { checkedAt: new Date().toISOString(), method: "HEAD", url: base, exitCode: probe.status, headers: probe.stdout || "", error: probe.stderr || probe.error?.message || "" };
    fs.writeFileSync(path.join(outputDir, "failure.json"), JSON.stringify({ status: "failed", checkedAt: new Date().toISOString(), base, transportProbe, ...error.qaEvidence, message: error.message }, null, 2) + "\n");
    console.error(`HOSTED VERIFICATION FAILED: ${error.message}. Evidence saved in qa/hosted/. Deployment is not confirmed.`);
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
