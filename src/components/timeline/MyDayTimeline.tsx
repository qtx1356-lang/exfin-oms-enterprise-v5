import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  CheckCircle2, 
  MapPin, 
  CheckSquare, 
  Bell, 
  Calendar, 
  Briefcase, 
  LogOut, 
  AlertCircle,
  X,
  Sparkles,
  WifiOff
} from 'lucide-react';
import { Card } from '../ui/Card';
import { useRegistration } from '../../context/RegistrationContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import { getTodayAttendanceRecord, getStoredAttendanceRecords } from '../../services/attendance/attendanceStorage';
import { getStoredTasks } from '../../services/planner/taskStorage';
import { getStoredNotifications } from '../../services/notification/notificationStorage';
import { getStoredLeaves } from '../../services/leave/leaveStorage';

export type TimelineEventCategory = 'ATTENDANCE' | 'TASK' | 'NOTIFICATION' | 'LEAVE';

export interface TimelineEventItem {
  id: string;
  category: TimelineEventCategory;
  timeStr: string;
  timeMs: number;
  title: string;
  description: string;
  badgeLabel: string;
  badgeStyle: string;
  icon: React.ElementType;
  iconBg: string;
}

const parseTimeStringToMs = (timeStr: string, baseDate: Date = new Date()): number => {
  try {
    const match = timeStr.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
    if (!match) return baseDate.getTime();
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3];
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
    const d = new Date(baseDate);
    d.setHours(hours, minutes, 0, 0);
    return d.getTime();
  } catch {
    return baseDate.getTime();
  }
};

const formatIsoToTimeStr = (isoStr?: string): string => {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
};

const getKolkataDateFromIso = (isoStr?: string | null): string => {
  if (!isoStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
    return isoStr;
  }
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch {
    return '';
  }
};

