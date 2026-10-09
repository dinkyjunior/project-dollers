'use strict';

// The native HTMLDialogElement.close() event is asynchronous. A hidden dialog
// alone does not prove its genuine close handler has finished updating state.
// This read-only QA preload waits for that real completion before a snapshot;
// it neither changes application state nor removes any existing assertion.
const fs = require('node:fs');
const q = require('./qa.cjs');
const relativePath = 'qa/matchup-breakdown/settle-native-dialog-close.cjs';
const originalTests = q.tests;
const originalSemantic = q.semantic;

q.tests = function testsWithActualPreload() {
  return {...originalTests(), [relativePath]: q.SHA(fs.readFileSync(__filename))};
};

q.semantic = async function semanticAfterGenuineClose(page) {
  await page.waitForFunction(() => {
    const active = document.querySelector('.page.active');
    const dialog = document.querySelector('#matchup-breakdown-dialog');
    if (active?.dataset.page !== 'matchup-breakdown' || !dialog || dialog.open) return true;
    return window.MatchupBreakdown.getState().view === null;
  }, undefined, {timeout: 10000});
  return originalSemantic(page);
};

process.stdout.write('QA preload: await genuine closed-dialog view=null before semantic snapshots; all original assertions retained.\n');
