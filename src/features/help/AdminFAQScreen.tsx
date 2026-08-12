import React, { useState } from 'react';
import { HelpCircle, Search, ChevronDown, ArrowLeft } from 'lucide-react';
import { Card } from '../../components/ui/Card';

const adminFaqData = [
  {
    category: 'EMPLOYEE MANAGEMENT',
    questions: [
      {
        q: 'How do I approve a new employee/device registration?',
        a: 'Open Pending Device Approvals, review the registration and select Approve. The employee app should receive the approval through the normal sync process.'
      },
      {
        q: 'What happens after approving a device?',
        a: 'The employee\'s pending registration becomes approved/active according to the existing system, and the employee can access the dashboard.'
      },
      {
        q: 'Can I delete an employee?',
        a: 'Employee deletion is a Super Admin-only operation. Admin users should not have access to the destructive employee deletion functions.'
      }
    ]
  },
  {
    category: 'DEVICE APPROVAL',
    questions: [
      {
        q: 'Why is a pending device not appearing?',
        a: 'Check the registration status, synchronization status and the Admin Panel\'s Pending Device Approvals section.'
      },
      {
        q: 'Does device ID determine the employee\'s identity?',
        a: 'No. The employee\'s registered mobile number is the persistent account identity. Device information may be retained for security and management purposes.'
      }
    ]
  },
  {
    category: 'ATTENDANCE',
    questions: [
      {
        q: 'Can Admin correct attendance?',
        a: 'Authorized Admin users can review and correct attendance using the existing Attendance Correction functionality.'
      },
      {
        q: 'Does leaving the 25-meter geofence immediately check an employee out?',
        a: 'No. A temporary exit must not immediately finalize automatic checkout. The system must determine the employee\'s genuine final exit according to the configured attendance logic.'
      },
      {
        q: 'What timestamp should automatic checkout use?',
        a: 'The actual final exit timestamp, not synchronization time, app reopening time, or an artificial 6:00 PM timestamp.'
      }
    ]
  },
  {
    category: 'ATTENDANCE CORRECTION',
    questions: [
      {
        q: 'Why is a corrected attendance record not immediately visible in the employee app?',
        a: 'Verify that the correction was saved to the authoritative backend and that the employee app has synchronized the updated attendance record.'
      },
      {
        q: 'Are attendance corrections logged?',
        a: 'Important administrative changes should appear in the Super Admin Audit Log with the administrator, timestamp, action and relevant before/after information.'
      }
    ]
  },
  {
    category: 'NOTIFICATIONS',
    questions: [
      {
        q: 'Can Admin see all employee notifications?',
        a: 'Use the existing notification management permissions. Employee notifications should remain correctly associated with their intended employee.'
      },
      {
        q: 'Why should notifications not appear on the employee dashboard?',
        a: 'Notifications belong in the notification bell/notification center. Keeping them separate prevents duplicate information and keeps the dashboard clean.'
      }
    ]
  },
  {
    category: 'SYNC',
    questions: [
      {
        q: 'Why is an employee\'s latest attendance not appearing?',
        a: 'Check:\n- backend record\n- sync status\n- employee account identity\n- network connectivity\n- last successful sync time\n\nDo not manually create duplicate attendance records as a workaround.'
      }
    ]
  },
  {
    category: 'SUPER ADMIN',
    questions: [
      {
        q: 'Who can view the Audit Log?',
        a: 'Only Super Admin.'
      },
      {
        q: 'Who can completely delete an employee?',
        a: 'Only Super Admin.'
      },
      {
        q: 'Can Admin modify Super Admin permissions?',
        a: 'No. Super Admin-only permissions must remain protected by backend authorization.'
      }
    ]
  }
];

interface AdminFAQScreenProps {
  onBack?: () => void;
}

export const AdminFAQScreen: React.FC<AdminFAQScreenProps> = ({ onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleAccordion = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const filteredData = adminFaqData.map(section => ({
    ...section,
    questions: section.questions.filter(q => 
      q.q.toLowerCase().includes(searchTerm.toLowerCase()) || 
      q.a.toLowerCase().includes(searchTerm.toLowerCase()) ||
      section.category.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(section => section.questions.length > 0);

  return (
    <div className="w-full bg-[#1D113B] rounded-[24px] border border-purple-500/10 overflow-hidden flex flex-col h-[calc(100vh-140px)]">
      <div className="p-5 border-b border-purple-500/10 flex items-center gap-3 sticky top-0 bg-[#1D113B] z-10">
        {onBack && (
          <button 
            onClick={onBack}
            className="p-1.5 rounded-full bg-purple-500/10 text-purple-300 hover:text-white hover:bg-purple-500/20 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-lg font-black text-white">Admin Help & FAQ</h2>
          <p className="text-xs text-purple-300 mt-1">Information and guides for administrators</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-purple-500/20 scrollbar-track-transparent">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
            <input 
              type="text" 
              placeholder="Search admin FAQs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#2D1B5A]/80 border border-purple-500/30 rounded-2xl py-3 pl-10 pr-4 text-sm text-white placeholder-purple-300 focus:outline-none focus:border-purple-500 transition-colors shadow-sm"
            />
          </div>

          {filteredData.length === 0 ? (
            <div className="text-center py-12">
              <HelpCircle className="w-12 h-12 text-purple-500/40 mx-auto mb-4" />
              <p className="text-sm font-bold text-purple-200">No matching admin FAQs found</p>
              <p className="text-xs text-purple-400 mt-1">Try searching with different keywords</p>
            </div>
          ) : (
            <div className="space-y-8">
              {filteredData.map((section, idx) => (
                <div key={idx} className="space-y-3">
                  <h3 className="text-xs font-black tracking-wider text-purple-300 uppercase px-1">
                    {section.category}
                  </h3>
                  <div className="space-y-2">
                    {section.questions.map((item, qIdx) => {
                      const id = `${idx}-${qIdx}`;
                      const isExpanded = expandedId === id;
                      return (
                        <Card 
                          key={qIdx}
                          className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'border-purple-500/50 bg-[#2D1B5A]/90' : 'border-purple-500/20 bg-[#2D1B5A]/40'}`}
                        >
                          <button 
                            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left"
                            onClick={() => toggleAccordion(id)}
                          >
                            <span className={`text-sm font-bold ${isExpanded ? 'text-white' : 'text-purple-100'}`}>
                              {item.q}
                            </span>
                            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-purple-300' : 'text-purple-500'}`} />
                          </button>
                          {isExpanded && (
                            <div className="px-5 pb-5 pt-1">
                              <p className="text-xs leading-relaxed text-purple-200/90 whitespace-pre-wrap">
                                {item.a}
                              </p>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
