const fs = require('fs');

let code = fs.readFileSync('src/features/attendance/AttendanceScreen.tsx', 'utf8');

// 1. Update handleManualCheckOut
const handleManualCheckOutOld = `  // Office Check-Out Handler
  const handleManualCheckOut = () => {
    if (!todayRecord) return;
    if (!liveLocation) {
      setActionFeedback('Live GPS location required for check-out.');
      return;
    }
    try {
      const updated = performCheckOut(
        todayRecord,
        liveLocation,
        currentAddress || 'Raniganj HQ'
      );
      refreshRecords();
      setActionFeedback(\`Manual Check-Out Successful at \${updated.checkOutTime}\`);
    } catch (err: any) {
      setActionFeedback(\`Check-Out Error: \${err.message}\`);
    }
  };`;

const handleManualCheckOutNew = `  // Office Check-Out Handler
  const handleManualCheckOut = () => {
    if (!todayRecord) return;
    if (!liveLocation) {
      setActionFeedback('Live GPS location required for check-out.');
      return;
    }

    // FINAL GEOLOCATION VERIFICATION FOR RACE CONDITIONS
    const currentDistance = getDistanceFromLatLonInM(
      liveLocation.latitude,
      liveLocation.longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );

    if (currentDistance > 25) {
      setActionFeedback('Checkout is only available inside the office premises.');
      return;
    }

    try {
      const updated = performCheckOut(
        todayRecord,
        liveLocation,
        currentAddress || 'Raniganj HQ'
      );
      refreshRecords();
      setActionFeedback(\`Manual Check-Out Successful at \${updated.checkOutTime}\`);
    } catch (err: any) {
      setActionFeedback(\`Check-Out Error: \${err.message}\`);
    }
  };`;

if (code.includes(handleManualCheckOutOld)) {
  code = code.replace(handleManualCheckOutOld, handleManualCheckOutNew);
  console.log("Updated handleManualCheckOut");
} else {
  console.log("Could not find handleManualCheckOut");
}

// 2. Remove Smart Checkout Reminder Banner
const bannerStartStr = `{/* Smart Checkout Reminder Banner */}`;
const startIndex = code.indexOf(bannerStartStr);
if (startIndex !== -1) {
  // Find where this banner ends.
  const endMarker = `              {/* MANUAL CHECK-IN & CHECK-OUT ACTION BUTTONS */}`;
  const endIndex = code.indexOf(endMarker, startIndex);
  if (endIndex !== -1) {
    code = code.substring(0, startIndex) + code.substring(endIndex);
    console.log("Removed Smart Checkout Reminder Banner");
  } else {
    console.log("Could not find end of banner");
  }
} else {
  console.log("Could not find banner start");
}

fs.writeFileSync('src/features/attendance/AttendanceScreen.tsx', code);
