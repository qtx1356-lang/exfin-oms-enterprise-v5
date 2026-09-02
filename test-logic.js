const testCases = [
  { name: "TEST 1", scores: [100, 30, 30, 30] },
  { name: "TEST 2", scores: [90, 80, 75, 60, 30, 20] },
  { name: "TEST 3", scores: [90, 80, 75] },
  { name: "TEST 4", scores: [50, 40, 30, 20] },
  { name: "TEST 5", scores: [60, 60, 59, 59] },
  { name: "TEST 6", scores: [100] },
  { name: "TEST 7", scores: [30] },
  { name: "TEST 8", scores: [100, 95, 90, 85, 80, 75, 60, 30] },
];

for (const tc of testCases) {
  const evaluatedForStats = tc.scores.map((score, i) => ({
    efficiency: score,
    empCode: 'E' + String(i).padStart(3, '0')
  }));

  const topPerformerCandidates = evaluatedForStats
    .filter(e => e.efficiency >= 60)
    .sort((a, b) => {
      if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
      return a.empCode.localeCompare(b.empCode);
    });
  const topPerformers = topPerformerCandidates.slice(0, 5);

  const improvementCandidates = evaluatedForStats
    .filter(e => e.efficiency < 60)
    .sort((a, b) => {
      if (a.efficiency !== b.efficiency) return a.efficiency - b.efficiency;
      return a.empCode.localeCompare(b.empCode);
    });
  const bottomPerformers = improvementCandidates.slice(0, 5);

  // validations
  const overlap = topPerformers.filter(top => bottomPerformers.some(bottom => bottom.empCode === top.empCode));
  if (overlap.length > 0) throw new Error("Overlap");
  const invalidTop = topPerformers.filter(e => e.efficiency < 60);
  if (invalidTop.length > 0) throw new Error("Invalid Top");
  const invalidBot = bottomPerformers.filter(e => e.efficiency >= 60);
  if (invalidBot.length > 0) throw new Error("Invalid Bot");
  
  const hasBelowThresholdEmployees = evaluatedForStats.some(e => e.efficiency < 60);
  if (bottomPerformers.length === 0 && hasBelowThresholdEmployees) {
    throw new Error("Employees below 60 exist but Needs Improvement is empty.");
  }
  
  const topMsg = evaluatedForStats.length > 0 
    ? `No qualifying top performers (all evaluated employees scored below 60%).`
    : `No performance records available`;
  
  const botMsg = evaluatedForStats.length > 0
    ? `No improvement records needed (All performers scored &ge; 60%)`
    : `No improvement records available`;

  console.log(tc.name + " (" + tc.scores.join(", ") + "):");
  console.log("  Top:", topPerformers.map(e => e.efficiency).join(", ") || "(empty) " + topMsg);
  console.log("  Bot:", bottomPerformers.map(e => e.efficiency).join(", ") || "(empty) " + botMsg);
  console.log("");
}
