import React, { useState, useMemo } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import { AttendanceRecord, AttendanceType } from '../../types/attendance';
import {
  getKolkataDateStr,
  getKolkataTimeStr,
  getRecordWorkingMinutes,
  formatMinutesToDuration,
  calculateMonthlySummary,
  parseDurationToMinutes,
} from '../../utils/workHoursCalc';
import {
  Calendar as CalendarIcon,
  Clock,
  Briefcase,
  User,
  Activity,
  FileText,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Download,
  CheckCircle,
  X,
  AlertTriangle,
  MapPin,
  Laptop,
  Users,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { jsPDF } from 'jspdf';
import { Button } from '../../components/ui/Button';

export const WorkHoursScreen: React.FC = () => {
  const { employeeData } = useRegistration();
  const { attendance = [] } = useRealtimeSync();

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const today = getKolkataDateStr();
    return today.substring(0, 7); // "YYYY-MM"
  });

  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);

  // Generate a list of select-able months (last 12 months)
  const monthOptions = useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const val = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).substring(0, 7);
      const label = d.toLocaleDateString('en-US', {
        timeZone: 'Asia/Kolkata',
        month: 'long',
        year: 'numeric',
      });
      list.push({ val, label });
    }
    return list;
  }, []);

  const todayStr = getKolkataDateStr();

  // Filter attendance records for selected month
  const monthlyRecords = useMemo(() => {
    return attendance
      .filter((r) => r.date.startsWith(selectedMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, selectedMonth]);

  // Compute stats
  const stats = useMemo(() => {
    return calculateMonthlySummary(attendance, selectedMonth);
  }, [attendance, selectedMonth]);

  const isFutureMonth = useMemo(() => {
    const todayMonth = todayStr.substring(0, 7);
    return selectedMonth > todayMonth;
  }, [selectedMonth, todayStr]);

  // Helper to determine record status & details
  const getRecordStatusDetails = (rec: AttendanceRecord) => {
    const hasCheckout = !!(
      rec.checkOutTime &&
      rec.checkOutTime !== '--:--' &&
      rec.checkOutTime !== 'Pending' &&
      rec.checkOutTime !== 'N/A' &&
      rec.checkOutTime !== 'UNRESOLVED'
    );
    const isCompleted = hasCheckout && rec.checkoutStatus !== 'UNRESOLVED' && rec.checkoutStatus !== 'PENDING_ADMIN_REVIEW';
    const isToday = rec.date === todayStr;
    const calcMins = getRecordWorkingMinutes(rec);
    
    if (rec.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
      return {
        label: 'Pending Review',
        colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        dotClass: 'bg-amber-400',
        checkoutText: `Proposed: ${rec.employeeProposedCheckoutTime || 'Pending'}`,
        duration: 'PENDING REVIEW',
      };
    } else if (rec.checkoutStatus === 'UNRESOLVED' || (!isCompleted && !isToday)) {
      return {
        label: 'Unresolved',
        colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        dotClass: 'bg-rose-400',
        checkoutText: 'UNRESOLVED',
        duration: 'UNRESOLVED',
      };
    } else if (isCompleted) {
      return {
        label: 'Completed',
        colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        dotClass: 'bg-emerald-400',
        checkoutText: rec.checkOutTime,
        duration: formatMinutesToDuration(calcMins),
      };
    } else if (isToday) {
      return {
        label: 'In Progress',
        colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20 animate-pulse',
        dotClass: 'bg-amber-400',
        checkoutText: 'In Progress',
        duration: formatMinutesToDuration(calcMins),
      };
    } else {
      return {
        label: 'Unresolved',
        colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        dotClass: 'bg-rose-400',
        checkoutText: 'UNRESOLVED',
        duration: 'UNRESOLVED',
      };
    }
  };

  // Calendar calculations
  const calendarDays = useMemo(() => {
    const year = parseInt(selectedMonth.split('-')[0], 10);
    const month = parseInt(selectedMonth.split('-')[1], 10) - 1; // 0-indexed
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startingDayOfWeek = firstDay.getDay(); // 0 is Sunday
    const totalDays = lastDay.getDate();
    
    const daysArray = [];
    
    // Fill leading empty spots
    for (let i = 0; i < startingDayOfWeek; i++) {
      daysArray.push(null);
    }
    
    // Fill actual days of the month
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      const record = attendance.find((r) => r.date === dateStr);
      daysArray.push({ day, dateStr, record });
    }
    
    return daysArray;
  }, [selectedMonth, attendance]);

  // Handle detailed modal open
  const handleDayTap = (record: AttendanceRecord | undefined) => {
    if (record) {
      setSelectedRecord(record);
      setShowDetailModal(true);
    }
  };

  // Get Source String
  const getAttendanceSource = (rec: AttendanceRecord) => {
    if (rec.isAdminRectified || rec.manualRectified) {
      return 'Admin Corrected';
    }
    if (rec.checkInMode === 'AUTO') {
      return 'Automatic Attendance';
    }
    return 'Manual Attendance';
  };

  // Export high-quality PDF Report
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const primaryColor = [21, 21, 21]; // #151515
      const accentColor = [212, 175, 55]; // #D4AF37
      const textGray = [138, 138, 138];

      // Draw Top Header Bar
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(15, 15, 180, 26, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('Office Management System', 22, 26);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(180, 255, 220);
      doc.text('OFFICIAL EMPLOYEE WORK HOURS REPORT', 22, 33);

      // Meta Data
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`Report Month: ${selectedMonth}`, 145, 26);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 145, 32);

      // Employee Info Grid
      doc.setFillColor(245, 245, 250);
      doc.rect(15, 47, 180, 20, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(50, 50, 50);
      doc.text('EMPLOYEE DETAILS', 20, 53);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Name: ${employeeData?.name || 'N/A'}`, 20, 61);
      doc.text(`Code: ${employeeData?.employeeCode || employeeData?.id || 'N/A'}`, 100, 61);

      // Summary Grid
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('MONTHLY SUMMARY STATS', 15, 78);

      doc.setDrawColor(220, 220, 220);
      doc.line(15, 80, 195, 80);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text(`Working Days: ${stats.workingDays}`, 15, 87);
      doc.text(`Total Work Hours: ${formatMinutesToDuration(stats.totalMinutes)}`, 80, 87);
      doc.text(`Average Work Hours/Day: ${formatMinutesToDuration(stats.averageMinutesPerDay)}`, 140, 87);

      // Mode Breakdown table
      doc.text(`Office Days: ${stats.officeDays} (${formatMinutesToDuration(stats.officeMinutes)})`, 15, 93);
      doc.text(`WFH Days: ${stats.wfhDays} (${formatMinutesToDuration(stats.wfhMinutes)})`, 80, 93);
      doc.text(`Client Visit Days: ${stats.clientDays} (${formatMinutesToDuration(stats.clientMinutes)})`, 140, 93);

      // Daily Details Table Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('DAILY WORK HOURS LOGS', 15, 105);
      doc.line(15, 107, 195, 107);

      // Draw table columns
      doc.setFillColor(235, 235, 245);
      doc.rect(15, 110, 180, 7.5, 'F');
      
      doc.setFontSize(8.5);
      doc.setTextColor(50, 50, 50);
      doc.text('Date', 18, 115);
      doc.text('Attendance Mode', 45, 115);
      doc.text('Check-in', 90, 115);
      doc.text('Check-out', 125, 115);
      doc.text('Work Duration', 160, 115);

      let yPos = 122;
      monthlyRecords.forEach((r) => {
        if (yPos > 275) {
          doc.addPage();
          yPos = 20;
          // Re-draw small header
          doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          doc.rect(15, 10, 180, 10, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10);
          doc.text(`Office Management System Work Hours Log — Page 2`, 20, 16.5);
          yPos = 30;
        }

        const details = getRecordStatusDetails(r);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(textGray[0], textGray[1], textGray[2]);
        doc.text(r.date, 18, yPos);
        doc.text(r.attendanceType || 'OFFICE', 45, yPos);
        doc.text(r.checkInTime || '--:--', 90, yPos);
        doc.text(details.checkoutText || '--:--', 125, yPos);
        doc.text(details.duration, 160, yPos);

        yPos += 7;
      });

      doc.save(`Work_Hours_Report_${selectedMonth}_${employeeData?.employeeCode || 'EMP'}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
      alert('Failed to export PDF. Please try again.');
    }
  };

  // Chart Data preparation
  const chartData = useMemo(() => {
    // Collect completed work hours for the current month
    const list = [...monthlyRecords]
      .filter((r) => !!(r.checkOutTime && r.checkOutTime !== '--:--'))
      .map((r) => {
        const mins = getRecordWorkingMinutes(r);
        const hours = parseFloat((mins / 60).toFixed(1));
        return {
          day: parseInt(r.date.split('-')[2], 10),
          hours,
        };
      })
      .sort((a, b) => a.day - b.day);
    return list;
  }, [monthlyRecords]);

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="glass-card-elevated p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-[var(--success)]" /> WORK HOURS
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">
            Authoritative attendance hours analysis & breakdown
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="flex-1 sm:flex-none text-xs font-bold text-[var(--text-primary)] bg-[var(--surface-inner)] border border-[var(--border)] rounded-2xl px-3.5 py-2.5 outline-none cursor-pointer focus:border-[var(--success)] transition-all shadow-md"
          >
            {monthOptions.map((opt) => (
              <option key={opt.val} value={opt.val} className="bg-[var(--surface-elevated)] text-[var(--text-primary)]">
                {opt.label}
              </option>
            ))}
          </select>

          <Button
            onClick={handleExportPDF}
            disabled={isFutureMonth || monthlyRecords.length === 0}
            className="w-full sm:w-auto text-xs py-2.5 bg-[var(--button-primary)] hover:opacity-95 font-bold rounded-2xl flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all text-white border border-[var(--border)]"
          >
            <Download className="w-4 h-4" /> Export PDF
          </Button>
        </div>
      </div>

      {isFutureMonth ? (
        <div className="glass-card-elevated p-8 text-center text-[var(--text-secondary)]">
          <AlertTriangle className="w-8 h-8 text-[var(--warning)] mx-auto mb-2 animate-bounce" />
          <p className="text-sm font-bold">Future month selected. No work hour metrics have been generated yet.</p>
        </div>
      ) : (
        <>
          {/* STATS OVERVIEW SECTION */}
          <div>
            <h2 className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3">
              MONTHLY METRIC AGGREGATORS
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="glass-card-elevated p-4 space-y-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-[var(--success)]/10 rounded-bl-full group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black text-[var(--success)] uppercase tracking-wider block">
                  TOTAL HOURS
                </span>
                <span className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight block">
                  {formatMinutesToDuration(stats.totalMinutes)}
                </span>
                <p className="text-[10px] text-[var(--text-secondary)] font-medium">Cumulative work logged</p>
              </div>

              <div className="glass-card-elevated p-4 space-y-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-[var(--cyan)]/10 rounded-bl-full group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black text-[var(--cyan)] uppercase tracking-wider block">
                  WORKING DAYS
                </span>
                <span className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight block">
                  {stats.workingDays}
                </span>
                <p className="text-[10px] text-[var(--text-secondary)] font-medium">Active attendances</p>
              </div>

              <div className="glass-card-elevated p-4 space-y-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-[var(--teal)]/10 rounded-bl-full group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black text-[var(--teal)] uppercase tracking-wider block">
                  AVERAGE HOURS
                </span>
                <span className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight block">
                  {formatMinutesToDuration(stats.averageMinutesPerDay)}
                </span>
                <p className="text-[10px] text-[var(--text-secondary)] font-medium">Hours per day logged</p>
              </div>

              <div className="glass-card-elevated p-4 space-y-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-teal-500/10 rounded-bl-full group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black text-teal-400 uppercase tracking-wider block">
                  BREAKDOWN
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[9.5px] font-bold text-[var(--text-secondary)] pt-1">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                    <span>Office: {stats.officeDays}d</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal)]" />
                    <span>WFH: {stats.wfhDays}d</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)]" />
                    <span>Client: {stats.clientDays}d</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Outdoor: {stats.outdoorDays}d</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DYNAMIC COMPACT HISTOGRAM CHART */}
          {chartData.length > 0 && (
            <div>
              <h2 className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[var(--success)]" /> Completed Daily Hours Chart
              </h2>
              <div className="glass-card-elevated p-4">
                <div className="h-44 w-full flex items-end gap-1.5">
                  {chartData.map((d, index) => {
                    const heightPercent = Math.min(100, Math.max(8, (d.hours / 12) * 100));
                    return (
                      <div key={index} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                        <div className="absolute bottom-full mb-1 bg-[var(--surface-inner)] border border-[var(--border)] text-[8.5px] font-bold text-[var(--text-primary)] px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                          {d.hours} hrs
                        </div>
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-[var(--button-primary)] rounded-t-sm hover:opacity-90 transition-all cursor-pointer border-t border-[var(--border)]"
                        />
                        <span className="text-[8.5px] font-bold text-[var(--text-secondary)] mt-1.5">
                          {d.day}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* MONTHLY CALENDAR VIEW */}
          <div>
            <h2 className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <CalendarIcon className="w-4 h-4 text-[var(--success)]" /> Monthly Attendance Board
            </h2>
            <div className="glass-card-elevated p-4">
              {/* Calendar Grid Header */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-2">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((item, idx) => {
                  if (!item) {
                    return <div key={`empty-${idx}`} className="aspect-square bg-[var(--surface-inner)]/20 rounded-xl" />;
                  }

                  const { day, record } = item;
                  let bgClass = 'bg-[var(--surface-inner)]/40 text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--success)]/30';
                  
                  if (record) {
                    const isCompleted = !!(record.checkOutTime && record.checkOutTime !== '--:--');
                    const isToday = record.date === todayStr;

                    if (isToday && !isCompleted) {
                      bgClass = 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/20'; // Yellow: In Progress
                    } else {
                      switch (record.attendanceType) {
                        case 'OFFICE':
                          bgClass = 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25';
                          break;
                        case 'WFH':
                          bgClass = 'bg-[var(--teal)]/15 border-[var(--teal)]/30 text-[var(--teal)] hover:bg-[var(--teal)]/25';
                          break;
                        case 'CLIENT_VISIT':
                          bgClass = 'bg-[var(--cyan)]/15 border-[var(--cyan)]/30 text-[var(--cyan)] hover:bg-[var(--cyan)]/25';
                          break;
                        case 'OUTDOOR':
                          bgClass = 'bg-teal-500/15 border-teal-500/30 text-teal-300 hover:bg-teal-500/25';
                          break;
                      }
                    }
                  }

                  return (
                    <button
                      key={`day-${day}`}
                      onClick={() => handleDayTap(record)}
                      disabled={!record}
                      className={`aspect-square rounded-xl p-1.5 font-bold flex flex-col justify-between items-center transition-all ${bgClass}`}
                    >
                      <span className="text-xs">{day}</span>
                      {record && (
                        <span className="text-[7.5px] tracking-tight uppercase leading-none scale-90 font-extrabold truncate w-full text-center">
                          {record.attendanceType === 'CLIENT_VISIT' ? 'Client' : record.attendanceType.toLowerCase()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend Indicator */}
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-3 border-t border-[var(--border)] text-[9.5px] font-bold text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500/40 border border-emerald-500/50" />
                  <span>Office</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[var(--teal)]/40 border border-[var(--teal)]/50" />
                  <span>WFH</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[var(--cyan)]/40 border border-[var(--cyan)]/50" />
                  <span>Client Visit</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-teal-500/40 border border-teal-500/50" />
                  <span>Outdoor</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-yellow-500/20 border border-yellow-500/30 animate-pulse" />
                  <span>In Progress</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[var(--surface-inner)] border border-[var(--border)]" />
                  <span>No Log</span>
                </div>
              </div>
            </div>
          </div>

          {/* MODE BREAKDOWN DETAILED PANEL */}
          <div>
            <h2 className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3">
              WORK TYPE INSIGHTS
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl glass-card-elevated flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-[var(--text-primary)]">OFFICE WORK</h3>
                    <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5">{stats.officeDays} Active Days</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-[var(--text-primary)] block">{formatMinutesToDuration(stats.officeMinutes)}</span>
                  <span className="text-[9px] text-emerald-400 uppercase font-black tracking-wider">
                    Avg {stats.officeDays > 0 ? formatMinutesToDuration(Math.round(stats.officeMinutes / stats.officeDays)) : '0h'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl glass-card-elevated flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--teal)]/15 border border-[var(--teal)]/20 flex items-center justify-center text-[var(--teal)]">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-[var(--text-primary)]">WORK FROM HOME</h3>
                    <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5">{stats.wfhDays} Active Days</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-[var(--text-primary)] block">{formatMinutesToDuration(stats.wfhMinutes)}</span>
                  <span className="text-[9px] text-[var(--teal)] uppercase font-black tracking-wider">
                    Avg {stats.wfhDays > 0 ? formatMinutesToDuration(Math.round(stats.wfhMinutes / stats.wfhDays)) : '0h'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl glass-card-elevated flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--cyan)]/15 border border-[var(--cyan)]/20 flex items-center justify-center text-[var(--cyan)]">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-[var(--text-primary)]">CLIENT VISIT</h3>
                    <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5">{stats.clientDays} Active Days</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-[var(--text-primary)] block">{formatMinutesToDuration(stats.clientMinutes)}</span>
                  <span className="text-[9px] text-[var(--cyan)] uppercase font-black tracking-wider">
                    Avg {stats.clientDays > 0 ? formatMinutesToDuration(Math.round(stats.clientMinutes / stats.clientDays)) : '0h'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl glass-card-elevated flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/20 flex items-center justify-center text-teal-400">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-[var(--text-primary)]">OUTDOOR WORK</h3>
                    <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5">{stats.outdoorDays} Active Days</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-[var(--text-primary)] block">{formatMinutesToDuration(stats.outdoorMinutes)}</span>
                  <span className="text-[9px] text-teal-400 uppercase font-black tracking-wider">
                    Avg {stats.outdoorDays > 0 ? formatMinutesToDuration(Math.round(stats.outdoorMinutes / stats.outdoorDays)) : '0h'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* HISTORICAL RECORDS LIST */}
          <div>
            <h2 className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3">
              DAILY WORK TIMELINE
            </h2>
            <div className="flex flex-col gap-2.5">
              {monthlyRecords.length > 0 ? (
                monthlyRecords.map((r) => {
                  const details = getRecordStatusDetails(r);
                  return (
                    <button
                      key={r.id || r.docId || r.date}
                      onClick={() => handleDayTap(r)}
                      className="p-4 rounded-2xl glass-card-elevated flex items-center justify-between text-left hover:border-[var(--success)]/40 transition-all cursor-pointer group"
                    >
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-[var(--success)] block uppercase">
                          {r.date}
                        </span>
                        <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                          {r.attendanceType}
                        </h4>
                        <div className="flex gap-3 text-[10px] text-[var(--text-secondary)] font-semibold">
                          <span>In: {r.checkInTime}</span>
                          <span>•</span>
                          <span>Out: {details.checkoutText}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-xs font-black text-[var(--text-primary)] block group-hover:text-[var(--success)] transition-colors">
                            {details.duration}
                          </span>
                          <span className="text-[8.5px] font-black tracking-wider uppercase text-[var(--text-muted)] block mt-0.5">
                            {getAttendanceSource(r)}
                          </span>
                        </div>
                        <span className={`px-2.5 py-0.5 text-[8.5px] font-black uppercase rounded-full border ${details.colorClass}`}>
                          {details.label}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="glass-card-elevated p-8 text-center text-[var(--text-secondary)]">
                  <p className="text-xs font-semibold">No attendance work-hour records are available for this month.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* DETAILED DAILY WORK HOURS MODAL */}
      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-card-elevated border border-[var(--border)] rounded-[28px] max-w-sm w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => {
                setShowDetailModal(false);
                setSelectedRecord(null);
              }}
              className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-1.5 pb-2 border-b border-[var(--border)]">
              <span className="text-[10px] font-black text-[var(--success)] uppercase tracking-widest">
                DAILY ATTENDANCE DETAIL
              </span>
              <h3 className="text-base font-black text-[var(--text-primary)]">{selectedRecord.date}</h3>
            </div>

            <div className="space-y-3 text-xs font-semibold">
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/50">
                <span className="text-[var(--text-secondary)]">Attendance Mode</span>
                <span className="text-[var(--text-primary)] font-black uppercase">{selectedRecord.attendanceType}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/50">
                <span className="text-[var(--text-secondary)]">Check-in</span>
                <span className="text-[var(--text-primary)] font-black">{selectedRecord.checkInTime}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/50">
                <span className="text-[var(--text-secondary)]">Check-out</span>
                <span className="text-[var(--text-primary)] font-black">{selectedRecord.checkOutTime || 'In Progress'}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/50">
                <span className="text-[var(--text-secondary)]">Total Work Hours</span>
                <span className="text-[var(--success)] font-black">
                  {getRecordStatusDetails(selectedRecord).duration}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/50">
                <span className="text-[var(--text-secondary)]">Attendance Source</span>
                <span className="text-[var(--text-primary)] font-black">
                  {getAttendanceSource(selectedRecord)}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/50">
                <span className="text-[var(--text-secondary)]">Tracking Distance</span>
                <span className="text-[var(--text-primary)] font-black">
                  {Math.round(selectedRecord.distance)} meters from office
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/50">
                <span className="text-[var(--text-secondary)]">Status</span>
                <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase ${getRecordStatusDetails(selectedRecord).colorClass}`}>
                  {getRecordStatusDetails(selectedRecord).label}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setShowDetailModal(false);
                setSelectedRecord(null);
              }}
              className="w-full py-3.5 bg-[var(--button-primary)] text-white font-bold rounded-2xl text-xs transition-all shadow-lg active:scale-95 border border-[var(--border)] cursor-pointer"
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
