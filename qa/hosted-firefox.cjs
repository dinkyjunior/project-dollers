"use strict";
/*
 * Strict-TLS QA of the real published site, using the unchanged shared suite.
 *
 * Run after synchronizing the production snapshot and completing local QA:
 *   PLAYWRIGHT_BROWSERS_PATH=/workspace/.onboarding/playwright-browsers \
 *   HOSTED_CA_FILE=/usr/local/share/ca-certificates/environment-proxy-ca.crt \
 *   node qa/hosted-firefox.cjs
 *
 * Output: qa/hosted/firefox/{results.json,engine-and-tls.json,*.png}.
 * Previous output is preserved under qa/hosted/firefox-archive/.
 * Official Playwright Firefox and certutil must already be installed.
 * The CA is optional; omit it where Firefox's normal roots suffice. The known
 * cloud-provided CA is used if present. It is imported only into fresh task
 * profiles under /workspace/.onboarding and every profile is removed finally.
 * No certificate-error exception, system trust change, or HOME rewrite occurs.
 *
 * This cloud's read-only UID namespace can prevent Firefox startup. Invoke this
 * fixed helper through the sanctioned scoped execution mechanism when needed;
 * it does not elevate itself or silently disable the browser process sandbox.
 * Firefox cannot implement Playwright isMobile: dimensions, DPR2 and touch are
 * retained explicitly, without claiming iPhone/Safari emulation.
 */
const { firefox } = require("playwright");
const { runQA, VIEWPORTS } = require("./run.cjs");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(__dirname, "hosted", "firefox");
const PROFILE_PARENT = "/workspace/.onboarding/browser-release-check";
const DEFAULT_CA = "/usr/local/share/ca-certificates/environment-proxy-ca.crt";
const DEFAULT_URL = "https://dinkyjunior.github.io/project-dollers/";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

function redact(message) {
  let text = String(message);
  const raw = process.env.HTTPS_PROXY;
  if (!raw) return text;
  const values = [raw];
  try {
    const url = new URL(raw);
    for (const value of [url.username, url.password]) {
      if (value) {
        values.push(value);
        try { values.push(decodeURIComponent(value)); } catch {}
      }
    }
  } catch {}
  for (const value of [...new Set(values)].sort((a, b) => b.length - a.length))
    text = text.split(value).join("[environment-proxy]");
  return text;
}

function redactEvidence(value) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactEvidence);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactEvidence(item)]));
  return value;
}

function safeError(error) {
  const result = new Error(redact(error?.message || error));
  result.name = error?.name || "Error";
  if (error?.stack) result.stack = redact(error.stack);
  if (error?.qaEvidence) result.qaEvidence = redactEvidence(error.qaEvidence);
  return result;
}

function proxyOptions() {
  const raw = process.env.HTTPS_PROXY;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const options = { server: `${url.protocol}//${url.host}` };
    if (url.username) options.username = decodeURIComponent(url.username);
    if (url.password) options.password = decodeURIComponent(url.password);
    return options;
  } catch {
    throw new Error("The environment HTTPS_PROXY configuration is invalid; its value is not logged.");
  }
}

function suppliedCA() {
  const explicit = process.env.HOSTED_CA_FILE;
  const candidate = explicit ? path.resolve(explicit) : DEFAULT_CA;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  if (explicit) throw new Error("HOSTED_CA_FILE must identify an existing CA certificate file.");
  return null;
}

function verificationHashes(runtimePaths, ca) {
  const files = [...new Set([...runtimePaths, "qa/run.cjs", "qa/hosted-firefox.cjs"])];
  const values = Object.fromEntries(files.map(file => [file, sha256(fs.readFileSync(path.join(ROOT, file)))]));
  if (ca) values.suppliedCACertificate = sha256(fs.readFileSync(ca));
  return values;
}

function archivePreviousOutput() {
  if (!fs.existsSync(OUTPUT)) return null;
  const entries = fs.readdirSync(OUTPUT);
  if (!entries.length) return null;
  const timestamp = new Date().toISOString().replace(/[^0-9TZ]/g, "");
  const parent = path.join(__dirname, "hosted", "firefox-archive");
  fs.mkdirSync(parent, { recursive: true });
  const target = path.join(parent, timestamp);
  fs.renameSync(OUTPUT, target);
  return path.relative(ROOT, target);
}

