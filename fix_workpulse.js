import fs from 'fs';

let code = fs.readFileSync('src/features/employee/EmployeeDashboard.tsx', 'utf8');

const startIndex = code.indexOf("if (activeView === 'workpulse') {");
const firstReturnIndex = code.indexOf('return (', startIndex);
const endOfWorkPulseIndex = code.indexOf('  }\n\n  return (\n    <div', firstReturnIndex);

if (startIndex === -1 || firstReturnIndex === -1 || endOfWorkPulseIndex === -1) {
  console.log("Could not find blocks");
  process.exit(1);
}

// Find the last </div> before the endOfWorkPulseIndex
const workpulseDivEnd = code.lastIndexOf('</div>', endOfWorkPulseIndex);
// The JSX starts at the first <div after firstReturnIndex
const workpulseDivStart = code.indexOf('<div', firstReturnIndex);

const workPulseJSX = code.slice(workpulseDivStart, workpulseDivEnd + 6);

// Remove the if statement block
code = code.substring(0, startIndex) + code.substring(endOfWorkPulseIndex + 4);

const dashboardReturnStart = code.indexOf('return (\n    <div className="flex flex-col gap-5 pb-8 text-white">', startIndex);
const dashboardReturnJSXStart = code.indexOf('<div', dashboardReturnStart);

const dashboardEndIndex = code.lastIndexOf(');');
const dashboardJSXEnd = code.lastIndexOf('</div>', dashboardEndIndex) + 6;

const dashboardJSX = code.slice(dashboardReturnJSXStart, dashboardJSXEnd);

const newReturn = `return (
    <>
      ${dashboardJSX}

      <AnimatePresence>
        {activeView === 'workpulse' && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 bg-[#170B38] overflow-y-auto"
          >
            <div className="container mx-auto p-4 max-w-3xl">
              ${workPulseJSX}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );`;

code = code.substring(0, dashboardReturnStart) + newReturn + code.substring(dashboardEndIndex + 2);
fs.writeFileSync('src/features/employee/EmployeeDashboard.tsx', code);
console.log("Done");
