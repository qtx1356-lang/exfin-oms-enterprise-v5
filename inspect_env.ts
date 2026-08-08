console.log("Environment keys:");
for (const key of Object.keys(process.env)) {
  console.log(` - ${key}: length ${process.env[key]?.length}`);
}
