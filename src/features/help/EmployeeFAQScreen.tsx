import React, { useState } from 'react';
import { HelpCircle, Search, ChevronDown, MessageSquare, ArrowLeft } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { useNavigate } from 'react-router-dom';

const employeeFaqData = [
  {
    category: 'GETTING STARTED',
    questions: [
      {
        q: 'How do I start using EXFIN OMS?',
        a: 'Register your mobile number/device when required. Once your registration is approved, the app will automatically restore your employee account and open the dashboard.'
      },
      {
        q: 'I reinstalled the app. Do I need to register again?',
        a: 'If your mobile number already belongs to an approved employee account, enter the same registered mobile number to restore your existing account. A new registration is not required.'
      },
      {
        q: 'What happens if I use a different mobile number?',
        a: 'The system will not restore another employee\'s account. You will need to follow the normal registration process.'
      }
    ]
  },
  {
    category: 'ATTENDANCE',
    questions: [
      {
        q: 'How does automatic check-in work?',
        a: 'When you enter the configured 25-meter office geofence for the first time on a day and you have not already checked in, the automatic check-in process starts immediately.'
      },
      {
        q: 'Is there a 10-second waiting period for automatic check-in?',
        a: 'No. Automatic check-in starts as soon as a reliable location update confirms that you have entered the office geofence.'
      },
      {
        q: 'Can I have more than one automatic check-in in a day?',
        a: 'No. Once today\'s attendance has a valid check-in, additional location updates will not create another check-in.'
      }
    ]
  },
  {
    category: 'AUTOMATIC CHECKOUT',
    questions: [
      {
        q: 'Does leaving the 25-meter area immediately check me out?',
        a: 'No. Leaving the geofence creates a pending exit state. It does NOT immediately create an automatic checkout.'
      },
      {
        q: 'What happens if I leave the office temporarily?',
        a: 'Your attendance remains open. If you return, the temporary exit is cancelled and your attendance continues.'
      },
      {
        q: 'When does automatic checkout happen?',
        a: 'Automatic checkout is finalized only when the system determines that the employee\'s final exit for the attendance day has been established.'
      },
      {
        q: 'What time is recorded for automatic checkout?',
        a: 'The actual final exit time is used. The system does not replace it with 6:00 PM, synchronization time, or app reopening time.'
      },
      {
        q: 'What if I leave and return several times?',
        a: 'Earlier temporary exits are discarded. The latest genuine final exit is used when automatic checkout is finalized.'
      }
    ]
  },
  {
    category: 'GEOFENCE',
    questions: [
      {
        q: 'What is the office geofence?',
        a: 'The office attendance geofence is a 25-meter radius around the configured office location.'
      },
      {
        q: 'Why is my automatic attendance not starting?',
        a: 'Make sure:\n- Location services are enabled.\n- The app has the required location permission.\n- You are actually within the office geofence.\n- The device has a reliable GPS/location signal.\n- Today\'s attendance has not already been checked in.'
      },
      {
        q: 'Does the geofence affect manual checkout?',
        a: 'Follow the current EXFIN OMS attendance rules shown in the app. The geofence is primarily used for automatic attendance detection and the configured checkout rules.'
      }
    ]
  },
  {
    category: 'WFH',
    questions: [
      {
        q: 'How do I use WFH?',
        a: 'Select WFH from the Attendance section and submit the WFH attendance according to the company\'s configured rules.'
      },
      {
        q: 'How many WFH days can I use?',
        a: 'The app will enforce the currently configured monthly WFH limit.'
      }
    ]
  },
  {
    category: 'CLIENT VISIT',
    questions: [
      {
        q: 'How do I record a client visit?',
        a: 'Select Client Visit and provide the required client name and location. Submit the visit through the Attendance section.'
      }
    ]
  },
  {
    category: 'LEAVE',
    questions: [
      {
        q: 'How many leaves are available?',
        a: 'EXFIN OMS uses the configured company leave policy. The current system uses the leave year from 1 April to 31 March.'
      },
      {
        q: 'Where can I apply for leave?',
        a: 'Open the Leave section and select the required date using the calendar.'
      }
    ]
  },
  {
    category: 'EXPENSES',
    questions: [
      {
        q: 'How do I submit an expense?',
        a: 'Open Expenses, select the appropriate category, enter the required details and submit the expense.'
      },
      {
        q: 'What currency is used?',
        a: 'EXFIN OMS uses Indian Rupees (₹) where applicable.'
      }
    ]
  },
  {
    category: 'NOTIFICATIONS',
    questions: [
      {
        q: 'Where can I see my notifications?',
        a: 'Use the notification bell. Notifications are kept separate from the dashboard timeline.'
      },
      {
        q: 'Why don\'t I see another employee\'s notifications?',
        a: 'Notifications are employee-specific. You should only receive notifications intended for your account.'
      },
      {
        q: 'Why did I receive a notification immediately?',
        a: 'EXFIN OMS can provide push notifications and notification alerts so important updates can be noticed promptly.'
      }
    ]
  },
  {
    category: 'SYNC & DATA',
    questions: [
      {
        q: 'Why does the app say "Unable to sync"?',
        a: 'Check your internet connection and keep the app open briefly while synchronization retries. If the problem continues, contact your administrator.'
      },
      {
        q: 'Will my attendance be lost if I am offline?',
        a: 'The app is designed to support offline-first attendance/data handling. Locally recorded data can synchronize when connectivity returns.'
      },
      {
        q: 'Why is my latest data not visible?',
        a: 'The app may still be synchronizing with the server. Allow synchronization to complete and try again.'
      }
    ]
  },
  {
    category: 'ACCOUNT & DEVICE',
    questions: [
      {
        q: 'What happens if I change my phone?',
        a: 'Use your registered mobile number to restore your approved employee account. Device identity should not be used as the employee\'s permanent identity.'
      },
      {
        q: 'What happens if I uninstall the app?',
        a: 'Your server-side employee data remains. Reinstall the app and use your registered mobile number to restore the account if the account is still approved and active.'
      }
    ]
  },
  {
    category: 'TROUBLESHOOTING',
    questions: [
      {
        q: 'The app is showing the wrong employee profile. What should I do?',
        a: 'Do not continue using the account. Sign out/restore using the correct registered mobile number and contact your administrator if the problem continues.'
      },
      {
        q: 'GPS is inaccurate. What should I do?',
        a: 'Make sure location services are enabled, location permission is granted, and the device has a clear GPS signal.'
      },
      {
        q: 'My attendance is incorrect.',
        a: 'Contact your administrator. Authorized administrators can review and correct attendance according to company policy.'
      }
    ]
  }
];

