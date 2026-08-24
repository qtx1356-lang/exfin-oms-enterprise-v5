let todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const record = { date: todayStr };
console.log("record.date:", record.date);
console.log("todayStr:", todayStr);
console.log("record.date >= todayStr:", record.date >= todayStr);