async function main() {
  const base = process.env.HOSTED_QA_URL || DEFAULT_URL;
  if (new URL(base).protocol !== "https:") throw new Error("Hosted Firefox QA requires an HTTPS URL.");
  const ca = suppliedCA();
  const proxy = proxyOptions();
  const localReport = readJson(path.join(__dirname, "results.json"));
  const runtimePaths = Object.keys(localReport.runtimeManifest || {});
  if (!runtimePaths.length) throw new Error("Complete local QA first so qa/results.json identifies the tested runtime files.");
  const hashesBefore = verificationHashes(runtimePaths, ca);
  const previousEvidence = archivePreviousOutput();
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.mkdirSync(PROFILE_PARENT, { recursive: true });
  const runRoot = fs.mkdtempSync(path.join(PROFILE_PARENT, "hosted-firefox-run-"));
  const cache = path.join(runRoot, "cache");
  fs.mkdirSync(cache);
  const contexts = new Set();
  let profileCount = 0, browserVersion, interrupted, thrown;

  const qualification = {
    engine: "Official Playwright Firefox",
    startedAt: new Date().toISOString(),
    base,
    output: "qa/hosted/firefox/",
    previousEvidence,
    viewports: VIEWPORTS.slice(0, 2),
    deviceScaleFactor: 2,
    touch: true,
    isMobile: false,
    isMobileReason: "Firefox does not support Playwright isMobile. This is mobile viewport/DPR/touch QA, not iPhone or Safari emulation.",
    tls: {
      ignoreHTTPSErrors: false,
      hostnameVerificationEnabled: true,
      providedCAUsed: !!ca,
      providedCASha256: ca ? hashesBefore.suppliedCACertificate : null,
      trustScope: ca ? "Fresh disposable task profiles only" : "Firefox normal certificate roots",
      globalTrustModified: false,
      homeRewritten: false
    },
    execution: {
      selfElevation: false,
      browserSandboxDisableFlags: [],
      processNamespaceNote: "This cloud may require sanctioned scoped execution because its read-only UID namespace prevents Firefox startup. The helper does not bypass that review."
    },
    sourceDelivery: "Baseline app/data/assets are fetched directly by the browser from the original hosted URL. Only separately labeled shared-suite recovery scenarios inject deliberate request failures.",
    hashesBefore
  };

  const adapter = {
    version: async () => {
      if (!browserVersion) {
        const context = await adapter.newContext({ viewport: VIEWPORTS[0], timezoneId: "Australia/Sydney" });
        try { browserVersion = context.browser()?.version(); }
        finally { await context.close(); }
        if (!browserVersion) throw new Error("Firefox did not expose its actual browser version.");
        qualification.browserVersion = browserVersion;
      }
      return browserVersion;
    },
    newContext: async options => {
      if (interrupted) throw new Error(`Hosted Firefox QA interrupted by ${interrupted}.`);
      const profile = fs.mkdtempSync(path.join(runRoot, "profile-"));
      profileCount++;
      let context;
      try {
        if (ca) {
          execFileSync("certutil", ["-N", "--empty-password", "-d", "sql:" + profile]);
          execFileSync("certutil", ["-A", "-d", "sql:" + profile, "-n", "Task-scoped environment CA", "-t", "C,,", "-i", ca]);
        }
        // Firefox rejects isMobile. Retain every supported shared-suite option.
        const { isMobile, ...supported } = options;
        context = await firefox.launchPersistentContext(profile, {
          ...supported,
          headless: true,
          ignoreHTTPSErrors: false,
          proxy,
          env: { ...process.env, XDG_CACHE_HOME: cache },
          timeout: 30000
        });
      } catch (error) {
        fs.rmSync(profile, { recursive: true, force: true });
        throw safeError(error);
      }
      contexts.add(context);
      const close = context.close.bind(context);
      context.close = async () => {
        try { await close(); }
        finally {
          contexts.delete(context);
          fs.rmSync(profile, { recursive: true, force: true });
        }
      };
      return context;
    },
    close: async () => {
      const settled = await Promise.allSettled([...contexts].map(context => context.close()));
      const rejection = settled.find(result => result.status === "rejected");
      if (rejection) throw rejection.reason;
    }
  };

  const onSignal = signal => {
    interrupted = signal;
    adapter.close().catch(() => {});
  };
  const onInterrupt = () => onSignal("SIGINT");
  const onTerminate = () => onSignal("SIGTERM");
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  fs.writeFileSync(path.join(OUTPUT, "engine-and-tls.json"), JSON.stringify(qualification, null, 2) + "\n");

  try {
    await runQA({
      base,
      outputDir: OUTPUT,
      browser: adapter,
      viewports: VIEWPORTS.slice(0, 2),
      mode: "Actual hosted HTTPS; official Firefox; strict TLS; task-only CA profiles; mobile viewport/DPR2/touch (Firefox isMobile unsupported); external runtime requests blocked"
    });
    if (interrupted) throw new Error(`Hosted Firefox QA interrupted by ${interrupted}.`);
  } catch (error) {
    thrown = safeError(error);
  } finally {
    try { await adapter.close(); }
    catch (error) { thrown ||= safeError(error); }
    fs.rmSync(runRoot, { recursive: true, force: true });
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
    qualification.completedAt = new Date().toISOString();
    qualification.disposableProfileCount = profileCount;
    qualification.allTaskProfilesRemoved = !fs.existsSync(runRoot);
    qualification.hashesAfter = verificationHashes(runtimePaths, ca);
    qualification.hashIntegrityPassed = JSON.stringify(qualification.hashesBefore) === JSON.stringify(qualification.hashesAfter);
    if (!qualification.hashIntegrityPassed) thrown ||= new Error("Runtime files, QA helper, shared harness, or supplied CA changed during hosted QA.");

    const reportPath = path.join(OUTPUT, "results.json");
    if (fs.existsSync(reportPath)) {
      const report = readJson(reportPath);
      report.engineQualification = qualification;
      if (report.failure) report.failure = redactEvidence(report.failure);
      // The shared RAF sampler's original label names Chromium. Preserve its
      // measurements and identify the engine that actually produced them.
      for (const result of report.results || []) {
        if (result.performance?.context) result.performance.context = "Hosted Firefox in cloud container; mobile viewport/DPR2/touch observation, not physical iPhone performance.";
      }
      if (thrown) {
        report.status = "failed";
        report.failure ||= { message: redact(thrown.message) };
      }
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    }
    fs.writeFileSync(path.join(OUTPUT, "engine-and-tls.json"), JSON.stringify(qualification, null, 2) + "\n");
    if (thrown) {
      fs.writeFileSync(path.join(OUTPUT, "failure.json"), JSON.stringify({ status: "failed", checkedAt: qualification.completedAt, base, ...redactEvidence(thrown.qaEvidence), message: redact(thrown.message) }, null, 2) + "\n");
    }
  }

  if (thrown) {
    console.error(`HOSTED FIREFOX QA FAILED: ${redact(thrown.message)}. Evidence: qa/hosted/firefox/.`);
    process.exitCode = interrupted === "SIGINT" ? 130 : interrupted === "SIGTERM" ? 143 : 1;
    return;
  }
  console.log("HOSTED FIREFOX QA PASSED at 393×852 and 430×896 with strict TLS. Evidence: qa/hosted/firefox/. Firefox mobile viewport/touch QA is not Safari/iPhone emulation.");
}

if (require.main === module) {
  if (process.argv.includes("--help")) {
    console.log("Run: PLAYWRIGHT_BROWSERS_PATH=/workspace/.onboarding/playwright-browsers HOSTED_CA_FILE=/usr/local/share/ca-certificates/environment-proxy-ca.crt node qa/hosted-firefox.cjs\nOutput: qa/hosted/firefox/; previous evidence: qa/hosted/firefox-archive/.\nRequires synchronized production data, local QA report, official Firefox, and certutil when using a supplied CA. Strict TLS remains enabled. Profiles are workspace-only and disposable; HOME/global trust are unchanged.\nFirefox supports the requested viewports, DPR2 and touch, but not Playwright isMobile/Safari emulation.\nIf the cloud blocks Firefox process startup, use the sanctioned scoped execution mechanism; this helper does not elevate itself or disable the process sandbox.");
  } else main().catch(error => { console.error(`HOSTED FIREFOX QA ERROR: ${redact(error.message)}`); process.exitCode = 1; });
}

module.exports = { main };