export const MyDayTimeline: React.FC = () => {
  const { employeeData } = useRegistration();
  const currentEmpCode = employeeData?.employeeCode || employeeData?.id || '';
  const currentEmpId = employeeData?.id || employeeData?.employeeCode || '';

  // Access real-time sync context safely
  let realtimeSync;
  try {
    realtimeSync = useRealtimeSync();
  } catch {
    realtimeSync = null;
  }

  const isOnline = realtimeSync ? realtimeSync.isOnline : navigator.onLine;

  const [showFullDayModal, setShowFullDayModal] = useState<boolean>(false);
  const [currentTimeTick, setCurrentTimeTick] = useState<number>(Date.now());

  // Dynamic ticking to handle midnight transitions/clock ticking
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeTick(Date.now());
    }, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setCurrentTimeTick(Date.now());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Compute Today's events dynamically & reactively
  const { events, currentStatus } = useMemo(() => {
    const now = new Date();
    const todayKolkataYmd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    // 1. Fetch Today's Attendance for current employee
    const allAttendance = realtimeSync?.attendance?.length ? realtimeSync.attendance : getStoredAttendanceRecords();
    const todayRecord = allAttendance.find(
      a => a.date === todayKolkataYmd && 
           (a.employeeId === currentEmpCode || a.employeeId === currentEmpId)
    ) || (currentEmpCode ? getTodayAttendanceRecord(currentEmpCode, todayKolkataYmd) : null);

    const compiledEvents: TimelineEventItem[] = [];

    // --- ATTENDANCE EVENTS ---
    if (todayRecord && (todayRecord.employeeId === currentEmpCode || todayRecord.employeeId === currentEmpId || !todayRecord.employeeId)) {
      // Check-In
      if (todayRecord.checkInTime && todayRecord.checkInTime !== '--:--') {
        const timeMs = parseTimeStringToMs(todayRecord.checkInTime, now);
        let title = '✓ Arrived at Office';
        let desc = todayRecord.checkInMode === 'AUTO' ? 'Automatic check-in recorded' : 'Office attendance started';
        let badge = 'Check-In';

        if (todayRecord.attendanceType === 'WFH') {
          title = '🏠 WFH Started';
          desc = todayRecord.reason || 'Working from home session started';
          badge = 'WFH';
        } else if (todayRecord.attendanceType === 'CLIENT_VISIT') {
          title = '🏢 Client Visit Started';
          desc = todayRecord.clientName ? `Client: ${todayRecord.clientName}` : 'Client visit attendance active';
          badge = 'Client Visit';
        } else if (todayRecord.attendanceType === 'OUTDOOR') {
          title = '🚗 Outdoor Work Started';
          desc = 'Field / Outdoor work session active';
          badge = 'Outdoor Work';
        }

        compiledEvents.push({
          id: `att-checkin-${todayRecord.docId || todayRecord.id}`,
          category: 'ATTENDANCE',
          timeStr: todayRecord.checkInTime,
          timeMs,
          title,
          description: desc,
          badgeLabel: badge,
          badgeStyle: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          icon: CheckCircle2,
          iconBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
        });
      }

      // Office Exit / Geofence Exit
      const exitTime = todayRecord.lastExitTime || todayRecord.exitTime;
      if (exitTime && exitTime !== '--:--') {
        const timeMs = parseTimeStringToMs(exitTime, now);
        compiledEvents.push({
          id: `att-exit-${todayRecord.docId || todayRecord.id}`,
          category: 'ATTENDANCE',
          timeStr: exitTime,
          timeMs: timeMs + 10, // slight offset to order after checkin if times match
          title: '🚪 Office Exit Detected',
          description: 'Stepped outside office 25m perimeter',
          badgeLabel: 'Geofence Exit',
          badgeStyle: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          icon: MapPin,
          iconBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        });
      }

      // Geofence Return
      if (todayRecord.returnTime && todayRecord.returnTime !== '--:--') {
        const timeMs = parseTimeStringToMs(todayRecord.returnTime, now);
        compiledEvents.push({
          id: `att-return-${todayRecord.docId || todayRecord.id}`,
          category: 'ATTENDANCE',
          timeStr: todayRecord.returnTime,
          timeMs: timeMs + 20,
          title: '🏢 Returned to Office',
          description: 'Re-entered office 25m perimeter',
          badgeLabel: 'Geofence Return',
          badgeStyle: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
          icon: MapPin,
          iconBg: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
        });
      }

      // Check-Out
      if (todayRecord.checkOutTime && todayRecord.checkOutTime !== '--:--') {
        const timeMs = parseTimeStringToMs(todayRecord.checkOutTime, now);
        compiledEvents.push({
          id: `att-checkout-${todayRecord.docId || todayRecord.id}`,
          category: 'ATTENDANCE',
          timeStr: todayRecord.checkOutTime,
          timeMs: timeMs + 30,
          title: '✓ Workday Completed',
          description: todayRecord.checkOutMode === 'AUTO_SYSTEM' ? 'Automatic checkout recorded' : 'Checkout recorded',
          badgeLabel: 'Check-Out',
          badgeStyle: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
          icon: LogOut,
          iconBg: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
        });
      }
    }

    // --- TASK EVENTS ---
    const allTasks = realtimeSync?.tasks?.length ? realtimeSync.tasks : getStoredTasks();
    const myTasks = allTasks.filter(t => 
      (t.assignedToEmployeeCodes && t.assignedToEmployeeCodes.includes(currentEmpCode)) ||
      (t.assignedToEmployeeIds && t.assignedToEmployeeIds.includes(currentEmpId)) ||
      (t.createdBy === currentEmpCode || t.createdBy === currentEmpId)
    );

    myTasks.forEach(task => {
      // Task completed today
      if (task.status === 'COMPLETED') {
        const completedIso = task.completedAt || task.lastModifiedAt || task.startDate;
        const completionDateKolkata = getKolkataDateFromIso(completedIso);
        
        if (completionDateKolkata === todayKolkataYmd) {
          const timeStr = formatIsoToTimeStr(completedIso) || 'Today';
          const timeMs = completedIso ? new Date(completedIso).getTime() : now.getTime();
          
          compiledEvents.push({
            id: `task-comp-${task.id}`,
            category: 'TASK',
            timeStr,
            timeMs,
            title: '📋 Task Completed',
            description: task.title,
            badgeLabel: 'Completed',
            badgeStyle: 'bg-[#7C3AED]/20 text-purple-200 border-purple-500/30',
            icon: CheckSquare,
            iconBg: 'bg-[#7C3AED]/30 text-purple-300 border-purple-500/30'
          });
        }
      } else if (task.completionPercentage > 0 || task.status === 'IN_PROGRESS') {
        // Task progress updated today
        const updatedIso = task.lastModifiedAt || task.startDate;
        const updatedDateKolkata = getKolkataDateFromIso(updatedIso);

        if (updatedDateKolkata === todayKolkataYmd) {
          const timeStr = formatIsoToTimeStr(updatedIso) || 'Today';
          const timeMs = updatedIso ? new Date(updatedIso).getTime() : now.getTime() - 3600000;

          compiledEvents.push({
            id: `task-[#7C3AED]-${task.id}`,
            category: 'TASK',
            timeStr,
            timeMs,
            title: '📋 Task Updated',
            description: `${task.title} (${task.completionPercentage || 50}% progress)`,
            badgeLabel: 'In Progress',
            badgeStyle: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
            icon: Briefcase,
            iconBg: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
          });
        }
      } else if (task.dueDate) {
        // Task due today
        const dueDateKolkata = getKolkataDateFromIso(task.dueDate);
        if (dueDateKolkata === todayKolkataYmd) {
          compiledEvents.push({
            id: `task-due-${task.id}`,
            category: 'TASK',
            timeStr: task.dueTime || 'Today',
            timeMs: parseTimeStringToMs(task.dueTime || '10:00 AM', now),
            title: '📋 Task Due Today',
            description: task.title,
            badgeLabel: 'Assigned',
            badgeStyle: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
            icon: Briefcase,
            iconBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
          });
        }
      }
    });



    // --- LEAVE EVENTS ---
    const allLeaves = realtimeSync?.leaves?.length ? realtimeSync.leaves : getStoredLeaves();
    const myLeaves = allLeaves.filter(l => 
      (l.employeeCode === currentEmpCode || l.employeeId === currentEmpId || (l as any).userId === currentEmpId) &&
      (l.status === 'Approved' || l.status === 'Pending')
    );

    myLeaves.forEach(leave => {
      if (leave.startDate <= todayKolkataYmd && leave.endDate >= todayKolkataYmd) {
        compiledEvents.push({
          id: `leave-${leave.id}`,
          category: 'LEAVE',
          timeStr: 'All Day',
          timeMs: now.getTime() - 7200000,
          title: '📅 Leave Active',
          description: `${leave.type} Leave (${leave.status})`,
          badgeLabel: 'Leave',
          badgeStyle: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          icon: Calendar,
          iconBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        });
      }
    });

    // Sort events chronologically (earliest first)
    compiledEvents.sort((a, b) => a.timeMs - b.timeMs);

    // Determine current status indicator
    let statusText = 'Not Checked In';
    let statusSubtext = 'Workday hasn\'t started yet';
    let statusBadgeColor = 'bg-gray-500/15 text-gray-300 border-gray-500/30';

    if (myLeaves.some(l => l.startDate <= todayKolkataYmd && l.endDate >= todayKolkataYmd && l.status === 'Approved')) {
      statusText = 'On Leave';
      statusSubtext = 'Approved leave active today';
      statusBadgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    } else if (todayRecord?.checkOutTime && todayRecord.checkOutTime !== '--:--') {
      statusText = 'Workday Completed';
      statusSubtext = `Checked out at ${todayRecord.checkOutTime}`;
      statusBadgeColor = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    } else if (todayRecord?.checkInTime && todayRecord.checkInTime !== '--:--') {
      if (todayRecord.attendanceType === 'WFH') {
        statusText = 'WFH Active';
        statusSubtext = 'Working from home';
        statusBadgeColor = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      } else if (todayRecord.attendanceType === 'CLIENT_VISIT') {
        statusText = 'Client Visit';
        statusSubtext = todayRecord.clientName ? `Client: ${todayRecord.clientName}` : 'On-site visit';
        statusBadgeColor = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      } else {
        statusText = 'Working';
        statusSubtext = `Checked in at ${todayRecord.checkInTime}`;
        statusBadgeColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      }
    }

    return {
      events: compiledEvents,
      currentStatus: {
        text: statusText,
        subtext: statusSubtext,
        badgeColor: statusBadgeColor
      }
    };
  }, [realtimeSync, currentEmpCode, currentEmpId, currentTimeTick]);

  const displayedEvents = events.slice(0, 5);
  const hasMore = events.length > 5;

  return (
    <>
      <Card className="p-4 bg-[#102D28] border border-[#1D4840] shadow-md relative overflow-hidden">
        {/* Section Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#1D4840]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#0B2420] border border-[#1D4840] flex items-center justify-center text-[#18C7A0]">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-black text-[#F5FFFC] uppercase tracking-wider">MY DAY</h2>
              <p className="text-[10px] text-[#A8C7C0] font-medium">Today's Timeline</p>
            </div>
          </div>

          {/* Current Status Badge */}
          <div className="flex items-center gap-2">
            {!isOnline && (
              <span className="text-[9px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 rounded-full border border-[#F59E0B]/20 flex items-center gap-1">
                <WifiOff className="w-2.5 h-2.5" /> Offline
              </span>
            )}
            <div className="text-right">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${currentStatus.badgeColor}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {currentStatus.text}
              </span>
            </div>
          </div>
        </div>

        {/* Timeline Event List or Empty State */}
        {events.length > 0 ? (
          <div className="relative pl-5 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#1D4840]">
            {displayedEvents.map((evt) => {
              const IconComp = evt.icon;
              return (
                <div key={evt.id} className="relative flex items-start gap-3">
                  {/* Event Marker */}
                  <div className={`absolute -left-5 top-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] shadow ring-4 ring-[#102D28] ${evt.iconBg}`}>
                    <IconComp className="w-2.5 h-2.5" />
                  </div>

                  {/* Event Card Content */}
                  <div className="flex-1 bg-[#0B2420] p-2.5 rounded-xl border border-[#1D4840] flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-black text-[#F5FFFC] truncate">{evt.title}</span>
                      </div>
                      <p className="text-[10px] text-[#A8C7C0] leading-relaxed truncate">{evt.description}</p>
                    </div>

                    <div className="flex flex-col items-end shrink-0 text-right">
                      <span className="text-[10px] font-bold text-[#A8C7C0]">{evt.timeStr}</span>
                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border mt-1 ${evt.badgeStyle}`}>
                        {evt.badgeLabel}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="py-6 px-4 text-center bg-[#0B2420] rounded-2xl border border-dashed border-[#1D4840]">
            <Sparkles className="w-6 h-6 text-[#18C7A0] mx-auto mb-2" />
            <p className="text-xs font-bold text-[#F5FFFC] mb-0.5">Your workday hasn't started yet</p>
            <p className="text-[11px] text-[#A8C7C0]">No attendance or activity recorded today.</p>
          </div>
        )}

        {/* View Full Day Link */}
        {hasMore && (
          <div className="mt-3 pt-2 border-t border-[#1D4840] text-center">
            <button
              onClick={() => setShowFullDayModal(true)}
              className="text-xs font-bold text-[#18C7A0] hover:text-[#35E0B9] transition flex items-center justify-center gap-1 mx-auto"
            >
              <span>View Full Day ({events.length} Events) &rarr;</span>
            </button>
          </div>
        )}
      </Card>

      {/* Full Day Timeline Modal */}
      <AnimatePresence>
        {showFullDayModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#071A17]/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowFullDayModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-[#0B2420] border border-[#1D4840] rounded-3xl p-5 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#1D4840] mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#102D28] border border-[#1D4840] flex items-center justify-center text-[#18C7A0]">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-[#F5FFFC]">Full Day Timeline</h3>
                    <p className="text-[10px] text-[#A8C7C0]">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowFullDayModal(false)}
                  className="p-1.5 rounded-full bg-[#102D28] border border-[#1D4840] text-[#A8C7C0] hover:text-[#F5FFFC] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Event List */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-4 relative pl-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#1D4840]">
                {events.map((evt) => {
                  const IconComp = evt.icon;
                  return (
                    <div key={evt.id} className="relative flex items-start gap-3">
                      <div className={`absolute -left-5 top-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] shadow ring-4 ring-[#0B2420] ${evt.iconBg}`}>
                        <IconComp className="w-2.5 h-2.5" />
                      </div>

                      <div className="flex-1 bg-[#102D28] p-3 rounded-xl border border-[#1D4840] flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-black text-[#F5FFFC]">{evt.title}</p>
                          <p className="text-[11px] text-[#A8C7C0] mt-0.5">{evt.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-bold text-[#A8C7C0]">{evt.timeStr}</span>
                          <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border block mt-1 ${evt.badgeStyle}`}>
                            {evt.badgeLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div className="pt-3 mt-4 border-t border-[#1D4840] text-center">
                <button
                  onClick={() => setShowFullDayModal(false)}
                  className="w-full py-2.5 bg-[#18C7A0] hover:bg-[#0E9F82] text-[#071A17] font-extrabold text-xs rounded-xl transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
