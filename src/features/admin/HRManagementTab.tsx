import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  Briefcase,
  Users,
  Calendar,
  FileText,
  Building,
  TrendingUp,
  Clock,
  Search,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export interface HREmployeeRecord {
  id: string;
  employeeCode: string;
  name: string;
  mobileNumber?: string;
  office?: string;
  role: string;
  status: string;
  registrationDate?: string;
}

export const HRManagementTab: React.FC = () => {
  const [employees, setEmployees] = useState<HREmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(collection(db, 'registrations'), (snapshot) => {
      const emps: HREmployeeRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          employeeCode: data.employeeCode || docSnap.id,
          name: data.name || 'Unnamed Employee',
          mobileNumber: data.mobileNumber || 'N/A',
          office: data.office || 'Raniganj',
          role: data.role || (data.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE'),
          status: data.status || 'Approved',
          registrationDate: data.registrationDate || '',
        };
      });
      setEmployees(emps);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const departments = Array.from(new Set(employees.map((e) => e.office || 'Raniganj')));

  const filteredEmployees = employees.filter((e) => {
    const matchesSearch =
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.mobileNumber && e.mobileNumber.includes(searchTerm));

    const matchesDept = deptFilter === 'ALL' || e.office === deptFilter;

    return matchesSearch && matchesDept;
  });

  const activeCount = employees.filter((e) => e.status === 'Approved').length;
  const pendingCount = employees.filter((e) => e.status === 'Pending Approval').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-black text-white">HR Management Hub</h2>
          </div>
          <p className="text-purple-300/70 text-xs sm:text-sm mt-1">
            Human Resources directory, employee profile tracking, department oversight, and policy monitoring.
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 glass-card border-purple-500/20 flex items-center gap-3">
          <div className="p-3 bg-purple-500/20 rounded-xl text-purple-300">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] text-purple-300/60 uppercase font-bold">Total Staff</div>
            <div className="text-xl font-black text-white">{employees.length}</div>
          </div>
        </Card>

        <Card className="p-4 glass-card border-purple-500/20 flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-300">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] text-purple-300/60 uppercase font-bold">Active Staff</div>
            <div className="text-xl font-black text-emerald-400">{activeCount}</div>
          </div>
        </Card>

        <Card className="p-4 glass-card border-purple-500/20 flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 rounded-xl text-amber-300">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] text-purple-300/60 uppercase font-bold">Pending Approvals</div>
            <div className="text-xl font-black text-amber-400">{pendingCount}</div>
          </div>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="p-4 glass-card border-purple-500/20 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-purple-300/50" />
          <input
            type="text"
            placeholder="Search employee by name, code, mobile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 glass-inner-tile border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-400"
          />
        </div>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 glass-inner-tile border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-purple-400"
        >
          <option value="ALL">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Card>

      {/* Directory Table */}
      <Card className="p-0 overflow-hidden glass-card border-purple-500/20">
        {loading ? (
          <div className="p-8 text-center text-purple-300/60 text-xs">Loading HR employee directory...</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-8 text-center text-purple-300/60 text-xs">No employee records match the search query.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="glass-inner-tile text-purple-200 text-xs font-bold uppercase tracking-wider border-b border-purple-500/20">
                  <th className="p-3">Employee Code</th>
                  <th className="p-3">Full Name</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Mobile</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10 text-xs">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-3 font-mono font-bold text-purple-300">{emp.employeeCode}</td>
                    <td className="p-3 font-bold text-white">{emp.name}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {emp.role}
                      </span>
                    </td>
                    <td className="p-3 text-purple-200">{emp.office || 'Raniganj'}</td>
                    <td className="p-3 text-purple-200">{emp.mobileNumber || 'N/A'}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          emp.status === 'Approved'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {emp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
