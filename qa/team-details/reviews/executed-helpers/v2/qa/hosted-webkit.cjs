"use strict";
// Genuine official Linux WebKit, strict TLS, and a per-run workspace library
// search path. This never installs packages or changes system certificate trust.
const { webkit } = require("playwright");
const { runQA, VIEWPORTS } = require("./run.cjs");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const base = "https://dinkyjunior.github.io/project-dollers/";
const outputDir = path.join(__dirname, "hosted", "webkit");
const runtimeRoot = process.env.PD_QA_WEBKIT_RUNTIME || "/workspace/.onboarding/webkit-runtime";
const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || "/workspace/.onboarding/playwright-browsers";
const officialDirectory = path.join(cacheRoot, path.basename(path.dirname(webkit.executablePath())));
const wpe = path.join(officialDirectory, "minibrowser-wpe");
const executable = path.join(wpe, "bin", "MiniBrowser");
const ca = process.env.PD_QA_CA_FILE || "/usr/local/share/ca-certificates/environment-proxy-ca.crt";
const packageProof = path.join(runtimeRoot, "package-verification.json");
function redact(message) {
  let text = String(message);
  const raw = process.env.HTTPS_PROXY;
  if (!raw) return text;
  const values = [raw];
  try {
    const url = new URL(raw);
    for (const value of [url.username, url.password]) if (value) {
      values.push(value); try { values.push(decodeURIComponent(value)); } catch {}
    }
  } catch {}
  for (const value of [...new Set(values)].sort((a,b)=>b.length-a.length)) text = text.split(value).join("[environment-proxy]");
  return text;
}
function proxyOptions() {
  const raw = process.env.HTTPS_PROXY;
  if (!raw) return undefined;
  try {
    const url = new URL(raw), options = {server:`${url.protocol}//${url.host}`};
    if (url.username) options.username = decodeURIComponent(url.username);
    if (url.password) options.password = decodeURIComponent(url.password);
    return options;
  } catch { throw new Error("The environment HTTPS_PROXY configuration is invalid; its value is not logged."); }
}
function redactEvidence(value) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactEvidence);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,redactEvidence(item)]));
  return value;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(executable) || !fs.existsSync(packageProof) || !fs.existsSync(ca)) {
    throw new Error("Official WebKit, workspace-verified distro libraries, and the supplied CA must be prepared first. See qa/hosted/webkit/RUNTIME_SETUP.md.");
  }
  const proof = JSON.parse(fs.readFileSync(packageProof, "utf8"));
  if (!proof.packages?.length || !proof.packages.every(item => item.signedIndexChecksumMatched))
    throw new Error("Workspace library provenance is incomplete; do not run the engine with unverified libraries.");
  const env = {
    ...process.env,
    LD_LIBRARY_PATH: [path.join(runtimeRoot, "root", "usr", "lib", "x86_64-linux-gnu"), path.join(wpe, "lib"), path.join(wpe, "sys", "lib")].join(path.delimiter),
    WEBKIT_EXEC_PATH: path.join(wpe, "bin"),
    WEBKIT_INJECTED_BUNDLE_PATH: path.join(wpe, "lib"),
    WEBKIT_FORCE_COMPLEX_TEXT: "1",
    SSL_CERT_FILE: ca,
    G_TLS_CA_FILE: ca,
  };
  let browser;
  const qualification = {
    engine: "Official Playwright WebKit 26.0 build 2248, Linux WPE",
    officialBinary: executable,
    viewports: VIEWPORTS.slice(0, 2), deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    scope: "Genuine WebKit with mobile viewport/DPR/touch support; this does not reproduce physical iPhone hardware or Safari browser controls.",
    tls: { ignoreHTTPSErrors: false, hostnameVerificationEnabled: true, providedCASha256: crypto.createHash("sha256").update(fs.readFileSync(ca)).digest("hex"), providedCAPerRunEnvironmentOnly: true, globalTrustModified: false },
    libraries: { workspaceOnly: true, signedDistroPackages: proof.packages.length, packageProof: "package-verification.json", systemInstallPerformed: false },
    sourceDelivery: "Baseline application/data/assets load from the exact hosted URL. Separately labelled recovery checks deliberately intercept requests only in their isolated contexts.",
    launchMethod: "Exact official WPE binary with the equivalent bundle environment; no sandbox-disabling flags",
  };
  try {
    browser = await webkit.launch({
      headless: true, executablePath: executable, env,
      proxy: proxyOptions(),
    });
    qualification.version = browser.version();
    fs.writeFileSync(path.join(outputDir, "engine-and-tls.json"), JSON.stringify(qualification, null, 2) + "\n");
    fs.copyFileSync(packageProof, path.join(outputDir, "package-verification.json"));
    await runQA({
      base, outputDir, browser, viewports: VIEWPORTS.slice(0, 2),
      mode: "Actual hosted URL; genuine WebKit 26.0; strict TLS using the supplied CA per run; verified workspace libraries; native isMobile/touch/DPR2; external runtime requests blocked",
    });
    fs.rmSync(path.join(outputDir, "failure.json"), { force: true });
    console.log("WEBKIT FULL HOSTED QA PASSED at 393x852 and 430x896.");
  } catch (error) {
    fs.writeFileSync(path.join(outputDir, "failure.json"), JSON.stringify({ status: "failed", checkedAt: new Date().toISOString(), base, ...redactEvidence(error.qaEvidence), message: redact(error.message) }, null, 2) + "\n");
    throw error;
  } finally {
    if (browser) await browser.close();
    const reportPath = path.join(outputDir, "results.json");
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      report.engineQualification = qualification;
      for (const result of report.results || []) if (result.performance)
        result.performance.context = "Actual hosted WebKit in a cloud container, mobile viewport/DPR2/touch; not a physical iPhone performance measurement.";
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    }
  }
}

if (require.main === module) {
  if (process.argv.includes("--help")) console.log("Run strict hosted mobile WebKit QA: node qa/hosted-webkit.cjs\nRequires the official Playwright browser and verified workspace-only distro libraries. See qa/hosted/webkit/RUNTIME_SETUP.md.\nOptional paths: PLAYWRIGHT_BROWSERS_PATH, PD_QA_WEBKIT_RUNTIME, PD_QA_CA_FILE.");
  else main().catch(error => { console.error(redact(error.stack)); process.exitCode = 1; });
}
module.exports = { main, proxyOptions, redact };