export const EmployeeFAQScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleAccordion = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const filteredData = employeeFaqData.map(section => ({
    ...section,
    questions: section.questions.filter(q => 
      q.q.toLowerCase().includes(searchTerm.toLowerCase()) || 
      q.a.toLowerCase().includes(searchTerm.toLowerCase()) ||
      section.category.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(section => section.questions.length > 0);

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="bg-[#1D113B]/90 backdrop-blur-md border-b border-purple-500/10 sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-full bg-purple-500/10 text-purple-300 hover:text-white hover:bg-purple-500/20 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-sm font-black text-white">Help & FAQ</h1>
            <p className="text-[10px] text-purple-300">Find quick answers about using EXFIN OMS</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-6 max-w-2xl space-y-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
          <input 
            type="text" 
            placeholder="Search FAQs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#2D1B5A]/80 border border-purple-500/30 rounded-2xl py-3 pl-10 pr-4 text-sm text-white placeholder-purple-300 focus:outline-none focus:border-purple-500 transition-colors shadow-sm"
          />
        </div>

        {filteredData.length === 0 ? (
          <div className="text-center py-10">
            <HelpCircle className="w-10 h-10 text-purple-500/40 mx-auto mb-3" />
            <p className="text-sm font-bold text-purple-200">No matching FAQs found</p>
            <p className="text-xs text-purple-400 mt-1">Try searching with different keywords</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredData.map((section, idx) => (
              <div key={idx} className="space-y-3">
                <h3 className="text-[11px] font-black tracking-wider text-purple-300 uppercase px-1">
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
                          className="w-full px-4 py-3.5 flex items-center justify-between gap-4 text-left"
                          onClick={() => toggleAccordion(id)}
                        >
                          <span className={`text-xs font-bold ${isExpanded ? 'text-white' : 'text-purple-100'}`}>
                            {item.q}
                          </span>
                          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-purple-300' : 'text-purple-500'}`} />
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1">
                            <p className="text-[11px] leading-relaxed text-purple-200/90 whitespace-pre-wrap">
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

        <div className="mt-8 pt-6 border-t border-purple-500/20 text-center space-y-3 pb-8">
          <div className="w-10 h-10 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto">
            <MessageSquare className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white mb-1">Still need help?</h4>
            <p className="text-[11px] text-purple-300">Contact your administrator</p>
          </div>
        </div>
      </div>
    </div>
  );
};
